use std::ops::Range;
use std::path::PathBuf;

use anyhow::Context;
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, Method},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tar::{Archive, EntryType};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::errors::{ApiResponse, ErrorKind, InternalError};
use crate::extractors::Headers;
use crate::state::AppState;
use crate::utils::{
    format_last_modified_from_metadata, format_last_modified_from_u64, format_ranges,
    guess_mimetype_from_bytes, parse_range_from_str, ByteRangeBoundaryBuilder,
    SequentialRangesReader,
};

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct GetQueryParams {
    raw: Option<String>,
    thumbnail_prefer: Option<String>,
}

impl GetQueryParams {
    fn is_raw(&self) -> bool {
        self.raw.is_some() && self.thumbnail_prefer.is_none()
    }
    fn is_thumbnail(&self) -> bool {
        self.thumbnail_prefer.is_some()
    }
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: Headers,
    query: Query<GetQueryParams>,
    method: Method,
) -> ApiResponse<impl IntoResponse> {
    let (path, item) = {
        let indexing = state.indexing;
        if !indexing.has(&id) {
            return Err(ErrorKind::ResourceNotFound);
        }
        let entity = indexing.get(&id).unwrap();
        let mut path = indexing.get_storage_dir().join(entity.get_resource());
        if query.is_thumbnail() {
            let thumbnail_path = indexing
                .get_storage_dir()
                .join(format!("{}.thumbnail", entity.get_resource()));
            if thumbnail_path.exists() && thumbnail_path.is_file() {
                path = thumbnail_path;
            }
        }
        (path, entity)
    };
    let file =
        tokio::fs::File::open(&path)
            .await
            .with_context(|| InternalError::AccessFileError {
                path: path.to_owned(),
            })?;
    let metadata = file
        .metadata()
        .await
        .with_context(|| InternalError::ReadMetadataError {
            path: path.to_owned(),
        })?;
    let mut response_headers = vec![
        (header::CONTENT_TYPE, {
            let file_type = item.get_content_type();
            if file_type.starts_with("text/") {
                format!("{}; charset=utf-8", file_type)
            } else {
                file_type.to_string()
            }
        }),
        (header::ACCEPT_RANGES, "bytes".to_string()),
        (header::ETAG, format!("\"{}\"", item.get_hash())),
        (header::CONNECTION, "keep-alive".to_string()),
        (
            header::HeaderName::from_static("keep-alive"),
            "timeout=15".to_string(),
        ),
    ];
    if query.is_raw() {
        response_headers.push((
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", item.get_filename()),
        ))
    }
    if let Some(last_modified) = format_last_modified_from_metadata(&metadata) {
        response_headers.push((header::LAST_MODIFIED, last_modified))
    }
    let mut status_code = axum::http::StatusCode::OK;
    let mut body: Option<Body> = None;
    let total = metadata.len();
    if let Some((ranges, raw_ranges)) = parse_ranges_from_headers(&headers, total)? {
        let mut content_length = ranges.iter().fold(0, |a, b| a + b.len());
        if method != Method::HEAD {
            let boundaries = parse_boundaries_from_ranges(
                &ranges,
                total,
                &mut content_length,
                &mut response_headers[0].1,
            );
            let stream = SequentialRangesReader::new(file, ranges, boundaries).into_stream();
            body = Some(Body::from_stream(stream));
        }
        response_headers.push((header::CONTENT_LENGTH, content_length.to_string()));
        response_headers.push((
            header::CONTENT_RANGE,
            format!("bytes {}", format_ranges(&raw_ranges, total)),
        ));
        status_code = axum::http::StatusCode::PARTIAL_CONTENT;
    } else {
        response_headers.push((header::CONTENT_LENGTH, total.to_string()));
        response_headers.push((
            header::CACHE_CONTROL,
            "public, max-age=604800".to_string(), // 7 d
        ));
        if method != Method::HEAD {
            body = Some(Body::from_stream(ReaderStream::new(file)));
        }
    }
    let response = if let Some(body) = body {
        (
            status_code,
            axum::response::AppendHeaders(response_headers),
            body,
        )
            .into_response()
    } else {
        (status_code, axum::response::AppendHeaders(response_headers)).into_response()
    };
    Ok(response)
}

