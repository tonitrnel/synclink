use crate::config::AppState;
use crate::errors::{ApiError, InternalError};
use crate::models::bucket::BucketAction;
use crate::utils::{HttpException, HttpResult};
use crate::{throw_error, try_break_ok, utils};
use anyhow::Context;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::{
    debug_handler,
    extract::{BodyStream, Path, Query, State},
    http::HeaderMap,
    Json,
};
use serde::{Deserialize, Deserializer};
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;
use uuid::Uuid;

#[derive(Debug)]
enum Action {
    Allocate,
    Append,
    Concatenate,
    Abort,
}

#[derive(Deserialize, Debug)]
pub struct QueryParams {
    #[serde(deserialize_with = "deserialize_act")]
    act: Action,
    pos: Option<u32>,
    #[serde(deserialize_with = "deserialize_option_parts", default)]
    parts: Option<Vec<u64>>,
}

fn deserialize_act<'de, D>(deserializer: D) -> Result<Action, D::Error>
where
    D: Deserializer<'de>,
{
    let s: String = Deserialize::deserialize(deserializer)?;
    match s.as_str() {
        "allocate" => Ok(Action::Allocate),
        "append" => Ok(Action::Append),
        "concatenate" => Ok(Action::Concatenate),
        "about" => Ok(Action::Abort),
        _ => Err(serde::de::Error::invalid_value(
            serde::de::Unexpected::Str(&s),
            &"'allocate', 'append', 'concatenate' either one",
        )),
    }
}

fn deserialize_option_parts<'de, D>(deserializer: D) -> Result<Option<Vec<u64>>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: Option<String> = Deserialize::deserialize(deserializer)?;
    match s {
        Some(s) => s
            .split(',')
            .map(|it| it.trim().parse::<u64>())
            .collect::<Result<Vec<_>, std::num::ParseIntError>>()
            .map(Some)
            .map_err(|err| serde::de::Error::custom(err.to_string())),
        None => Ok(None),
    }
}

/// allocate disk resource
async fn allocate(uid: &Uuid, parts: Vec<u64>) -> anyhow::Result<()> {
    let path = std::env::temp_dir().join("synclink");
    fs::create_dir(&path).await?;
    for (pos, size) in parts.iter().enumerate() {
        let path = path.join(format!("{}.part.{}", uid, pos));
        let file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(&path)
            .await
            .with_context(|| InternalError::OpenFile(&path).to_string())?;
        file.set_len(*size)
            .await
            .with_context(|| InternalError::SetFileLength(&path, size).to_string())?;
    }
    Ok(())
}

/// append chunks
async fn append(uid: &Uuid, stream: &mut BodyStream, pos: u32) -> anyhow::Result<()> {
    let path = std::env::temp_dir().join("synclink");
    let path = path.join(format!("{}.part.{}", uid, pos));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .await
        .with_context(|| InternalError::OpenFile(&path).to_string())?;
    while let Some(chunk) = stream.next().await {
        file.write_all(chunk.with_context(|| InternalError::ReadStream)?.as_ref())
            .await
            .with_context(|| InternalError::WriteFile(&path).to_string())?;
    }
    Ok(())
}

/// concatenate chunks
async fn concatenate(
    storage_path: &std::path::Path,
    uid: &Uuid,
    filename: &Option<String>,
) -> anyhow::Result<(PathBuf, usize, String)> {
    use sha2::{Digest, Sha256};
    use tokio_util::io::ReaderStream;

    // retrieving path of part files
    let mut parts = Vec::new();
    let path = std::env::temp_dir().join("synclink");
    let prefix = format!("{}.part.", uid);
    for entry in std::fs::read_dir(&path)? {
        let entry = entry?;
        let path = entry.path();
        let filename = path.file_name().and_then(|it| it.to_str()).unwrap_or("");
        if filename.starts_with(&prefix) && path.is_file() {
            parts.push(path)
        }
    }
    // create dst file
    let ext = filename
        .as_ref()
        .map(std::path::Path::new)
        .and_then(|it| it.extension())
        .map(|it| format!(".{}", it.to_string_lossy()))
        .unwrap_or("".to_string());
    let temp = path.join(format!("{}{}.part", uid, ext));
    let mut dst = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .open(&temp)
        .await?;
    let mut hasher = Sha256::new();
    let mut size = 0;
    // copy and delete
    for part in parts {
        let src = fs::File::open(&part)
            .await
            .with_context(|| InternalError::OpenFile(&path).to_string())?;
        let mut stream = ReaderStream::new(src);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.with_context(|| InternalError::ReadStream)?;
            hasher.update(&chunk);
            size += chunk.len();
            dst.write_all(&chunk)
                .await
                .with_context(|| InternalError::WriteFile(&part).to_string())?;
        }
        fs::remove_file(&part)
            .await
            .with_context(|| InternalError::DeleteFile(&part).to_string())?;
    }
    let path = storage_path.join(format!("{}{}", uid, ext));
    fs::rename(&temp, &path)
        .await
        .with_context(|| InternalError::RenameFile(&temp, &path).to_string())?;
    Ok((path, size, format!("{:x}", hasher.finalize())))
}

