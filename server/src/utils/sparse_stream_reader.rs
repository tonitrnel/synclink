use std::io::SeekFrom;
use std::ops::{Index, Range};
use std::pin::Pin;

use anyhow::Context;
use futures::{Stream, StreamExt};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt};
use uuid::Uuid;

/// 用于管理 `multipart/byteranges` 消息中每个部分的边界分隔符和标头的字节表示
///
/// 通常用在范围请求的 HTTP 响应中。
///
/// 每个边界最多 256 字节，其中有 69 字节大小是固定的，剩余的大小根据 `content-type` 和 `content-range` 的字符数浮动
///
/// 在文件小于 9.31GB 时 `content-type` 最多 157 个 ASCII 字符，否则可能会出现问题
///
/// 除了上述外还有一个固定 28 字节的边界结束符
#[derive(Debug)]
pub struct Boundaries {
    inner: Vec<u8>,
    /// 由起始位置、数据长度组成
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
    pub fn boundary_len(&self, index: usize) -> usize {
        let (_, len) = self.heads[index];
        len
    }
    /// 从给定的范围创建 boundaries
    pub fn from_ranges(
        ranges: &[Range<usize>],
        total: u64,
        content_length: &mut usize,
        content_type: &mut String,
    ) -> Option<Boundaries> {
        if ranges.len() > 1 {
            let mut builder = BoundaryBuilder::new(content_type.to_string());
            let mut boundaries = Boundaries::with_capacity(ranges.len());
            for range in ranges {
                boundaries.push(builder.format_head_bytes(range, total));
            }
            boundaries.push(builder.format_end_bytes());
            *content_type = format!("multipart/byteranges; boundary={}", builder.id());
            *content_length += boundaries.len();
            Some(boundaries)
        } else {
            None
        }
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
    // 3 个 u64 数值: 3 * 20 = 60 bytes，60 bytes 仅最大，10 字节表示长度都是以 GB 为单位
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
    pub fn format_head_bytes(&mut self, range: &Range<usize>, total: u64) -> &[u8] {
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
    pub fn format_end_bytes(&mut self) -> &[u8] {
        let str = format!("\r\n--{}--\r\n", self.id);
        let bytes = str.as_bytes();
        self.buffer[0..bytes.len()].copy_from_slice(bytes);
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
    transferred: usize,
    boundaries: Option<Boundaries>,
}
impl<R> SparseStreamReader<R> {
    pub const BUFFER_SIZE: usize = 4096;
    #[inline]
    pub fn capacity(&self) -> usize {
        self.buffer.capacity()
    }
    /// 前进到下一个范围
    #[inline]
    pub fn adv_next_range(&mut self) {
        self.range_pos += 1;
        self.offset = 0;
    }
    /// 获取当前范围
    #[inline]
    pub fn c_range(&self) -> &Range<usize> {
        &self.ranges[self.range_pos]
    }
}
impl<R> SparseStreamReader<R>
where
    R: AsyncSeek + AsyncRead + Unpin + Send + 'static,
{
    pub fn new(reader: R, ranges: Vec<Range<usize>>, boundaries: Option<Boundaries>) -> Self {
        // println!("ranges = {:?}", ranges);
        Self::new_with_chunk_size(reader, ranges, boundaries, Self::BUFFER_SIZE)
        // 4kb
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
            transferred: 0,
            total,
            boundaries,
        }
    }
    /// 读取下一个 chunk
    async fn next_chunk(&mut self) -> anyhow::Result<Option<Vec<u8>>> {
        // 所以数据已经传输完毕
        if self.transferred == self.total {
            return Ok(None);
        }
        let buffer_size = self.capacity();
        let mut written_bytes = 0;

        if self.offset == 0 {
            if let Some(boundaries) = &self.boundaries {
                written_bytes += boundaries.read(self.range_pos, &mut self.buffer[0..])
            }
            // 情况一: buffer 没有空间，直接返回了，理论不会触发
            // 情况二: 写入 multipart/byteranges 的结束 boundary 字节
            if written_bytes == buffer_size || self.transferred + written_bytes == self.total {
                self.transferred += written_bytes;
                return Ok(Some(self.buffer[0..written_bytes].to_vec()));
            }
            // 调整指针到当前 range 的开始位置
            self.source
                .seek(SeekFrom::Start(self.c_range().start as u64))
                .await?;
        }

        let available_buffer_space = buffer_size - written_bytes;
        // 计算总共还剩多少未传输，最大为当前 buffer 容量
        let remaining_total = (self.total - self.transferred).min(available_buffer_space);
        // 计算当前范围还是多少未传输，最大为当前 buffer 容量
        let remaining_in_range = (self.c_range().len() - self.offset).min(available_buffer_space);

        // 当前范围需要传输数据量小于本次总共可传输的数据，为了提升空间利用率，因此填充多个 range 所需要的内容，

        if remaining_in_range < remaining_total {
            written_bytes += self
                .source
                .read_exact(&mut self.buffer[written_bytes..written_bytes + remaining_in_range])
                .await?;

            // buf 还未填满，进入循环填充每个 range 需要的数据直至 buf 填充满
            while written_bytes < remaining_total {
                self.range_pos += 1;
                // 写入 boundary head 或 boundary end
                if let Some(boundaries) = &self.boundaries {
                    // 剩余的空间不足以写入 boundary，由于 boundary 未实现分割故无法写入，
                    // 这里只能先返回当前已写入的 buffer
                    let boundary_len = boundaries.boundary_len(self.range_pos);
                    if written_bytes + boundary_len > remaining_total {
                        break;
                    }
                    written_bytes += boundaries.read(
                        self.range_pos,
                        &mut self.buffer[written_bytes..written_bytes + boundary_len],
                    );
                }
                // 写在这是为了写入 boundary end，boundary 比 range 多一项
                if self.range_pos >= self.ranges.len() {
                    self.range_pos = self.ranges.len() - 1;
                    break;
                }

                // 写入 content
                let available_buffer_space =
                    (remaining_total - written_bytes).min(self.c_range().len());
                if available_buffer_space == 0 {
                    break;
                }
                self.source
                    .seek(SeekFrom::Start(self.c_range().start as u64))
                    .await?;
                let len = self
                    .source
                    .read_exact(
                        &mut self.buffer[written_bytes..written_bytes + available_buffer_space],
                    )
                    .await
                    .with_context(|| {
                        format!(
                            "Failed to read exactly {} bytes into buffer at position {}",
                            available_buffer_space, written_bytes
                        )
                    })?;

                written_bytes += len;
                self.offset = len;
            }
        } else {
            written_bytes += self
                .source
                .read_exact(&mut self.buffer[written_bytes..written_bytes + remaining_total])
                .await
                .with_context(|| {
                    format!(
                        "Failed to read exactly {} bytes into buffer at position {}",
                        remaining_total, written_bytes
                    )
                })?;
            self.offset += remaining_total;
        };
        self.transferred += written_bytes;
        // 检查当前范围所需的数据是否已经写入完毕
        if self.offset == self.c_range().len() {
            self.adv_next_range();
        }
        Ok(Some(self.buffer[0..written_bytes].to_vec()))
    }
    pub fn into_stream(
        self,
    ) -> Pin<Box<dyn Stream<Item = anyhow::Result<Vec<u8>>> + Send + 'static>> {
        stream_impl::build_sparse_stream(self, |mut this| async move {
            match this.next_chunk().await {
                Ok(Some(v)) => Some((Ok(v), this)),
                Ok(None) => None,
                Err(e) => Some((Err(e), this)),
            }
        })
        .boxed()
    }
}

mod stream_impl {
    use std::future::Future;
    use std::pin::Pin;
    use std::task::Poll;

