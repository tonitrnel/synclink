use crate::errors::{ApiResponse, ErrorKind, InternalError};
use crate::extactors::Headers;
use crate::models::file_indexing::IndexChangeAction;
use crate::state::AppState;
use crate::utils::decode_uri;
use anyhow::Context;
use axum::extract::ConnectInfo;
use axum::{
    extract::{Path, Query, Request, State},
    http::StatusCode,
    response::{AppendHeaders, IntoResponse},
    Json,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::SeekFrom;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::fs;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio_stream::{Stream, StreamExt};
use uuid::Uuid;

struct Session {
    hash: String,
    start: u64,
}

static SESSION_MAP: OnceLock<Arc<Mutex<HashMap<String, Session>>>> = OnceLock::new();

#[derive(Deserialize, Debug)]
pub struct QueryParams {
    id: Option<Uuid>,
    pos: Option<u64>,
    size: Option<u64>,
}

impl QueryParams {
    fn id(&self) -> Result<Uuid, ErrorKind> {
        self.id
            .ok_or_else(|| ErrorKind::QueryFieldMissing("id".to_string()))
    }
    fn pos(&self) -> Result<u64, ErrorKind> {
        self.pos
            .ok_or_else(|| ErrorKind::QueryFieldMissing("pos".to_string()))
    }
    fn size(&self) -> Result<u64, ErrorKind> {
        self.size
            .ok_or_else(|| ErrorKind::QueryFieldMissing("size".to_string()))
    }
}

fn get_session_map() -> Arc<Mutex<HashMap<String, Session>>> {
    SESSION_MAP
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .clone()
}

/// allocate disk resource
async fn exec_allocate(size: u64, hash: String) -> anyhow::Result<(Uuid, u64)> {
    let path = std::env::temp_dir().join("synclink");
    if !path.exists() {
        fs::create_dir(&path)
            .await
            .with_context(|| InternalError::CreateDirectoryError {
                path: path.to_owned(),
            })?;
    };
    let (uid, start, path) = {
        if let Some((uid, session)) = get_session_map()
            .lock()
            .unwrap()
            .iter()
            .find(|(_, it)| it.hash == hash)
        {
            let uid = Uuid::try_parse(uid)
                .with_context(|| "Unexpected error, session stored illegal uuid")?;
            let path = path.join(format!("{}.tmp", uid));
            if path.exists() && path.is_file() {
                (uid, session.start, path)
            } else {
                (uid, 0, path)
            }
        } else {
            let uid = Uuid::new_v4();
            let path = path.join(format!("{}.tmp", uid));
            (uid, 0, path)
        }
    };
    if !path.exists() {
        let file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(&path)
            .await
            .with_context(|| InternalError::AccessFileError {
                path: path.to_owned(),
            })?;
        file.set_len(size)
            .await
            .with_context(|| InternalError::SetFileSizeError {
                path: path.to_owned(),
            })?;
    }
    if start == 0 {
        get_session_map()
            .lock()
            .unwrap()
            .insert(uid.to_string(), Session { hash, start: 0 });
    }
    Ok((uid, start))
}

/// append chunks
async fn exec_append<S, E>(uid: &Uuid, mut stream: S, start: u64) -> anyhow::Result<()>
where
    S: Stream<Item = Result<axum::body::Bytes, E>> + 'static + Send + Unpin,
    E: Into<axum::BoxError>,
{
    let path = std::env::temp_dir().join("synclink");
    let path = path.join(format!("{}.tmp", uid));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .await
        .with_context(|| InternalError::AccessFileError {
            path: path.to_owned(),
        })?;
    file.seek(SeekFrom::Start(start))
        .await
        .with_context(|| InternalError::FileSeekError {
            path: path.to_owned(),
        })?;
    let mut end = start;
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(_) => {
                anyhow::bail!(InternalError::ReadStreamError {
                    path: path.to_owned(),
                })
            }
        };
        end += chunk.len() as u64;
        file.write_all(chunk.as_ref())
            .await
            .with_context(|| InternalError::WriteFileError {
                path: path.to_owned(),
            })?;
    }
    {
        if let Some(it) = get_session_map().lock().unwrap().get_mut(&uid.to_string()) {
            it.start = end;
        }
    }
    Ok(())
}

