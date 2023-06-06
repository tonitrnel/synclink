use crate::config::state::AppState;
use crate::models::bucket::BucketAction;
use crate::utils::{HttpException, HttpResult};
use crate::{cleanup_preallocation, throw_error, try_break_ok, utils};
use anyhow::Context;
use axum::{
    debug_handler,
    extract::{BodyStream, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};

use crate::errors::{ApiError, InternalError};
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;

#[debug_handler]
pub async fn add(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut stream: BodyStream,
) -> HttpResult<impl IntoResponse> {
    use sha2::{Digest, Sha256};
    use std::str::FromStr;

    let content_length = try_break_ok!(headers
        .get("content-length")
        .and_then(|it| it.to_str().ok().and_then(|val| u64::from_str(val).ok()))
        .ok_or((
            HttpException::BadRequest,
            ApiError::HeaderFieldMissing("Content-Length")
        )));

    let content_type = try_break_ok!(headers
        .get("content-type")
        .map(|it| String::from_utf8_lossy(it.as_bytes()).to_string())
        .ok_or((
            HttpException::BadRequest,
            ApiError::HeaderFieldMissing("Content-Type")
        )));
    let content_hash = try_break_ok!(headers
        .get("x-content-sha256")
        .and_then(|it| it.to_str().ok())
        .map(|it| it.to_lowercase())
        .ok_or((
            HttpException::BadRequest,
            ApiError::HeaderFieldMissing("X-Content-Sha256")
        )));
    let filename = headers
        .get("x-raw-filename")
        .and_then(|it| it.to_str().ok())
        .and_then(|it| utils::decode_uri(it).ok());

    // Check hash exists, if it exists, then cancel upload and return uuid
    if let Some(uuid) = state.bucket.has_hash(&content_hash) {
        return Ok::<_, ()>(Json(uuid).into_response()).into();
    }
    let (uid, size, hash) = {
        // Preallocate disk space, uuid
        let mut preallocation = match state
            .bucket
            .preallocation(&filename, &Some(content_length))
            .await
        {
            Ok(tup) => tup,
            Err(err) => return Err(err).into(),
        };
        let mut hasher = Sha256::new();
        let mut size = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk.with_context(|| InternalError::ReadStream) {
                Ok(v) => v,
                Err(err) => {
                    cleanup_preallocation!(preallocation);
                    return Err(err).into();
                }
            };
            hasher.update(chunk.as_ref());
            match preallocation
                .file
                .write_all(chunk.as_ref())
                .await
                .with_context(|| InternalError::WriteFile(&preallocation.path).to_string())
            {
                Ok(_) => (),
                Err(err) => {
                    cleanup_preallocation!(preallocation);
                    return Err(err).into();
                }
            }
            size += chunk.len()
        }
        let hash = format!("{:x}", hasher.finalize());
        if hash.as_str() != content_hash {
            cleanup_preallocation!(preallocation);
            throw_error!(HttpException::BadRequest, ApiError::HashMismatch)
        }
        (preallocation.uid, size, hash)
    };
    try_break_ok!(
        state
            .bucket
            .write(uid, filename, content_type, hash, size)
            .await
    );
    if let Err(err) = state.broadcast.send(BucketAction::Add(uid)) {
        tracing::warn!(%err, "{}", InternalError::Broadcast(&format!("add {} action", uid)));
    }
    Ok::<_, ()>((StatusCode::CREATED, Json(uid)).into_response()).into()
}
