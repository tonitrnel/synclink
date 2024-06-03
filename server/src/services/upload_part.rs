use crate::errors::{ApiResponse, ErrorKind, InternalError};
use crate::extractors::{ClientIp, Headers};
use crate::models::file_indexing::{IndexChangeAction, WriteIndexArgs};
use crate::state::AppState;
use crate::utils::decode_uri;
use anyhow::Context;
use axum::{
    extract::{Query, Request, State},
    http::StatusCode,
    response::{AppendHeaders, IntoResponse},
    Json,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::SeekFrom;
use std::path;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tokio::fs;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio_stream::{Stream, StreamExt};
use uuid::Uuid;

struct Session {
    hash: String,
    start: u64,
}

type Sessions = HashMap<Uuid, Session>;

static SHARED_SESSIONS: OnceLock<Arc<Mutex<Sessions>>> = OnceLock::new();
#[derive(Deserialize, Debug)]
pub struct QueryParams {
    id: Option<Uuid>,
    pos: Option<u64>,
    size: Option<u64>,
}

#[derive(Deserialize, Debug)]
pub struct ConcatenateQueryParams {
    id: Uuid,
    tags: Option<String>,
    caption: Option<String>,
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

fn access_shared_sessions() -> anyhow::Result<MutexGuard<'static, Sessions>> {
    match SHARED_SESSIONS
        .get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
        .lock()
    {
        Ok(guard) => Ok(guard),
        Err(err) => {
            anyhow::bail!("sessions lock failed, reason {:?}", err)
        }
    }
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
        if let Some((uid, session)) = access_shared_sessions()?
            .iter()
            .find(|(_, it)| it.hash == hash)
        {
            let uid = uid.to_owned();
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
        access_shared_sessions()?.insert(uid, Session { hash, start: 0 });
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
    if let Some(it) = access_shared_sessions()?.get_mut(uid) {
        it.start = end;
    }
    Ok(())
}

/// concatenate chunks
async fn exec_concatenate(
    storage_path: &path::Path,
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
        .map(path::Path::new)
        .and_then(|it| it.extension())
        .map(|it| format!(".{}", it.to_string_lossy()))
        .unwrap_or("".to_string());
    let path = storage_path.join(format!("{}{}", uid, ext));
    move_tmp_file(&temp, &path).await?;
    access_shared_sessions()?.remove(uid);
    Ok((path, size, format!("{:x}", hasher.finalize())))
}

async fn move_tmp_file(src: &path::Path, dest: &path::Path) -> anyhow::Result<()> {
    let src_dev = get_device_id(src)?;
    let dest_dev = get_device_id(dest)?;
    if src_dev != dest_dev {
        tokio::process::Command::new("/bin/mv")
            .arg(src.display().to_string())
            .arg(dest.display().to_string())
            .spawn()
            .with_context(|| "mv command failed to start")?
            .wait()
            .await
            .with_context(|| "mv command failed to run")?;
    } else {
        fs::rename(&src, &dest)
            .await
            .with_context(|| InternalError::RenameFileError {
                from_path: src.to_owned(),
                to_path: dest.to_owned(),
            })?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn get_device_id(path: &path::Path) -> anyhow::Result<u64> {
    use std::os::unix::fs::MetadataExt;
    path.parent()
        .with_context(|| {
            format!(
                "The provided path '{}' has no parent directory.",
                path.display()
            )
        })?
        .metadata()
        .map(|metadata| metadata.dev())
        .context("Failed to get metadata for the parent directory.")
}

#[cfg(not(target_os = "linux"))]
fn get_device_id(_path: &path::Path) -> anyhow::Result<u64> {
    Ok(0)
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
    access_shared_sessions()?.remove(uid);
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
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    query: Query<QueryParams>,
    request: Request,
) -> ApiResponse<impl IntoResponse> {
    let pos = query.pos()?;
    let current_start_position = {
        // Reduce the scope of the lock
        access_shared_sessions()?.get(&id).map(|it| it.start)
    };

    // Check for duplicate chunk
    if let Some(true) = current_start_position.map(|current| pos < current) {
        return Ok(Json("ok!"));
    }
    let stream = request.into_body().into_data_stream();
    exec_append(&id, stream, pos).await?;
    Ok(Json("ok!"))
}

pub async fn concatenate(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: Headers,
    query: Query<ConcatenateQueryParams>,
) -> ApiResponse<impl IntoResponse> {
    let id = query.id;
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
    if !access_shared_sessions()?.contains_key(&id) {
        return Ok(Json("ok!"));
    }
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
    let (path, size, hash) =
        exec_concatenate(state.indexing.get_storage_dir(), &id, &filename).await?;
    if content_hash != hash {
        fs::remove_file(&path)
            .await
            .with_context(|| InternalError::DeleteFileError { path })?;
        return Err(ErrorKind::HashMismatch);
    }
    state
        .indexing
        .write(WriteIndexArgs {
            uid: id,
            user_agent,
            filename,
            content_type,
            hash,
            size,
            ip,
            caption,
            tags,
        })
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
