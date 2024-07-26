use crate::common::{ApiError, ApiResult, InternalError};
use crate::extractors::{ClientIp, Header};
use crate::models::file_indexing::{IndexChangeAction, WriteIndexArgs};
use crate::state::AppState;
use crate::utils::{decode_uri, SessionManager};
use anyhow::Context;
use axum::{
    extract::{Query, Request, State},
    http::StatusCode,
    response::{AppendHeaders, IntoResponse},
    Json,
};
use serde::Deserialize;
use std::io::{Read, SeekFrom};
use std::path;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tar::Archive;
use tokio::fs;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio_stream::{Stream, StreamExt};
use uuid::Uuid;

struct Session {
    hash: String,
    start: u64,
}

static SHARED_SESSIONS: OnceLock<Arc<SessionManager<Uuid, Session>>> = OnceLock::new();

#[derive(Deserialize, Debug)]
pub struct ConcatenateQueryParams {
    id: Uuid,
    tags: Option<String>,
    caption: Option<String>,
}

fn access_shared_sessions() -> Arc<SessionManager<Uuid, Session>> {
    SHARED_SESSIONS
        .get_or_init(|| SessionManager::new(Duration::from_secs(300)))
        .clone()
}

/// allocate disk resource
async fn exec_allocate(size: u64, hash: String) -> anyhow::Result<(Uuid, u64)> {
    let path = std::env::temp_dir().join("cedasync");
    if !path.exists() {
        fs::create_dir(&path)
            .await
            .with_context(|| InternalError::CreateDirectoryError {
                path: path.to_owned(),
            })?;
    };
    let (uid, start, path) = {
        if let Some((uid, session)) = access_shared_sessions()
            .guard()
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
            .append(true)
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
        access_shared_sessions().insert(uid, Session { hash, start: 0 });
    }
    Ok((uid, start))
}

/// append chunks
async fn exec_append<S, E>(uid: &Uuid, mut stream: S, start: u64) -> anyhow::Result<()>
where
    S: Stream<Item = Result<axum::body::Bytes, E>> + 'static + Send + Unpin,
    E: Into<axum::BoxError>,
{
    let path = std::env::temp_dir().join("cedasync");
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
    let sessions = access_shared_sessions();
    if let Some(it) = sessions.guard().get_mut(uid) {
        it.start = end;
    }
    Ok(())
}

/// concatenate chunks
async fn exec_concatenate(
    storage_path: &path::Path,
    uid: &Uuid,
    filename: &Option<String>,
    is_archive: bool,
) -> anyhow::Result<(PathBuf, usize, String)> {
    use sha2::{Digest, Sha256};
    use tokio_util::io::ReaderStream;

    let path = std::env::temp_dir().join("cedasync");
    let temp = path.join(format!("{}.tmp", uid));
    let file = fs::OpenOptions::new()
        .read(true)
        .open(&temp)
        .await
        .with_context(|| InternalError::AccessFileError {
            path: path.to_owned(),
        })?;
    let mut hasher = Sha256::new();
    let mut size = 0;
    if is_archive {
        let mut file = file.into_std().await;
        size = file.metadata().unwrap().len() as usize;
        let mut archive = Archive::new(&mut file);
        for entry in archive.entries()? {
            let mut entry = entry?;
            hasher.update(entry.path_bytes());
            let mut buf = [0; 4096];
            loop {
                let n = entry.read(&mut buf).unwrap();
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
            }
        }
    } else {
        let mut stream = ReaderStream::new(file);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.with_context(|| InternalError::ReadStreamError {
                path: path.to_owned(),
            })?;
            size += chunk.len();
            hasher.update(&chunk);
        }
    }
    let ext = filename
        .as_ref()
        .map(path::Path::new)
        .and_then(|it| it.extension())
        .map(|it| format!(".{}", it.to_string_lossy()))
        .unwrap_or_default();
    let path = storage_path.join(format!("{}{}", uid, ext));
    move_tmp_file(&temp, &path).await?;
    access_shared_sessions().remove(uid);
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
        .join("cedasync")
        .join(format!("{}.tmp", uid));
    fs::remove_file(&path)
        .await
        .with_context(|| InternalError::DeleteFileError {
            path: path.to_owned(),
        })?;
    access_shared_sessions().remove(uid);
    Ok(())
}
#[derive(Deserialize, Debug)]
pub struct AllocateQueryDto {
    size: u64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "kebab-case")]
