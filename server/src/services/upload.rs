use crate::models::file_indexing::{IndexChangeAction, WriteIndexArgs};
use crate::state::AppState;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;

use crate::errors::{ApiResponse, ErrorKind};
use crate::extactors::Headers;
use crate::utils::decode_uri;
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;

pub async fn upload(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: Headers,
    request: Request,
) -> ApiResponse<impl IntoResponse> {
    let content_length = headers.get("content-length").try_as_u64()?;
    let content_type = headers.get("content-type").try_as_string().ok();
    let content_hash = headers
        .get("x-content-sha256")
        .try_as_string()?
        .to_lowercase();
    let filename = headers
        .get("x-raw-filename")
        .try_as_string()
        .ok()
        .map(|it| decode_uri(&it).map_err(ErrorKind::from))
        .transpose()?;

    let user_agent = headers.get("user-agent").try_as_string().ok();

    let host = Some(addr.ip().to_string());

    // Check hash exists, if it exists, then cancel upload and return uuid
    if let Some(uuid) = state.indexing.has_hash(&content_hash) {
        return Err(ErrorKind::DuplicateFile(uuid));
    }
    let (uid, size, hash) = {
        // Preallocate disk space, uuid
        let mut preallocation = state
            .indexing
            .preallocation(&filename, &Some(content_length))
            .await?;
        let mut hasher = Sha256::new();
        let mut size = 0;
        let mut stream = request.into_body().into_data_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = match chunk {
                Ok(v) => v,
                Err(err) => {
                    preallocation.cleanup().await?;
                    return Err(ErrorKind::from(err));
                }
            };
            hasher.update(chunk.as_ref());
            match preallocation.file.write_all(chunk.as_ref()).await {
                Ok(_) => (),
                Err(err) => {
                    preallocation.cleanup().await?;
                    return Err(ErrorKind::from(err));
                }
            }
            size += chunk.len()
        }
        let hash = format!("{:x}", hasher.finalize());
        if hash.as_str() != content_hash {
            preallocation.cleanup().await?;
            return Err(ErrorKind::HashMismatch);
        }
        (preallocation.uid, size, hash)
    };

    state
        .indexing
        .write(WriteIndexArgs {
            uid,
            user_agent,
            filename,
            content_type,
            hash,
            size,
            host,
        })
        .await?;
    state.broadcast.send(IndexChangeAction::AddItem(uid))?;
    Ok((StatusCode::CREATED, Json(uid)).into_response())
}