    use futures::{ready, Stream};
    use pin_project_lite::pin_project;
    use tokio::io::{AsyncRead, AsyncSeek};

    use crate::utils::SparseStreamReader;

    pin_project! {
        #[project = StateProj]
        #[project_replace = StateProjReplace]
        pub enum State<T, R> {
            Terminated,
            Ready {
                value: T
            },
            Future {
                #[pin]
                future: R,
            },
            Empty,
        }
    }
    impl<T, R> State<T, R> {
        pub(crate) fn project_future(self: Pin<&mut Self>) -> Option<Pin<&mut R>> {
            match self.project() {
                StateProj::Future { future } => Some(future),
                _ => None,
            }
        }
        pub(crate) fn take(self: Pin<&mut Self>) -> Option<T> {
            match &*self {
                State::Ready { .. } => match self.project_replace(State::Empty) {
                    StateProjReplace::Ready { value } => Some(value),
                    _ => unreachable!(),
                },
                _ => None,
            }
        }
        pub(crate) fn is_terminated(self: Pin<&Self>) -> bool {
            matches!(&*self, State::Terminated)
        }
    }

    pin_project! {
        pub struct SparseStream<R, F, Fut> {
            f: F,
            #[pin]
            state: State<SparseStreamReader<R>, Fut>,
            buffer_size: usize,
            total: usize,
            transferred: usize,
        }
    }