/// cleanup uploaded chunks
async fn cleanup(uid: &Uuid) -> anyhow::Result<()> {
    let path = std::env::temp_dir().join("synclink");
    let prefix = format!("{}.part", uid); // part files and temp file
    for entry in std::fs::read_dir(&path)? {
        let entry = entry?;
        let path = entry.path();
        let filename = path.file_name().and_then(|it| it.to_str()).unwrap_or("");
        if filename.starts_with(&prefix) {
            fs::remove_file(&path)
                .await
                .with_context(|| InternalError::DeleteFile(&path).to_string())?;
        }
    }
    Ok(())
}

#[debug_handler]
pub async fn upload_part(
    State(state): State<AppState>,
    id: Option<Path<Uuid>>,
    query: Query<QueryParams>,
    headers: HeaderMap,
    mut stream: BodyStream,
) -> HttpResult<impl IntoResponse> {
    let query: QueryParams = query.0;
    let uid: Option<Uuid> = id.map(|it| it.0);
    match query.act {
        Action::Allocate => {
            let content_hash = try_break_ok!(headers
                .get("x-content-sha256")
                .map(|it| String::from_utf8_lossy(it.as_bytes()).to_lowercase())
                .ok_or((
                    HttpException::BadRequest,
                    ApiError::HeaderFieldMissing("X-Content-Sha256")
                )));
            if let Some(uuid) = state.bucket.has_hash(&content_hash) {
                return Ok::<_, ()>(Json(uuid).into_response()).into();
            }
            let uid = Uuid::new_v4();
            if query.parts.is_none() {
                throw_error!(
                    HttpException::BadRequest,
                    ApiError::QueryFieldMissing("parts")
                )
            }
            try_break_ok!(allocate(&uid, query.parts.unwrap()).await);
            Ok::<_, ()>((StatusCode::CREATED, Json(uid.to_string())).into_response()).into()
        }
        Action::Append => {
            let uid = match uid {
                Some(id) => id,
                None => throw_error!(HttpException::BadRequest, ApiError::PathParameterMissing),
            };
            let pos = match query.pos {
                Some(pos) => pos,
                None => throw_error!(
                    HttpException::BadRequest,
                    ApiError::QueryFieldMissing("pos")
                ),
            };
            try_break_ok!(append(&uid, &mut stream, pos).await);
            Ok::<_, ()>(Json("ok!".to_string()).into_response()).into()
        }
        Action::Concatenate => {
            let uid = match uid {
                Some(id) => id,
                None => throw_error!(HttpException::BadRequest, ApiError::PathParameterMissing),
            };
            let content_type = try_break_ok!(headers
                .get("content-type")
                .map(|it| String::from_utf8_lossy(it.as_bytes()).to_string())
                .ok_or((
                    HttpException::BadRequest,
                    ApiError::HeaderFieldMissing("Content-Type")
                )));
            let content_hash = try_break_ok!(headers
                .get("x-content-sha256")
                .map(|it| String::from_utf8_lossy(it.as_bytes()).to_lowercase())
                .ok_or((
                    HttpException::BadRequest,
                    ApiError::HeaderFieldMissing("X-Content-Sha256")
                )));
            let filename = headers
                .get("x-raw-filename")
                .and_then(|it| it.to_str().ok())
                .and_then(|it| utils::decode_uri(it).ok());
            let (path, size, hash) =
                try_break_ok!(concatenate(state.bucket.get_storage_path(), &uid, &filename).await);
            if content_hash != hash {
                try_break_ok!(fs::remove_file(&path)
                    .await
                    .with_context(|| InternalError::Cleanup));
                throw_error!(HttpException::BadRequest, ApiError::HashMismatch)
            }
            try_break_ok!(
                state
                    .bucket
                    .write(uid, filename, content_type, hash, size)
                    .await
            );
            if let Err(err) = state.broadcast.send(BucketAction::Add(uid)) {
                tracing::warn!(%err, "{}", InternalError::Broadcast(&format!("add {} action", uid)));
            }
            Ok::<_, ()>(Json("ok!".to_string()).into_response()).into()
        }
        Action::Abort => {
            let uid = match uid {
                Some(id) => id,
                None => throw_error!(HttpException::BadRequest, ApiError::PathParameterMissing),
            };
            try_break_ok!(cleanup(&uid).await);
            Ok::<_, ()>(Json("ok!".to_string()).into_response()).into()
        }
    }
}
