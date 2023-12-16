use std::io::SeekFrom;
use std::ops::Range;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt, Result};
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

pub struct SequentialRangesReader<F>
where
    F: AsyncSeek + AsyncRead + Unpin + Send + 'static,
{
    reader: F,
    ranges: Vec<Range<usize>>,
    chunk_size: usize,
    offset: usize,
    range_pos: usize,
    total: usize,
    transmitted: usize,
    boundaries: Option<Vec<Vec<u8>>>,
}

#[derive(Debug)]
pub struct ByteRangeBoundaryBuilder {
    id: String,
    content_type: String,
}

impl ByteRangeBoundaryBuilder {
    pub fn new(content_type: String) -> Self {
        let id = Uuid::new_v4().to_string().replace('-', "")[0..20].to_string();
        Self { id, content_type }
    }
    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn format_to_bytes(&self, range: &Range<usize>, total: u64) -> Vec<u8> {
        format!(
            "\r\n--{id}\r\nContent-Type: {content_type}\r\nContent-Range: bytes {start}-{end}/{total}\r\n\r\n",
            id = self.id,
            content_type = self.content_type,
            start = range.start,
            end = range.end - 1,
            total = total
        )
            .as_bytes()
            .to_vec()
    }
    pub fn end_to_bytes(&self) -> Vec<u8> {
        format!("\r\n--{}--\r\n", self.id).as_bytes().to_vec()
    }
}