/// concatenate chunks
async fn exec_concatenate(
    storage_path: &std::path::Path,
    uid: &Uuid,
    filename: &Option<String>,
) -> anyhow::Result<(PathBuf, usize, String)> {
    use sha2::{Digest, Sha256};
    use tokio_util::io::ReaderStream;

    let path = std::env::temp_dir().join("synclink");
    let temp = path.join(format!("{}.tmp", uid));
    let file = fs::OpenOptions::new()
        .read(true)
        .open(&temp)
        .await
        .with_context(|| InternalError::AccessFileError {
            path: path.to_owned(),
        })?;
    let mut hasher = Sha256::new();
    let mut stream = ReaderStream::new(file);
    let mut size = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.with_context(|| InternalError::ReadStreamError {
            path: path.to_owned(),
        })?;
        size += chunk.len();
        hasher.update(&chunk);
    }
    let ext = filename
        .as_ref()
        .map(std::path::Path::new)
        .and_then(|it| it.extension())
        .map(|it| format!(".{}", it.to_string_lossy()))
        .unwrap_or("".to_string());
    let path = storage_path.join(format!("{}{}", uid, ext));
    fs::rename(&temp, &path)
        .await
        .with_context(|| InternalError::RenameFileError {
            from_path: temp.to_owned(),
            to_path: path.to_owned(),
        })?;
    get_session_map().lock().unwrap().remove(&uid.to_string());
    Ok((path, size, format!("{:x}", hasher.finalize())))
}

/// cleanup uploaded chunks
async fn exec_cleanup(uid: &Uuid) -> anyhow::Result<()> {
    let path = std::env::temp_dir()
        .join("synclink")
        .join(format!("{}.tmp", uid));
    fs::remove_file(&path)
        .await
        .with_context(|| InternalError::DeleteFileError {
            path: path.to_owned(),
        })?;
    get_session_map().lock().unwrap().remove(&uid.to_string());
    Ok(())
}

pub async fn allocate(
    State(state): State<AppState>,
    headers: Headers,
    query: Query<QueryParams>,
) -> ApiResponse<impl IntoResponse> {
    let content_hash = headers
        .get("x-content-sha256")
        .try_as_string()?
        .to_lowercase();
    if let Some(uuid) = state.indexing.has_hash(&content_hash) {
        return Ok((
            StatusCode::CONFLICT,
            AppendHeaders([("location", uuid.to_string())]),
        )
            .into_response());
    }
    let size = query.size()?;
    let (uid, start) = exec_allocate(size, content_hash).await?;
    Ok((StatusCode::CREATED, format!("{uid};{start}")).into_response())
}

pub async fn append(
    Path(id): Path<Uuid>,
    query: Query<QueryParams>,
    request: Request,
) -> ApiResponse<impl IntoResponse> {
    let pos = query.pos()?;
    let stream = request.into_body().into_data_stream();
    exec_append(&id, stream, pos).await?;
    Ok(Json("ok!".to_string()).into_response())
}

pub async fn concatenate(
    State(state): State<AppState>,
    query: Query<QueryParams>,
    headers: Headers,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResponse<impl IntoResponse> {
    let id = query.id()?;
    let content_type = headers.get("content-type").try_as_string()?;
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
    let (path, size, hash) =
        exec_concatenate(state.indexing.get_storage_path(), &id, &filename).await?;
    if content_hash != hash {
        fs::remove_file(&path)
            .await
            .with_context(|| InternalError::DeleteFileError { path })?;
        return Err(ErrorKind::HashMismatch);
    }
    state
        .indexing
        .write(id, user_agent, filename, content_type, hash, size, host)
        .await?;
    if let Err(err) = state.broadcast.send(IndexChangeAction::AddItem(id)) {
        tracing::warn!(%err, "{}", InternalError::BroadcastIndexChangeError(format!("add {} action", id)));
    }
    Ok(Json("ok!"))
}

pub async fn abort(query: Query<QueryParams>) -> ApiResponse<impl IntoResponse> {
    let id = query.id()?;
    exec_cleanup(&id).await?;
    Ok(Json("ok!"))
}
