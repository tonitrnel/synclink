use futures::Stream;
use pin_project_lite::pin_project;
use std::future::Future;
use std::io::SeekFrom;
use std::ops::{Index, Range};
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt, Result};
use uuid::Uuid;

#[derive(Debug)]
pub struct Boundaries {
    inner: Vec<u8>,
    heads: Vec<(usize, usize)>,
}
impl Boundaries {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: Vec::with_capacity(capacity * 192),
            heads: Vec::with_capacity(capacity),
        }
    }
    pub fn push(&mut self, value: &[u8]) {
        let start = self.inner.len();
        self.inner.extend_from_slice(value);
        self.heads.push((start, value.len()));
    }
    pub fn len(&self) -> usize {
        self.inner.len()
    }
    pub fn get(&self, index: usize) -> Option<&[u8]> {
        if let Some(&(start, len)) = self.heads.get(index) {
            Some(&self.inner[start..start + len])
        } else {
            None
        }
    }
    pub fn read(&self, index: usize, buf: &mut [u8]) -> usize {
        let boundary = &self[index];
        let boundary_length = boundary.len();
        if buf.len() < boundary_length {
            panic!("Buffer size is too small for the boundary length.");
        }
        buf[0..boundary_length].copy_from_slice(boundary);
        boundary_length
    }
}
impl Index<usize> for Boundaries {
    type Output = [u8];
    fn index(&self, index: usize) -> &Self::Output {
        self.get(index).unwrap_or_else(|| {
            panic!(
                "Index out of bounds: the len is {} but the index is {}",
                self.heads.len(),
                index
            )
        })
    }
}

#[derive(Debug)]
pub struct BoundaryBuilder {
    id: String,
    content_type: String,
    // Breakdown:
    // 256 字节通常能满足 boundary 字符串的 bytes.
    // 静态文本: 共 49 个字符占用 49 bytes
    // UUID: 占用 36 bytes，但是替换流 "-" 和只截取前 20 位，因此占有 20 bytes
    // mimetype: 最大 255 字符，但目前最长的只有 84 字符即 84 bytes
    // 3 个 u64 数值: 3 * 20 = 60 bytes
    // 总计：213 bytes
    buffer: [u8; 256],
}

impl BoundaryBuilder {
    pub fn new(content_type: String) -> Self {
        let id = Uuid::new_v4().to_string().replace('-', "")[0..20].to_string();
        Self {
            id,
            content_type,
            buffer: [0; 256],
        }
    }
    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn format_to_bytes(&mut self, range: &Range<usize>, total: u64) -> &[u8] {
        let str= format!(
            "\r\n--{id}\r\nContent-Type: {content_type}\r\nContent-Range: bytes {start}-{end}/{total}\r\n\r\n",
            id = self.id,
            content_type = self.content_type,
            start = range.start,
            end = range.end - 1,
            total = total
        );
        let bytes = str.as_bytes();
        let len = bytes.len();
        self.buffer[0..len].copy_from_slice(bytes);
        &self.buffer[0..len]
    }
    pub fn end_to_bytes(&mut self) -> &[u8] {
        let str = format!("\r\n--{}--\r\n", self.id);
        let bytes = str.as_bytes();
        self.buffer.copy_from_slice(bytes);
        &self.buffer[0..bytes.len()]
    }
}

#[derive(Debug)]
pub struct SparseStreamReader<R> {
    source: R,
    ranges: Vec<Range<usize>>,
    buffer: Vec<u8>,
    offset: usize, // 当前范围的偏移
    range_pos: usize,
    total: usize,
    transmitted: usize,
    boundaries: Option<Boundaries>,
}

