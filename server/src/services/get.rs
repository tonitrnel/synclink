use crate::errors::{ApiResponse, ErrorKind, InternalError};
use crate::extactors::Headers;
use crate::state::AppState;
use crate::utils::{file_helper, format_ranges, parse_last_modified, parse_ranges};
use anyhow::Context;
use axum::body::Body;
use axum::http::header;
use axum::{
    extract::{Path, Query, State},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::io::SeekFrom;
use std::pin::Pin;
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio_stream::{Stream, StreamExt};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct GetQueryParams {
    raw: Option<String>,
    preview: Option<String>,
}

pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: Headers,
    query: Query<GetQueryParams>,
) -> ApiResponse<impl IntoResponse> {
    let (path, item) = {
        let indexing = state.indexing;
        if !indexing.has(&id) {
            return Err(ErrorKind::ResourceNotFound);
        }
        indexing
            .get(&id)
            .map(|it| (indexing.get_storage_path().join(it.get_resource()), it))
            .unwrap()
    };
    let ranges = headers
        .get("range")
        .try_as_string()
        .ok()
        .map(|it| parse_ranges(&it).map_err(ErrorKind::from))
        .transpose()?;

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
        (
            header::CONTENT_TYPE,
            format!("{}; charset=utf-8", item.get_type()),
        ),
        (header::ACCEPT_RANGES, "bytes".to_string()),
        (header::ETAG, item.get_hash().to_string()),
        (header::CONNECTION, "keep-alive".to_string()),
    ];
    if query.raw.is_some() {
        response_headers.push((
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", item.get_filename()),
        ))
    }
    if let Some(last_modified) = parse_last_modified(&metadata) {
        response_headers.push((header::LAST_MODIFIED, last_modified))
    }
    // 如果指定了 range 则调整文件流的位置
    // 如果 range 小于 4096，则写入内存，如果 range 大于 4096，则开新的文件句柄进行读取，如果 ranges > 10 则抛出错误 To many range
    if let Some(ranges) = ranges {
        let total = metadata.len();
        type PinedStreamPart =
            Pin<Box<dyn Stream<Item = Result<axum::body::Bytes, std::io::Error>> + Send>>;
        let mut streams: Vec<PinedStreamPart> = Vec::new();
        let mut transmitted_length = 0;
        if ranges.len() > 8 {
            return Err(ErrorKind::RangeNotSupported);
        }
        for range in ranges.iter() {
            let (start, end, is_negative) = match range {
                (Some(start), Some(end)) => (*start, *end, false),
                (Some(start), None) => (*start, total - 1, false),
                (None, Some(last)) => {
                    let last = (*last).min(total);
                    (total - last, total, true)
                }
                _ => return Err(ErrorKind::InvalidRange),
            };
            // 如果指定了 range-end 则取部分值
            let end = end.min(total);
            let len = if is_negative {
                end - start
            } else {
                end - start + 1
            };
            transmitted_length += len;
            if len > 4096 {
                let mut file = file_helper::open(&path).await?;
                file_helper::seek(&mut file, SeekFrom::Start(start), &path).await?;
                let stream = ReaderStream::new(file.take(len));
                streams.push(Box::pin(stream));
            } else {
                let mut file = file_helper::clone(&file, &path).await?;
                file_helper::seek(&mut file, SeekFrom::Start(start), &path).await?;
                let buffer = file_helper::exact(&mut file, len as usize, &path).await?;
                let buffer =
                    Box::new(std::io::Cursor::new(buffer)) as Box<dyn AsyncRead + Unpin + Send>;
                let stream = ReaderStream::new(buffer);
                streams.push(Box::pin(stream));
            }
        }

        let combined_stream = streams.into_iter().fold(None, |acc, stream| match acc {
            None => Some(stream),
            Some(combined_stream) => Some(Box::pin(combined_stream.chain(stream))),
        });
        let body_stream = match combined_stream {
            Some(stream) => Body::from_stream(stream),
            None => return Err(ErrorKind::RangeNotFound),
        };
        response_headers.push((header::CONTENT_LENGTH, transmitted_length.to_string()));
        response_headers.push((
            header::CONTENT_RANGE,
            format!("bytes {}", format_ranges(&ranges, total)),
        ));
        Ok((
            axum::http::StatusCode::PARTIAL_CONTENT,
            axum::response::AppendHeaders(response_headers),
            body_stream,
        )
            .into_response())
    } else {
        response_headers.push((header::CONTENT_LENGTH, item.get_size().to_string()));
        let body = Body::from_stream(ReaderStream::new(file)).into_response();
        Ok((axum::response::AppendHeaders(response_headers), body).into_response())
    }
}

pub async fn get_metadata(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResponse<impl IntoResponse> {
    if let Some(item) = state.indexing.get(&id) {
        Ok(Json(item))
    } else {
        return Err(ErrorKind::ResourceNotFound);
    }
}
