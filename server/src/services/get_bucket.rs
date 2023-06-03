use crate::config::state::AppState;
use crate::utils::{HttpException, HttpResult};
use crate::{throw_error, try_break_ok, utils};
use anyhow::Context;
use axum::{
    body::StreamBody,
    debug_handler,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::pin::Pin;
use tokio::io::{AsyncRead, AsyncSeekExt};
use tokio_stream::Stream;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct GetBucketQueryParams {
    raw: Option<String>,
}

#[debug_handler]
pub async fn get_bucket(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    headers: HeaderMap,
    query: Query<GetBucketQueryParams>,
) -> HttpResult<impl IntoResponse> {
    use axum::http::header;
    use tokio::io::AsyncReadExt;
    use tokio_stream::StreamExt;
    use tokio_util::io::ReaderStream;

    let query: GetBucketQueryParams = query.0;
    let (path, item) = {
        let bucket = state.bucket;
        if !bucket.has(&id) {
            throw_error!(
                HttpException::NotFound,
                format!("Bucket id {} not found", id)
            )
        }
        bucket
            .get(&id)
            .map(|it| (bucket.get_entity_path(&it), it))
            .unwrap()
    };
    let ranges = headers
        .get("range")
        .map(|it| String::from_utf8(it.as_bytes().to_vec()).unwrap())
        .map(|it| utils::parse_ranges(&it));
    let file = try_break_ok!(tokio::fs::File::open(&path)
        .await
        .with_context(|| format!("file open failed from {:?}", &path)));
    let metadata = try_break_ok!(file
        .metadata()
        .await
        .with_context(|| "file metadata read failed"));
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
    if let Some(last_modified) = utils::last_modified(&metadata) {
        response_headers.push((header::LAST_MODIFIED, last_modified))
    }
    // 如果指定了 range 则调整文件流的位置
    // 如果 range 小于 4096，则写入内存，如果 range 大于 4096，则开新的文件句柄进行读取，如果 ranges > 10 则抛出错误 To many range
    if let Some(ranges) = ranges {
        use tokio::io::SeekFrom;
        let ranges = try_break_ok!(ranges);
        let total = metadata.len();
        type PinedStreamPart =
            Pin<Box<dyn Stream<Item = Result<axum::body::Bytes, std::io::Error>> + Send>>;
        let mut streams: Vec<PinedStreamPart> = Vec::new();
        let mut transmitted_length = 0;
        if ranges.len() > 10 {
            throw_error!(
                HttpException::RangeNotSatisfiable,
                "To many ranges".to_string()
            );
        }
        for range in ranges.iter() {
            let (start, end, is_negative) = match range {
                (Some(start), Some(end)) => (*start, *end, false),
                (Some(start), None) => (*start, total - 1, false),
                (None, Some(last)) => {
                    let last = (*last).min(total);
                    (total - last, total, true)
                }
                _ => throw_error!(HttpException::RangeNotSatisfiable),
            };
            // 如果指定了 range-end 则取部分值
            let end = end.min(total);
            let len = if is_negative {
                end - start
            } else {
                end - start + 1
            };
            transmitted_length += len;
            // println!(
            //     "range: start={}, end={}, is_negative={}, len={}, total={}",
            //     start, end, is_negative, len, total
            // );
            if len > 4096 {
                let mut file = try_break_ok!(tokio::fs::File::open(&path)
                    .await
                    .with_context(|| format!("file open failed from {:?}", &path)));
                try_break_ok!(file
                    .seek(SeekFrom::Start(start))
                    .await
                    .with_context(|| "file stream seek failed"));
                let stream = ReaderStream::new(file.take(len));
                streams.push(Box::pin(stream));
            } else {
                let mut file = try_break_ok!(file
                    .try_clone()
                    .await
                    .with_context(|| "clone file handler failed"));
                try_break_ok!(file
                    .seek(SeekFrom::Start(start))
                    .await
                    .with_context(|| "file stream seek failed"));
                let mut buffer = vec![0; len as usize];
                println!("will write {} bytes", buffer.len());
                try_break_ok!(file
                    .read_exact(&mut buffer)
                    .await
                    .with_context(|| "file stream exact failed"));
                println!("buffer = {:?}", buffer);
                let buffer =
                    Box::new(std::io::Cursor::new(buffer)) as Box<dyn AsyncRead + Unpin + Send>;
                let stream = ReaderStream::new(buffer);
                streams.push(Box::pin(stream));
            }
        }

        let combine_stream = streams.into_iter().fold(None, |acc, stream| match acc {
            None => Some(stream),
            Some(combine_stream) => Some(Box::pin(combine_stream.chain(stream))),
        });
        let combine_stream = match combine_stream
            .map(StreamBody::new)
            .with_context(|| "missing stream output")
        {
            Ok(stream) => stream,
            Err(err) => throw_error!(HttpException::RangeNotSatisfiable, err),
        };
        response_headers.push((header::CONTENT_LENGTH, transmitted_length.to_string()));
        response_headers.push((
            header::CONTENT_RANGE,
            format!("bytes {}", utils::format_ranges(&ranges, total)),
        ));
        Ok::<_, ()>(
            (
                axum::http::StatusCode::PARTIAL_CONTENT,
                axum::response::AppendHeaders(response_headers),
                combine_stream.into_response(),
            )
                .into_response(),
        )
        .into()
    } else {
        response_headers.push((header::CONTENT_LENGTH, item.get_size().to_string()));
        let body = StreamBody::new(ReaderStream::new(file)).into_response();
        Ok::<_, ()>((axum::response::AppendHeaders(response_headers), body).into_response()).into()
    }
}

pub async fn get_bucket_metadata(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> HttpResult<impl IntoResponse> {
    let bucket = state.bucket;
    if bucket.has(&id) {
        let item = bucket
            .get(&id)
            .with_context(|| format!("Bucket id {} query failed", id));
        if let Err(err) = item {
            return Err(err).into();
        }
        let item = item.unwrap().clone();
        Ok::<_, ()>(Json(item)).into()
    } else {
        throw_error!(
            HttpException::NotFound,
            format!("Bucket id {} not found", id)
        )
    }
}