impl<R> SparseStreamReader<R>
where
    R: AsyncSeek + AsyncRead + Unpin + Send + 'static,
{
    pub fn new(reader: R, ranges: Vec<Range<usize>>, boundaries: Option<Boundaries>) -> Self {
        // println!("ranges = {:?}", ranges);
        Self::new_with_chunk_size(reader, ranges, boundaries, 4 * 1024 * 1024)
    }
    pub fn new_with_chunk_size(
        reader: R,
        ranges: Vec<Range<usize>>,
        boundaries: Option<Boundaries>,
        buffer_size: usize,
    ) -> Self {
        let total = ranges
            .iter()
            .fold(0, |a, b| a + b.end.saturating_sub(b.start))
            + boundaries.as_ref().map(|it| it.len()).unwrap_or(0);
        if buffer_size == 0 {
            panic!("buffer size cannot be 0 as it would lead to an infinite loop.")
        }
        Self {
            source: reader,
            ranges,
            buffer: vec![0; buffer_size],
            offset: 0,
            range_pos: 0,
            transmitted: 0,
            total,
            boundaries,
        }
    }
    /// 获取当前的范围
    fn range(&self) -> &Range<usize> {
        &self.ranges[self.range_pos]
    }
    /// 读取下一个 chunk
    async fn next_chunk(&mut self) -> Result<Option<Vec<u8>>> {
        // 所以数据已经传输完毕
        if self.transmitted == self.total {
            return Ok(None);
        }
        let buffer_size = self.buffer.capacity();
        let mut written_bytes = 0;
        if self.offset == 0 {
            if let Some(boundaries) = &self.boundaries {
                written_bytes += boundaries.read(self.range_pos, &mut self.buffer[0..])
            }
            // buffer 没有空间，直接返回了，理论不会触发
            if written_bytes == buffer_size {
                return Ok(Some(self.buffer[0..written_bytes].to_vec()));
            }
            // 调整指针到当前 range 的开始位置
            self.source
                .seek(SeekFrom::Start(self.range().start as u64))
                .await?;
        }

        let available_buffer_space = buffer_size - written_bytes;
        // 计算总共还剩多少未传输，最大为当前 buffer 容量
        let remaining_total = (self.total - self.transmitted).min(available_buffer_space);
        // 计算当前范围还是多少未传输，最大为当前 buffer 容量
        let remaining_in_range = (self.range().len() - self.offset).min(available_buffer_space);

        // println!(
        //     "[{}] chunk size = {}, range size = {}, pos = {}/{}@{}",
        //     self.count,
        //     chunk_size,
        //     range_size,
        //     self.offset,
        //     range.len(),
        //     self.range_pos
        // );
        // 当前范围需要传输数据量小于本次总共可传输的数据
        if remaining_in_range < remaining_total {
            written_bytes += self
                .source
                .read_exact(&mut self.buffer[written_bytes..written_bytes + remaining_in_range])
                .await?;
            // todo: 为什么这里这么计算？
            let mut remaining = remaining_total - remaining_in_range;
            // buf 还未填满，填充下个范围的内容
            while remaining > 0 {
                self.range_pos += 1;
                // write next boundary.
                if let Some(boundaries) = &self.boundaries {
                    // 你没资格啊你没资格，正因为如此你没资格啊你没资格 ：）
                    // 可用空间少于 256 字节，由于 boundary 未实现分割故无法写入，
                    // 这里只能先返回当前已写入的 buffer
                    if remaining < 256 {
                        break;
                    }
                    let boundary_length =
                        boundaries.read(self.range_pos, &mut self.buffer[written_bytes..]);
                    written_bytes += boundary_length;
                    remaining -= boundary_length;
                }
                // write content.
                {
                    let range = &self.ranges[self.range_pos];
                    self.source
                        .seek(SeekFrom::Start(range.start as u64))
                        .await?;
                    let available_buffer_space = remaining.min(range.len());
                    let content_length = self
                        .source
                        .read_exact(
                            &mut self.buffer[written_bytes..written_bytes + available_buffer_space],
                        )
                        .await?;
                    written_bytes += content_length;
                    remaining -= content_length;
                    self.offset = content_length;
                }
                if self.range_pos + 1 == self.ranges.len() {
                    break;
                }
            }
        } else {
            written_bytes += self
                .source
                .read_exact(&mut self.buffer[written_bytes..written_bytes + remaining_total])
                .await?;
            self.offset += remaining_total;
        };
        self.transmitted += written_bytes;
        if self.range().len() == self.offset {
            self.range_pos += 1;
            self.offset = 0;
        }
        // println!("transmitted = {}/{}", self.transmitted, self.total);
        Ok(Some(self.buffer[0..written_bytes].to_vec()))
    }
    pub fn into_stream(self) -> SparseStream<R> {
        SparseStream {
            inner: self,
            is_terminated: false,
        }
    }
}

pin_project! {
    #[derive(Debug)]
    pub struct SparseStream<R> {
        #[pin]
        inner: SparseStreamReader<R>,
        is_terminated: bool
    }
}
impl<R> Stream for SparseStream<R>
where
    R: AsyncSeek + AsyncRead + Unpin + Send + 'static,
{
    type Item = Result<Vec<u8>>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut this = self.project();
        if *this.is_terminated {
            return Poll::Ready(None);
        }
        let fut = this.inner.next_chunk();
        futures::pin_mut!(fut);
        match fut.poll(cx) {
            Poll::Ready(Ok(Some(value))) => Poll::Ready(Some(Ok(value))),
            Poll::Ready(Ok(None)) => {
                *this.is_terminated = true;
                Poll::Ready(None)
            }
            Poll::Ready(Err(e)) => {
                *this.is_terminated = true;
                Poll::Ready(Some(Err(e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (self.inner.transmitted, Some(self.inner.total))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ops::Range;
    use tokio_stream::StreamExt;

    /// 测试点：
    ///
    /// - 如果 buffer 足够，是否自动合并多个 range
    /// - 顺序读取、跳跃读取、反向读取
    #[tokio::test]
    async fn it_works() {
        let data = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        ];
        let cursor = std::io::Cursor::new(data);
        let mut stream = SparseStreamReader::new_with_chunk_size(
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
        let mut stream = SparseStreamReader::new_with_chunk_size(
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
            SparseStreamReader::new_with_chunk_size(cursor, ranges.clone(), None, 5).into_stream();
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
            SparseStreamReader::new_with_chunk_size(cursor, ranges.clone(), None, 4).into_stream();

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
        let mut stream = SparseStreamReader::new_with_chunk_size(
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
        let mut b = BoundaryBuilder::new("text/html".to_string());
        println!(
            "{:?}",
            String::from_utf8_lossy(b.format_to_bytes(&Range { start: 0, end: 50 }, 1270))
        );
    }
}