#[derive(Serialize)]
pub struct TarDirResponseDto {
    path: String,
    mtime: u64,
    size: u64,
    mimetype: Option<String>,
    is_file: bool,
    hash: Option<String>,
}
#[derive(Serialize, Deserialize)]
pub struct TarDirIndex {
    path: String,
    mtime: u64,
    size: u64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    mimetype: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    hash: Option<String>,
    e_type: u8,
    h_pos: u64,
    f_pos: u64,
}
impl From<TarDirIndex> for TarDirResponseDto {
    fn from(value: TarDirIndex) -> Self {
        Self {
            path: value.path,
            mtime: value.mtime,
            size: value.size,
            mimetype: value.mimetype,
            is_file: EntryType::new(value.e_type).is_file(),
            hash: value.hash,
        }
    }
}
fn add_extension(path: &PathBuf, extension: impl AsRef<std::path::Path>) -> PathBuf {
    let mut path = PathBuf::from(path);
    match path.extension() {
        Some(ext) => {
            let mut ext = ext.to_os_string();
            ext.push(".");
            ext.push(extension.as_ref());
            path.set_extension(ext)
        }
        None => path.set_extension(extension.as_ref()),
    };
    path
}

pub async fn get_virtual_directory(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResponse<Json<Vec<TarDirResponseDto>>> {
    let (path, _item) = {
        let indexing = state.indexing;
        if !indexing.has(&id) {
            return Err(ErrorKind::ResourceNotFound);
        }
        let entity = indexing.get(&id).unwrap();
        if entity.get_content_type() != "application/x-tar" {
            return Err(ErrorKind::ResourceNotFound);
        }
        let path = indexing.get_storage_dir().join(entity.get_resource());
        (path, entity)
    };
    let data = parse_tar_index(&path).await?;
    Ok(Json(data.into_iter().map(|it| it.into()).collect()))
}

pub async fn get_virtual_file(
    State(state): State<AppState>,
    Path((id, file_path_or_hash)): Path<(Uuid, String)>,
    headers: Headers,
    query: Query<GetQueryParams>,
    method: Method,
) -> ApiResponse<impl IntoResponse> {
    let (path, _item) = {
        let indexing = state.indexing;
        if !indexing.has(&id) {
            return Err(ErrorKind::ResourceNotFound);
        }
        let entity = indexing.get(&id).unwrap();
        if entity.get_content_type() != "application/x-tar" {
            return Err(ErrorKind::ResourceNotFound);
        }
        let path = indexing.get_storage_dir().join(entity.get_resource());
        (path, entity)
    };
    let data = parse_tar_index(&path).await?;
    let meta = data
        .into_iter()
        .find(|it| {
            it.path == file_path_or_hash
                || it
                    .hash
                    .as_ref()
                    .map(|hash| hash == &file_path_or_hash)
                    .unwrap_or(false)
        })
        .ok_or_else(|| ErrorKind::ResourceNotFound)?;
    if !EntryType::new(meta.e_type).is_file() {
        return Err(ErrorKind::Internal(anyhow::Error::msg(
            "Cannot open non-file item",
        )));
    }
    let file =
        tokio::fs::File::open(&path)
            .await
            .with_context(|| InternalError::AccessFileError {
                path: path.to_owned(),
            })?;
    let file = partial::FilePartial::new(file, meta.f_pos, meta.size).await?;
    let mut response_headers = vec![
        (header::CONTENT_TYPE, meta.mimetype.unwrap()),
        (header::ACCEPT_RANGES, "bytes".to_string()),
        (header::ETAG, format!("\"{}\"", meta.hash.unwrap())),
        (header::CONNECTION, "keep-alive".to_string()),
        (
            header::HeaderName::from_static("keep-alive"),
            "timeout=15".to_string(),
        ),
    ];
    if query.is_raw() {
        response_headers.push((
            header::CONTENT_DISPOSITION,
            format!(
                "attachment; filename=\"{}\"",
                parse_filename_from_path(&meta.path)
            ),
        ))
    }
    if let Some(last_modified) = format_last_modified_from_u64(meta.mtime) {
        response_headers.push((header::LAST_MODIFIED, last_modified))
    }
    let mut status_code = axum::http::StatusCode::OK;
    let mut body: Option<Body> = None;
    let total = meta.size;
    if let Some((ranges, raw_ranges)) = parse_ranges_from_headers(&headers, total)? {
        let mut content_length = ranges.iter().fold(0, |a, b| a + b.len());
        if method != Method::HEAD {
            let boundaries = parse_boundaries_from_ranges(
                &ranges,
                total,
                &mut content_length,
                &mut response_headers[0].1,
            );
            let stream = SequentialRangesReader::new(file, ranges, boundaries).into_stream();
            body = Some(Body::from_stream(stream));
        }
        response_headers.push((header::CONTENT_LENGTH, content_length.to_string()));
        response_headers.push((
            header::CONTENT_RANGE,
            format!("bytes {}", format_ranges(&raw_ranges, total)),
        ));
        status_code = axum::http::StatusCode::PARTIAL_CONTENT;
    } else {
        response_headers.push((header::CONTENT_LENGTH, total.to_string()));
        response_headers.push((
            header::CACHE_CONTROL,
            "public, max-age=604800".to_string(), // 7 d
        ));
        if method != Method::HEAD {
            body = Some(Body::from_stream(ReaderStream::new(file)));
        }
    }
    let response = if let Some(body) = body {
        (
            status_code,
            axum::response::AppendHeaders(response_headers),
            body,
        )
            .into_response()
    } else {
        (status_code, axum::response::AppendHeaders(response_headers)).into_response()
    };
    Ok(response)
}

async fn parse_tar_index(path: &PathBuf) -> anyhow::Result<Vec<TarDirIndex>> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut data = Vec::new();
    let idx_path = add_extension(path, "idx");
    'try_read_cache: {
        if idx_path.exists() {
            let mut file = if let Ok(file) = tokio::fs::File::open(&idx_path).await {
                file
            } else {
                break 'try_read_cache;
            };
            let mut str = String::new();
            if let Err(_e) = file.read_to_string(&mut str).await {
                break 'try_read_cache;
            };
            if let Ok(mut d) = serde_json::from_str::<Vec<TarDirIndex>>(&str) {
                data.append(&mut d);
                return Ok(data);
            };
        }
    }
    let file =
        tokio::fs::File::open(&path)
            .await
            .with_context(|| InternalError::AccessFileError {
                path: path.to_owned(),
            })?;
    let file = file.into_std().await;
    let mut archive = Archive::new(file);
    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.to_string_lossy().to_string();
        let cap = entry.size().min(4096) as usize;
        let (mimetype, buf) = if cap > 0 {
            let mut guess_buf: Vec<u8> = vec![0; cap];
            entry.read_exact(&mut guess_buf)?;
            assert!(!guess_buf.is_empty());
            let mimetype =
                guess_mimetype_from_bytes(&guess_buf, Some(&parse_extname_from_path(&path)));
            (Some(mimetype), Some(guess_buf))
        } else {
            (None, None)
        };
        let hash = if entry.header().entry_type().is_file() && buf.is_some() {
            let mut hasher = Sha256::new();
            let mut buf = buf.unwrap();
            hasher.update(&buf[0..buf.len()]);
            loop {
                let n = entry.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
            let hash = format!("{:x}", hasher.finalize());
            Some(hash)
        } else {
            None
        };

        data.push(TarDirIndex {
            path,
            mtime: entry.header().mtime()?,
            size: entry.size(),
            mimetype,
            hash,
            e_type: entry.header().entry_type().as_byte(),
            h_pos: entry.raw_header_position(),
            f_pos: entry.raw_file_position(),
        })
    }
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .create(true)
        .open(&idx_path)
        .await?;
    file.write_all(serde_json::to_string(&data)?.as_bytes())
        .await?;
    Ok(data)
}