    pub fn build_sparse_stream<R, F, Fut, Item>(
        this: SparseStreamReader<R>,
        f: F,
    ) -> SparseStream<R, F, Fut>
    where
        F: FnMut(SparseStreamReader<R>) -> Fut,
        Fut: Future<Output = Option<(anyhow::Result<Item>, SparseStreamReader<R>)>>,
    {
        SparseStream {
            f,
            buffer_size: this.capacity(),
            total: this.total,
            transferred: 0,
            state: State::Ready { value: this },
        }
    }

    impl<R, F, Fut, Item> Stream for SparseStream<R, F, Fut>
    where
        R: AsyncSeek + AsyncRead + Unpin + Send + 'static,
        F: FnMut(SparseStreamReader<R>) -> Fut,
        Fut: Future<Output = Option<(anyhow::Result<Item>, SparseStreamReader<R>)>>,
    {
        type Item = anyhow::Result<Item>;

        fn poll_next(
            self: Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> Poll<Option<Self::Item>> {
            let mut this = self.project();
            if this.state.as_ref().is_terminated() {
                return Poll::Ready(None);
            }
            if let Some(value) = this.state.as_mut().take() {
                this.state.set(State::Future {
                    future: (this.f)(value),
                });
            }
            let next = match this.state.as_mut().project_future() {
                Some(fut) => ready!(fut.poll(cx)),
                None => unreachable!(),
            };
            match next {
                Some((Ok(item), value)) => {
                    *this.transferred = value.transferred;
                    this.state.set(State::Ready { value });
                    Poll::Ready(Some(Ok(item)))
                }
                Some((Err(e), _)) => {
                    this.state.set(State::Terminated);
                    Poll::Ready(Some(Err(e)))
                }
                None => {
                    this.state.set(State::Terminated);
                    Poll::Ready(None)
                }
            }
        }
        fn size_hint(&self) -> (usize, Option<usize>) {
            (
                // Calculate the number of remaining chunks by ceiling division
                (self.total - self.transferred + self.buffer_size - 1) / self.buffer_size,
                None,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use std::ops::Range;
    use std::path::PathBuf;

    use axum::http::{header, HeaderName};
    use futures::StreamExt;
    use rand::Rng;
    use sha2::{Digest, Sha256};
    use tokio::fs;

    use super::*;

    struct MockTestFile {
        hash: String,
        size: usize,
        path: PathBuf,
    }
    impl MockTestFile {
        async fn create(size: usize) -> anyhow::Result<MockTestFile> {
            use tokio::io::AsyncWriteExt;

            let id = Uuid::new_v4();
            let path = PathBuf::from("./target/tmp");
            if !path.exists() {
                std::fs::create_dir(&path)?;
            }
            let path = path.join(format!("{id}.tmp"));
            let mut rng = rand::rng();
            let mut hasher = Sha256::new();
            let mut buf = [0; 4096];
            let mut written_bytes = 0;
            let mut file = fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&path)
                .await
                .map_err(|e| {
                    if e.kind() == std::io::ErrorKind::PermissionDenied {
                        anyhow::format_err!("Permission denied: {}", e)
                    } else {
                        anyhow::format_err!("Error opening file: {}", e)
                    }
                })?;
            while written_bytes < size {
                let chunk_size = buf.len().min(size - written_bytes);
                for byte in &mut buf[0..chunk_size] {
                    *byte = rng.sample(rand::distr::Alphanumeric)
                }
                hasher.update(&buf[0..chunk_size]);
                file.write_all(&buf[0..chunk_size]).await?;
                written_bytes += chunk_size;
            }
            file.sync_all().await?;
            let hash = format!("{:x}", hasher.finalize());
            Ok(MockTestFile { hash, size, path })
        }
        async fn file(&self) -> fs::File {
            fs::File::open(&self.path).await.unwrap()
        }
    }
    impl Drop for MockTestFile {
        fn drop(&mut self) {
            std::fs::remove_file(&self.path).unwrap()
        }
    }

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
            assert!(matches!(chunk, Err(anyhow::Error { .. })))
        }
    }
    #[tokio::test]
    async fn mock_test_file_creation_and_deletion() -> anyhow::Result<()> {
        // 创建一个大小为 512 字节的 Mock 测试文件
        let mock_file = MockTestFile::create(512).await?;

        // 验证创建的文件是否存在，并具有预期的属性
        assert!(
            mock_file.path.is_file(),
            "The file should exist at the specified path."
        );
        let metadata = mock_file.path.metadata()?;
        assert_eq!(
            metadata.len(),
            512,
            "The file size should match the expected size of 512 bytes."
        );

        // 获取文件路径用于后续检查
        let path = mock_file.path.clone();

        // Drop MockTestFile 实例并验证文件是否被删除
        drop(mock_file);
        assert!(
            !path.exists(),
            "The file should be deleted after MockTestFile is dropped"
        );

        Ok(())
    }

    #[test]
    fn test_boundary_builder_formats_head_correctly() {
        // 初始化 BoundaryBuilder
        let mut builder = BoundaryBuilder::new("text/html".to_string());
        let id = builder.id.clone();

        // 从 BoundaryBuilder 获取格式化的头部字节并比较
        assert_eq!(
            String::from_utf8_lossy(builder.format_head_bytes(&Range { start: 0, end: 50 }, 1270)),
            format!(
                "\r\n--{}\r\nContent-Type: text/html\r\nContent-Range: bytes 0-49/1270\r\n\r\n",
                id
            ),
            "The formatted boundary header does not match the expected output."
        );
        assert_eq!(
            String::from_utf8_lossy(builder.format_end_bytes()),
            format!("\r\n--{}--\r\n", id),
            "The formatted boundary header does not match the expected output."
        );
    }

    #[tokio::test]
    async fn test_single_range() -> anyhow::Result<()> {
        let mock_file = MockTestFile::create(4098).await?;
        let ranges = vec![Range {
            start: 0,
            end: mock_file.size,
        }];
        let mut response_header: Vec<(HeaderName, String)> =
            vec![(header::CONTENT_TYPE, "video/mp4".to_string())];
        let mut content_length = 0;
        let boundaries = Boundaries::from_ranges(
            &ranges,
            mock_file.size as u64,
            &mut content_length,
            &mut response_header[0].1,
        );
        assert!(boundaries.is_none());
        assert_eq!(0, content_length);
        assert_eq!(response_header[0].1, "video/mp4");
        let reader = SparseStreamReader::new(mock_file.file().await, ranges, boundaries);
        let capacity = reader.capacity();
        let mut transferred = 0;
        let mut stream = reader.into_stream();
        let mut count = 0;
        let mut hasher = Sha256::new();
        while let Some(chunk) = stream.next().await {
            assert!(chunk.is_ok(), "{chunk:?}");
            let chunk = chunk?;
            assert_eq!(
                chunk.len(),
                capacity.min(mock_file.size - transferred),
                "期望 chunk 大小小于等于 buffer 的大小"
            );
            transferred += chunk.len();
            count += 1;
            hasher.update(&chunk);
        }
        let hash = format!("{:x}", hasher.finalize());
        assert_eq!(count, 2);
        assert_eq!(transferred, mock_file.size, "期望全部字节已经传输");
        println!("传输 {count} 次，每次 {capacity} bytes");
        assert_eq!(hash, mock_file.hash, "期望 HASH 相同即没有漏传数据");
        Ok(())
    }

    #[tokio::test]
    async fn test_multi_range() -> anyhow::Result<()> {
        let mock_file = MockTestFile::create(4096).await?;
        let ranges = vec![
            Range { start: 0, end: 66 },
            Range { start: 8, end: 55 },
            Range {
                start: 120,
                end: 155,
            },
            Range {
                start: 180,
                end: 995,
            },
        ];
        let mut response_header: Vec<(HeaderName, String)> =
            vec![(header::CONTENT_TYPE, "video/mp4".to_string())];
        let mut content_length = ranges.iter().fold(0, |a, b| a + b.len());
        assert_eq!(content_length, 963); // 66 + 47 + 35 + 815
        let boundaries = Boundaries::from_ranges(
            &ranges,
            mock_file.size as u64,
            &mut content_length,
            &mut response_header[0].1,
        );
        assert!(boundaries.is_some());
        let boundaries = boundaries.unwrap();
        assert_eq!(boundaries.len(), 374); // 85 + 85 + 88 + 88 + 28; 85 = 69(fixed length) + 9(content-type) + 7(content-range)
        assert_eq!(content_length, 1337); // 963 + 374
        assert!(response_header[0]
            .1
            .starts_with("multipart/byteranges; boundary="));
        assert_eq!(SparseStreamReader::<()>::BUFFER_SIZE, 4096);
        let reader = SparseStreamReader::new(mock_file.file().await, ranges, Some(boundaries));
        let capacity = reader.capacity();
        let mut transferred = 0;
        let mut stream = reader.into_stream();
        let mut count = 0;
        while let Some(chunk) = stream.next().await {
            assert!(chunk.is_ok(), "{chunk:?}");
            let chunk = chunk?;
            transferred += chunk.len();
            count += 1;
        }
        assert_eq!(count, 1);
        assert_eq!(transferred, content_length, "期望全部字节已经传输");
        println!("传输 {count} 次，每次 {capacity} bytes");
        Ok(())
    }
    #[tokio::test]
    async fn test_immediate_return_on_insufficient_buffer_capacity() -> anyhow::Result<()> {
        let mock_file = MockTestFile::create(4096).await?;
        let ranges = vec![
            Range {
                start: 0,
                end: 4090,
            },
            Range { start: 0, end: 90 },
            Range {
                start: 92,
                end: 170,
            },
        ];

        // 初始化响应头部
        let mut response_header = [(header::CONTENT_TYPE, "text/plain".to_string())];

        // 计算期望的内容长度
        let mut content_length = ranges.iter().fold(0, |a, b| a + b.len());

        // 从给定的范围创建 boundaries
        let boundaries = Boundaries::from_ranges(
            &ranges,
            mock_file.size as u64,
            &mut content_length,
            &mut response_header[0].1,
        );

        let reader = SparseStreamReader::new(mock_file.file().await, ranges, boundaries);
        let buffer_capacity = reader.capacity();

        let mut stream = reader.into_stream();
        let mut total_transferred = 0;
        let mut block_count = 0;

        while let Some(chunk) = stream.next().await {
            assert!(chunk.is_ok(), "Unexpected error during read: {chunk:?}");
            let chunk = chunk?;
            total_transferred += chunk.len();
            block_count += 1;
        }
        assert_eq!(block_count, 2, "Unexpected number of data blocks read");
        assert_eq!(
            total_transferred, content_length,
            "Expected all bytes to be transferred"
        );

        println!("Transferred in {block_count} blocks, each up to {buffer_capacity} bytes");
        Ok(())
    }
}
