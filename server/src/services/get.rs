use crate::errors::{ApiResponse, ErrorKind, InternalError};
use crate::extactors::Headers;
use crate::state::AppState;
use crate::utils::{
    format_ranges, parse_last_modified, parse_ranges, ByteRangeBoundaryBuilder,
    SequentialRangesReader,
};
use anyhow::Context;
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, Method},
    response::IntoResponse,
};
use serde::Deserialize;
use std::ops::Range;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct GetQueryParams {
    raw: Option<String>,
    #[allow(unused)]
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
    let ranges = headers
        .get("range")
        .try_as_string()
        .ok()
        .map(|it| parse_ranges(&it).map_err(ErrorKind::from))
        .transpose()
        .unwrap_or_else(|err| {
            tracing::warn!(reason = ?err, "request range is invalid");
            None
        });

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
    if let Some(last_modified) = parse_last_modified(&metadata) {
        response_headers.push((header::LAST_MODIFIED, last_modified))
    }
    let mut status_code = axum::http::StatusCode::OK;
    let mut body: Option<Body> = None;
    if let Some(ranges) = ranges {
        let total = metadata.len();
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
        let mut content_length = parsed_ranges.iter().fold(0, |a, b| a + b.len());
        if method != Method::HEAD {
            let boundaries = if parsed_ranges.len() > 1 {
                let builder = ByteRangeBoundaryBuilder::new(response_headers[0].1.to_owned());
                let mut boundaries = parsed_ranges
                    .iter()
                    .map(|it| builder.format_to_bytes(it, total))
                    .collect::<Vec<_>>();
                boundaries.push(builder.end_to_bytes());
                response_headers[0].1 = format!("multipart/byteranges; boundary={}", builder.id());
                content_length += boundaries.iter().fold(0, |a, b| a + b.len());
                Some(boundaries)
            } else {
                None
            };
            let stream = SequentialRangesReader::new(file, parsed_ranges, boundaries).into_stream();
            body = Some(Body::from_stream(stream));
        }
        response_headers.push((header::CONTENT_LENGTH, content_length.to_string()));
        response_headers.push((
            header::CONTENT_RANGE,
            format!("bytes {}", format_ranges(&ranges, total)),
        ));
        status_code = axum::http::StatusCode::PARTIAL_CONTENT;
    } else {
        response_headers.push((header::CONTENT_LENGTH, metadata.len().to_string()));
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