type RawRanges = Vec<(Option<u64>, Option<u64>)>;
type ParsedRanges = Vec<Range<usize>>;

fn parse_ranges_from_headers(
    headers: &Headers,
    total: u64,
) -> Result<Option<(ParsedRanges, RawRanges)>, ErrorKind> {
    headers
        .get("range")
        .try_as_string()
        .ok()
        .map(|it| parse_range_from_str(&it).map_err(ErrorKind::from))
        .transpose()
        .unwrap_or_else(|err| {
            tracing::warn!(reason = ?err, "request range is invalid");
            None
        })
        .map(|ranges| {
            let mut parsed_ranges = Vec::with_capacity(ranges.capacity());
            for range in ranges.iter() {
                let (start, end) = match range {
                    (Some(start), Some(end)) => (*start, *end + 1),
                    (Some(start), None) => (*start, total),
                    (None, Some(last)) => (total - (*last).min(total), total),
                    _ => return Err(ErrorKind::InvalidRange),
                };
                if start > total {
                    return Err(ErrorKind::RangeTooLarge);
                }
                // 如果指定了 range-end 则取部分值
                let end = end.min(total);
                parsed_ranges.push(Range {
                    start: start as usize,
                    end: end as usize,
                });
            }
            Ok((parsed_ranges, ranges))
        })
        .transpose()
}
fn parse_boundaries_from_ranges(
    ranges: &[Range<usize>],
    total: u64,
    content_length: &mut usize,
    content_type: &mut String,
) -> Option<Vec<Vec<u8>>> {
    if ranges.len() > 1 {
        let builder = ByteRangeBoundaryBuilder::new(content_type.to_string());
        let mut boundaries = ranges
            .iter()
            .map(|it| builder.format_to_bytes(it, total))
            .collect::<Vec<_>>();
        boundaries.push(builder.end_to_bytes());
        *content_type = format!("multipart/byteranges; boundary={}", builder.id());
        *content_length += boundaries.iter().fold(0, |a, b| a + b.len());
        Some(boundaries)
    } else {
        None
    }
}
fn parse_filename_from_path(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(_, it)| it.to_string())
        .unwrap_or_default()
}
fn parse_extname_from_path(path: &str) -> String {
    path.rsplit_once('.')
        .map(|(_, it)| it.to_string())
        .unwrap_or_default()
}

