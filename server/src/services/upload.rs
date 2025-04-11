use crate::common::{ApiError, ApiResult};
use crate::extractors::{ClientIp, Header};
use crate::models::file_indexing::{IndexChangeAction, PreallocationFile, WriteIndexArgs};
use crate::state::AppState;
use crate::utils::decode_uri;
use axum::body::BodyDataStream;
use axum::extract::Query;
use axum::{
    extract::{Request, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::Read;
use tar::{Archive, EntryType};
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;

#[derive(Deserialize, Debug)]
pub struct UploadQueryParams {
    tags: Option<String>,
    caption: Option<String>,
}

async fn handle_file(
    mut stream: BodyDataStream,
    mut preallocation: PreallocationFile,
) -> Result<(PreallocationFile, String, usize), ApiError> {
    let mut hasher = Sha256::new();
    let mut size = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(v) => v,
            Err(err) => {
                preallocation.cleanup().await;
                return Err(ApiError::from(err));
            }
        };
        hasher.update(chunk.as_ref());
        match preallocation.file.write_all(chunk.as_ref()).await {
            Ok(_) => (),
            Err(err) => {
                preallocation.cleanup().await;
                return Err(ApiError::from(err));
            }
        }
        size += chunk.len()
    }
    let hash = format!("{:x}", hasher.finalize());
    Ok((preallocation, hash, size))
}

async fn handle_archive(
    mut stream: BodyDataStream,
    mut preallocation: PreallocationFile,
) -> Result<(PreallocationFile, String, usize), ApiError> {
    let mut size = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(v) => v,
            Err(err) => {
                preallocation.cleanup().await;
                return Err(ApiError::from(err));
            }
        };
        match preallocation.file.write_all(chunk.as_ref()).await {
            Ok(_) => (),
            Err(err) => {
                preallocation.cleanup().await;
                return Err(ApiError::from(err));
            }
        }
        size += chunk.len()
    }
    let mut hasher = Sha256::new();
    {
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .open(&preallocation.path)
            .unwrap();
        let mut archive = Archive::new(&mut file);
        let clean = || {
            if let Err(err) = std::fs::remove_file(&preallocation.path) {
                tracing::error!(reason = ?err, "Error: Failed to cleanup file from {:?}", &preallocation.path)
            }
        };
        for entry in archive.entries().map_err(|err| {
            clean();
            ApiError::from(err)
        })? {
            let mut entry = entry.map_err(|err| {
                clean();
                ApiError::from(err)
            })?;
            hasher.update(entry.path_bytes());
            if entry.header().entry_type() == EntryType::Directory {
                continue;
            }
            let mut buf = [0; 4096];
            loop {
                let n = entry.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
        }
    }
    let hash = format!("{:x}", hasher.finalize());
    Ok((preallocation, hash, size))
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "kebab-case")]
pub struct UploadHeaderDto {
    content_type: Option<String>,
    content_length: u64,
    user_agent: String,
    x_content_sha256: String,
    x_raw_filename: Option<String>,
}

pub async fn upload(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    query: Query<UploadQueryParams>,
    header: Header<UploadHeaderDto>,
    request: Request,
) -> ApiResult<impl IntoResponse> {
    let tags = query
        .tags
        .as_ref()
        .map(|it| {
            it.split(',')
                .map(|it| it.trim().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let caption = query.caption.clone().unwrap_or_default();
    let content_length = header.content_length;
    let content_type = header.content_type.clone();
    let content_hash = header.x_content_sha256.to_lowercase();
    let filename = header
        .x_raw_filename
        .clone()
        .map(|it| decode_uri(&it).map_err(ApiError::from))
        .transpose()?;

    let user_agent = header.user_agent.clone();

    // Check hash exists, if it exists, then cancel upload and return uuid
    if let Some(uuid) = state.indexing.has_hash(&content_hash) {
        return Err(ApiError::DuplicateFile(uuid));
    }
    let (uid, size, hash) = {
        // Preallocate disk space, uuid
        let preallocation = state
            .indexing
            .preallocation(&filename, &Some(content_length))
            .await?;
        let stream = request.into_body().into_data_stream();
        let (preallocation, hash, size) = if content_type
            .as_ref()
            .map(|t| t == "application/x-tar")
            .unwrap_or(false)
        {
            handle_archive(stream, preallocation).await?
        } else {
            handle_file(stream, preallocation).await?
        };
        if hash.as_str() != content_hash {
            preallocation.cleanup().await;
            return Err(ApiError::HashMismatch);
        }
        (preallocation.uid, size, hash)
    };

    state
        .indexing
        .write(WriteIndexArgs {
            uid,
            user_agent: Some(user_agent),
            filename,
            content_type,
            hash,
            size,
            ip,
            caption,
            tags,
        })
        .await?;
    if let Err(err) = state
        .notify_manager
        .send(IndexChangeAction::AddItem(uid).into())
    {
        tracing::error!(reason = ?err, "Failed dispatch add item event to notify manager");
    };
    Ok((StatusCode::CREATED, Json(uid)).into_response())
}