impl<F> SequentialRangesReader<F>
where
    F: AsyncSeek + AsyncRead + Unpin + Send + 'static,
{
    pub fn new(reader: F, ranges: Vec<Range<usize>>, boundaries: Option<Vec<Vec<u8>>>) -> Self {
        // println!("ranges = {:?}", ranges);
        Self::new_with_chunk_size(reader, ranges, boundaries, 4 * 1024 * 1024)
    }
    pub fn new_with_chunk_size(
        reader: F,
        ranges: Vec<Range<usize>>,
        boundaries: Option<Vec<Vec<u8>>>,
        chunk_size: usize,
    ) -> Self {
        let total = ranges
            .iter()
            .fold(0, |a, b| a + b.end.saturating_sub(b.start))
            + boundaries
                .as_ref()
                .map(|it| it.iter().fold(0, |a, b| a + b.len()))
                .unwrap_or(0);
        if chunk_size == 0 {
            panic!("chunk size cannot be 0 as it would lead to an infinite loop.")
        }
        Self {
            reader,
            ranges,
            chunk_size,
            offset: 0,
            range_pos: 0,
            transmitted: 0,
            total,
            boundaries,
        }
    }
    fn next_boundary(&mut self) -> Option<Vec<u8>> {
        if let Some(boundaries) = self.boundaries.as_mut() {
            let boundary = &mut boundaries[self.range_pos];
            if boundary.is_empty() {
                return None;
            }
            let size = self.chunk_size.min(boundary.len());
            // println!("boundary {} 写入 {}", boundary.len(), size);
            Some(boundary.drain(0..size).collect::<Vec<_>>())
        } else {
            None
        }
    }
    fn end_boundary(&mut self) -> Option<Vec<u8>> {
        if let Some(mut boundaries) = self.boundaries.take() {
            boundaries.pop()
        } else {
            None
        }
    }
    fn cur_range(&self) -> &Range<usize> {
        &self.ranges[self.range_pos]
    }
    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>> {
        if self.transmitted == self.total {
            return Ok(None);
        }
        let mut remaining = self.chunk_size;
        let mut buf0: Option<Vec<u8>> = None;
        if self.offset == 0 {
            if let Some(buf) = self.next_boundary() {
                remaining -= buf.len();
                if remaining == 0 {
                    return Ok(Some(buf));
                }
                buf0 = Some(buf);
            }
            self.reader
                .seek(SeekFrom::Start(self.cur_range().start as u64))
                .await?;
        }
        let chunk_size = (self.total - self.transmitted).min(remaining);
        let range_size = (self.cur_range().len() - self.offset).min(remaining);
        // println!(
        //     "[{}] chunk size = {}, range size = {}, pos = {}/{}@{}",
        //     self.count,
        //     chunk_size,
        //     range_size,
        //     self.offset,
        //     range.len(),
        //     self.range_pos
        // );
        let buf1 = if range_size < chunk_size {
            let mut buf1 = vec![0u8; range_size];
            self.reader.read_exact(&mut buf1).await?;
            let mut remaining = chunk_size - range_size;
            while remaining > 0 {
                self.range_pos += 1;
                // write boundary.
                if let Some(buf2) = self.next_boundary() {
                    remaining -= buf2.len();
                    buf1.extend(buf2)
                }
                // write content.
                {
                    let range = &self.ranges[self.range_pos];
                    self.reader
                        .seek(SeekFrom::Start(range.start as u64))
                        .await?;
                    let mut buf2 = vec![0u8; remaining.min(range.len())];
                    self.reader.read_exact(&mut buf2).await?;
                    remaining -= buf2.len();
                    self.offset = buf2.len();
                    buf1.extend(buf2);
                }
                if self.range_pos + 1 == self.ranges.len() {
                    break;
                }
            }
            buf1
        } else {
            let mut buf = vec![0u8; chunk_size];
            self.reader.read_exact(&mut buf).await?;
            self.offset += chunk_size;
            buf
        };
        self.transmitted += chunk_size;
        if self.cur_range().len() == self.offset {
            self.range_pos += 1;
            self.offset = 0;
        }
        // println!("transmitted = {}/{}", self.transmitted, self.total);
        if let Some(buf0) = buf0 {
            Ok(Some(
                buf0.into_iter().chain(buf1.into_iter()).collect::<Vec<_>>(),
            ))
        } else {
            Ok(Some(buf1))
        }
    }
    pub fn into_stream(self) -> ReceiverStream<Result<Vec<u8>>> {
        let (tx, rx) = tokio::sync::mpsc::channel(4);
        tokio::spawn(async move {
            let mut this = self;
            while let Some(chunk) = this.next_chunk().await.transpose() {
                if let Err(err) = chunk {
                    tracing::warn!(reason = err.to_string(), "chunk is an error");
                    if let Err(err) = tx.send(Err(err)).await {
                        tracing::warn!(
                            reason = err.to_string(),
                            "failed to send error chunk, exiting"
                        );
                    }
                    return;
                } else if let Err(err) = tx.send(chunk).await {
                    tracing::warn!(reason = err.to_string(), "chunk is discarded");
                    return;
                }
            }
            if let Some(boundary) = this.end_boundary() {
                if let Err(err) = tx.send(Ok(boundary)).await {
                    tracing::warn!(reason = err.to_string(), "end boundary is discarded")
                };
            };
        });
        ReceiverStream::new(rx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ops::Range;
    use tokio_stream::StreamExt;

    #[tokio::test]
    async fn it_works() {
        let data = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        ];
        let cursor = std::io::Cursor::new(data);
        let mut stream = SequentialRangesReader::new_with_chunk_size(
            cursor,
            vec![
                Range { start: 4, end: 8 },
                Range { start: 10, end: 14 },
                Range { start: 0, end: 4 },
            ],
            None,
            7,
        )
        .into_stream();
        let mut chunks = Vec::new();
        while let Some(chunk) = stream.next().await {
            chunks.push(chunk.unwrap());
        }
        assert_eq!(
            chunks,
            vec![vec![5, 6, 7, 8, 11, 12, 13], vec![14, 1, 2, 3, 4]]
        );
    }

    #[tokio::test]
    async fn test_sequential_ranges_stream() {
        let data = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        ];
        let cursor = std::io::Cursor::new(data);
        let mut stream = SequentialRangesReader::new_with_chunk_size(
            cursor,
            vec![
                Range { start: 6, end: 10 },
                Range { start: 1, end: 5 },
                Range { start: 14, end: 18 },
            ],
            None,
            6,
        )
        .into_stream();
        let mut chunks = Vec::new();
        while let Some(chunk) = stream.next().await {
            chunks.push(chunk.unwrap());
        }
        assert_eq!(
            chunks,
            vec![vec![7, 8, 9, 10, 2, 3], vec![4, 5, 15, 16, 17, 18]]
        );
    }

    #[tokio::test]
    async fn test_sequential_ranges_stream_different_length() {
        let data = [
            21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
            43, 44, 45, 46, 47, 48, 49, 50,
        ];
        let cursor = std::io::Cursor::new(data);
        let ranges = vec![
            Range { start: 3, end: 7 },
            Range { start: 15, end: 20 },
            Range { start: 25, end: 29 },
        ];
        let mut stream =
            SequentialRangesReader::new_with_chunk_size(cursor, ranges.clone(), None, 5)
                .into_stream();
        let mut chunks = Vec::new();
        while let Some(chunk) = stream.next().await {
            chunks.push(chunk.unwrap());
        }
        assert_eq!(
            chunks.into_iter().flatten().collect::<Vec<_>>(),
            ranges
                .into_iter()
                .flat_map(|range| data[range].to_vec())
                .collect::<Vec<_>>()
        );
    }

    #[tokio::test]
    async fn test_different_sequential_ranges_stream() {
        // 更改数据长度和内容
        let data = [
            21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
            43, 44, 45,
        ];
        let cursor = std::io::Cursor::new(data);
        let ranges = vec![
            Range { start: 3, end: 6 },
            Range { start: 15, end: 20 },
            Range { start: 8, end: 10 },
        ];
        // 使用不同的范围和较小的 chunk_size
        let mut stream =
            SequentialRangesReader::new_with_chunk_size(cursor, ranges.clone(), None, 4)
                .into_stream();

        let mut chunks = Vec::new();
        while let Some(chunk) = stream.next().await {
            chunks.push(chunk.unwrap());
        }
        assert_eq!(
            chunks.into_iter().flatten().collect::<Vec<_>>(),
            ranges
                .into_iter()
                .flat_map(|range| data[range].to_vec())
                .collect::<Vec<_>>()
        );
    }

    #[tokio::test]
    async fn test_sequential_ranges_stream_failure() {
        let data = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        ];
        let cursor = std::io::Cursor::new(data);
        let mut stream = SequentialRangesReader::new_with_chunk_size(
            cursor,
            vec![Range { start: 30, end: 50 }],
            None,
            6,
        )
        .into_stream();
        while let Some(chunk) = stream.next().await {
            assert!(matches!(chunk, Err(tokio::io::Error { .. })))
        }
    }

    #[test]
    fn test_b() {
        let b = ByteRangeBoundaryBuilder::new("text/html".to_string());
        println!(
            "{:?}",
            String::from_utf8(b.format_to_bytes(&Range { start: 0, end: 50 }, 1270))
        );
    }
}