mod partial {
    use std::io;
    use std::io::SeekFrom;
    use std::pin::Pin;
    use std::task::{Context, Poll};
    use tokio::fs::File;
    use tokio::io::{AsyncRead, AsyncSeek, AsyncSeekExt, ReadBuf};

    pub struct FilePartial {
        inner: File,
        start: usize,
        end: usize,
        pos: usize,
    }
    impl FilePartial {
        pub async fn new(mut file: File, start: u64, size: u64) -> io::Result<Self> {
            file.seek(SeekFrom::Start(start)).await?;
            Ok(Self {
                inner: file,
                start: start as usize,
                end: (start + size) as usize,
                pos: start as usize,
            })
        }
    }

    impl AsyncSeek for FilePartial {
        fn start_seek(self: Pin<&mut Self>, pos: SeekFrom) -> io::Result<()> {
            let this = self.get_mut();
            let pos = match pos {
                SeekFrom::Start(offset) => this.start + offset as usize,
                SeekFrom::Current(offset) => (this.pos as i64 + offset) as usize,
                SeekFrom::End(offset) => (this.end as i64 + offset) as usize,
            };
            if pos < this.start || pos > this.end {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Seek out of range",
                ));
            }
            this.pos = pos;
            AsyncSeek::start_seek(Pin::new(&mut this.inner), SeekFrom::Start(pos as u64))?;
            Ok(())
        }

        fn poll_complete(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<u64>> {
            let this = self.get_mut();
            AsyncSeek::poll_complete(Pin::new(&mut this.inner), cx)
        }
    }
    impl AsyncRead for FilePartial {
        fn poll_read(
            self: Pin<&mut Self>,
            cx: &mut Context<'_>,
            dst: &mut ReadBuf<'_>,
        ) -> Poll<io::Result<()>> {
            let this = self.get_mut();
            let max_read_length = this.end - this.pos;
            if max_read_length == 0 {
                return Poll::Ready(Ok(()));
            }
            // 已填冲长度
            let previous_filled_len = dst.filled().len();
            // 剩余长度
            let remaining_len = dst.remaining().min(max_read_length);
            // println!("max_read_length: {max_read_length}, remaining_len: {remaining_len}");
            // 创建一个指定长度的切片
            let temporary_slice = dst.initialize_unfilled_to(remaining_len);
            let mut n_dst = ReadBuf::new(temporary_slice);
            let result = AsyncRead::poll_read(Pin::new(&mut this.inner), cx, &mut n_dst);
            if let Poll::Ready(Ok(())) = &result {
                let current_filled_len = n_dst.filled().len();
                let filled_len = current_filled_len - previous_filled_len;
                // println!("filled_len: {filled_len}, previous_filled_len: {previous_filled_len}, current_filled_len: {current_filled_len}");
                this.pos += filled_len;
                // 更新 filled 长度
                dst.advance(filled_len);
            }
            result
        }
    }
}