pub struct AllocateHeaderDto {
    x_content_sha256: String,
}

pub async fn allocate(
    State(state): State<AppState>,
    header: Header<AllocateHeaderDto>,
    query: Query<AllocateQueryDto>,
) -> ApiResult<impl IntoResponse> {
    let content_hash = header.x_content_sha256.to_lowercase();
    if let Some(uuid) = state.indexing.has_hash(&content_hash) {
        return Ok((
            StatusCode::CONFLICT,
            AppendHeaders([("location", uuid.to_string())]),
        )
            .into_response());
    }
    let size = query.size;
    let (uid, start) = exec_allocate(size, content_hash).await?;
    Ok((StatusCode::CREATED, format!("{uid};{start}")).into_response())
}

#[derive(Deserialize, Debug)]
pub struct AppendQueryDto {
    pos: u64,
}
pub async fn append(
    axum::extract::Path(id): axum::extract::Path<Uuid>,
    query: Query<AppendQueryDto>,
    request: Request,
) -> ApiResult<impl IntoResponse> {
    let pos = query.pos;
    let current_start_position = {
        // Reduce the scope of the lock
        access_shared_sessions().get(&id).map(|it| it.start)
    };

    // Check for duplicate chunk
    if let Some(true) = current_start_position.map(|current| pos < current) {
        return Ok(Json("ok!"));
    }
    let stream = request.into_body().into_data_stream();
    exec_append(&id, stream, pos).await?;
    Ok(Json("ok!"))
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "kebab-case")]
pub struct ConcatenateHeaderDto {
    content_type: Option<String>,
    user_agent: String,
    x_content_sha256: String,
    x_raw_filename: Option<String>,
}

pub async fn concatenate(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    header: Header<ConcatenateHeaderDto>,
    query: Query<ConcatenateQueryParams>,
) -> ApiResult<impl IntoResponse> {
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
    if !access_shared_sessions().contains_key(&id) {
        return Ok(Json("ok!"));
    }
    let content_type = header.content_type.clone();
    let content_hash = header.x_content_sha256.to_lowercase();
    let filename = header
        .x_raw_filename
        .as_ref()
        .map(|it| decode_uri(it).map_err(ApiError::from))
        .transpose()?;
    let user_agent = &header.user_agent;
    let (path, size, hash) = exec_concatenate(
        state.indexing.get_storage_dir(),
        &id,
        &filename,
        content_type
            .as_ref()
            .map(|t| t == "application/x-tar")
            .unwrap_or(false),
    )
    .await?;
    if content_hash != hash {
        fs::remove_file(&path)
            .await
            .with_context(|| InternalError::DeleteFileError { path })?;
        return Err(ApiError::HashMismatch);
    }
    state
        .indexing
        .write(WriteIndexArgs {
            uid: id,
            user_agent: Some(user_agent.to_owned()),
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
        .send(IndexChangeAction::AddItem(id).into())
    {
        tracing::warn!(%err, "{}", InternalError::BroadcastIndexChangeError(format!("add {} action", id)));
    }
    Ok(Json("ok!"))
}

#[derive(Deserialize, Debug)]
pub struct AbortQueryDto {
    id: Uuid,
}
pub async fn abort(query: Query<AbortQueryDto>) -> ApiResult<impl IntoResponse> {
    exec_cleanup(&query.id).await?;
    Ok(Json("ok!"))
}
