use futures::FutureExt;
use std::io::SeekFrom;
use std::ops::Range;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt, Result};
use tokio_stream::Stream;

pub struct SequentialRangesStream<'a, F>
where
    F: AsyncSeek + AsyncRead + Unpin + Send,
{
    reader: &'a mut F,
    ranges: Vec<Range<usize>>,
    chunk_size: usize,
    offset: usize,
    range_pos: usize,
    total: usize,
    transmitted: usize,
    finished: bool,
}

impl<'a, F> SequentialRangesStream<'a, F>
where
    F: AsyncSeek + AsyncRead + Unpin + Send,
{
    pub fn new(reader: &'a mut F, ranges: Vec<Range<usize>>) -> Self {
        Self::new_with_chunk_size(reader, ranges, 4 * 1024 * 1024)
    }
    pub fn new_with_chunk_size(
        reader: &'a mut F,
        ranges: Vec<Range<usize>>,
        chunk_size: usize,
    ) -> Self {
        let total = ranges
            .iter()
            .fold(0, |a, b| a + b.end.saturating_sub(b.start));
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
            finished: false,
        }
    }
    async fn _next_chunk(&mut self) -> Result<Vec<u8>> {
        let range = &self.ranges[self.range_pos];
        if self.offset == 0 {
            self.reader
                .seek(SeekFrom::Start(range.start as u64))
                .await?;
        }
        let chunk_size = (self.total - self.transmitted).min(self.chunk_size);
        let range_size = (range.len() - self.offset).min(self.chunk_size);
        // println!(
        //     "chunk size = {}, range size = {}, pos = {}/{}@{}",
        //     chunk_size,
        //     range_size,
        //     self.offset,
        //     range.len(),
        //     self.range_pos
        // );
        let buf = if range_size < chunk_size {
            let mut buf1 = vec![0u8; range_size];
            self.reader.read_exact(&mut buf1).await?;
            let mut remaining = chunk_size - range_size;
            while remaining > 0 {
                self.range_pos += 1;
                if self.range_pos < self.ranges.len() {
                    let range = &self.ranges[self.range_pos];
                    self.reader
                        .seek(SeekFrom::Start(range.start as u64))
                        .await?;
                    let size = remaining.min(range.len());
                    let mut buf2 = vec![0u8; size];
                    self.offset = size;
                    self.reader.read_exact(&mut buf2).await?;
                    buf1.extend(buf2);
                    remaining -= size;
                } else {
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
        if range.len() == self.offset {
            self.range_pos += 1;
            self.offset = 0;
        }
        if self.range_pos >= self.ranges.len() {
            self.finished = true;
        }
        // println!("transmitted = {}/{}", self.transmitted, self.total);
        Ok(buf)
    }
    async fn next_chunk(&mut self) -> Result<Vec<u8>> {
        match self._next_chunk().await {
            Ok(chunk) => Ok(chunk),
            Err(err) => {
                self.finished = true;
                Err(err)
            }
        }
    }
}

impl<'a, F> Stream for SequentialRangesStream<'a, F>
where
    F: AsyncSeek + AsyncRead + Unpin + Send,
{
    type Item = Result<Vec<u8>>;
    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.finished {
            return Poll::Ready(None);
        }
        let self_mut = self.get_mut();
        let mut next = self_mut.next_chunk().boxed();
        match next.as_mut().poll(cx) {
            Poll::Ready(Ok(val)) => Poll::Ready(Some(Ok(val))),
            Poll::Ready(Err(err)) => Poll::Ready(Some(Err(err))),
            Poll::Pending => Poll::Pending,
        }
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        (self.transmitted, Some(self.total))
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
        let mut cursor = std::io::Cursor::new(data);
        let mut stream = SequentialRangesStream::new_with_chunk_size(
            &mut cursor,
            vec![
                Range { start: 4, end: 8 },
                Range { start: 10, end: 14 },
                Range { start: 0, end: 4 },
            ],
            7,
        );
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
        let mut cursor = std::io::Cursor::new(data);
        let mut stream = SequentialRangesStream::new_with_chunk_size(
            &mut cursor,
            vec![
                Range { start: 6, end: 10 },
                Range { start: 1, end: 5 },
                Range { start: 14, end: 18 },
            ],
            6,
        );
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
        let mut cursor = std::io::Cursor::new(data);
        let ranges = vec![
            Range { start: 3, end: 7 },
            Range { start: 15, end: 20 },
            Range { start: 25, end: 29 },
        ];
        let mut stream =
            SequentialRangesStream::new_with_chunk_size(&mut cursor, ranges.clone(), 5);
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
        let mut cursor = std::io::Cursor::new(data);
        let ranges = vec![
            Range { start: 3, end: 6 },
            Range { start: 15, end: 20 },
            Range { start: 8, end: 10 },
        ];
        // 使用不同的范围和较小的 chunk_size
        let mut stream =
            SequentialRangesStream::new_with_chunk_size(&mut cursor, ranges.clone(), 4);

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
        let mut cursor = std::io::Cursor::new(data);
        let mut stream = SequentialRangesStream::new_with_chunk_size(
            &mut cursor,
            vec![Range { start: 30, end: 50 }],
            6,
        );
        while let Some(chunk) = stream.next().await {
            assert!(matches!(chunk, Err(tokio::io::Error { .. })))
        }
    }
}
