use crate::common::{AppError, InternalError};
use crate::models::file::FileMetadata;
use crate::services::file::{AppendArgs, FileService, QuotaReservationGuard};
use crate::services::image::ImageService;
use crate::utils::{TtiCache, guess_mimetype_from_file};
use axum::body::BodyDataStream;
use futures::Stream;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::io::{self, IoSlice, Read};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tar::{Archive, EntryType};
use tokio::fs;
use tokio::io::{AsyncSeekExt, AsyncWrite, AsyncWriteExt};
use tokio_stream::StreamExt;
use tokio_util::io::ReaderStream;
use uuid::Uuid;
use crate::models::Ulid;

pub struct PreallocatedFile {
    pub id: Uuid,
    file: Option<fs::File>,
    reservation_guard: Option<QuotaReservationGuard>,
    path: PathBuf,
    commited: bool,
}

impl PreallocatedFile {
    pub async fn new(
        dir: &Path,
        filename: Option<&String>,
        size: Option<&u64>,
    ) -> anyhow::Result<PreallocatedFile, AppError> {
        let id = Uuid::now_v7();
        let extname = filename
            .map(Path::new)
            .and_then(|it| it.extension())
            .map(|it| it.to_string_lossy());
        let path = dir.join(match extname {
            Some(extname) => format!("{}.{}", id, extname),
            None => id.to_string(),
        });
        let file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)
            .await?;

        if let Some(size) = size {
            file.set_len(*size).await.map_err(|e| match e.kind() {
                io::ErrorKind::StorageFull => AppError::DiskQuotaExceeded,
                _ => AppError::IoError(e),
            })?;
        }
        Ok(Self {
            id,
            file: Some(file),
            reservation_guard: None,
            path,
            commited: false,
        })
    }
    pub async fn new_temp(
        size: u64,
        reservation_guard: QuotaReservationGuard,
    ) -> anyhow::Result<Self, AppError> {
        let path = std::env::temp_dir().join("ephemera");
        if !path.exists() {
            fs::create_dir(&path).await?;
        };
        let id = Uuid::now_v7();
        let path = path.join(format!("{}.tmp", id));

        let file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .append(true)
            .open(&path)
            .await?;
        file.set_len(size).await.map_err(|e| match e.kind() {
            io::ErrorKind::StorageFull => AppError::DiskQuotaExceeded,
            _ => AppError::IoError(e),
        })?;

        Ok(Self {
            id,
            file: Some(file),
            reservation_guard: Some(reservation_guard),
            path,
            commited: false,
        })
    }
    #[cfg(target_os = "linux")]
    fn get_device_id(path: &Path) -> anyhow::Result<u64> {
        use std::os::unix::fs::MetadataExt;
        let device_id = path
            .parent()
            .ok_or_else(|| {
                anyhow::format_err!(
                    "The provided path '{}' has no parent directory.",
                    path.display()
                )
            })?
            .metadata()?
            .dev();
        Ok(device_id)
    }

    #[cfg(not(target_os = "linux"))]
    fn get_device_id(_path: &Path) -> anyhow::Result<u64> {
        Ok(0)
    }
    pub async fn persist(
        mut self,
        dir: &Path,
        filename: Option<&String>,
    ) -> anyhow::Result<PreallocatedFile> {
        use anyhow::Context;
        if self.reservation_guard.is_none() {
            anyhow::bail!("Failed to persist non-temporary file");
        }
        let src = self.get_absolute_path().to_path_buf();
        let id = self.id;
        let extname = filename
            .map(Path::new)
            .and_then(|it| it.extension())
            .map(|it| it.to_string_lossy());
        let dest = dir.join(match extname {
            Some(extname) => format!("{}.{}", id, extname),
            None => id.to_string(),
        });
        let reservation_guard = self.reservation_guard.take();
        if let Some(f) = self.file.take() {
            drop(f);
        }
        let src_dev = Self::get_device_id(src.as_path())?;
        let dest_dev = Self::get_device_id(dest.as_path())?;
        if src_dev != dest_dev {
            tokio::process::Command::new("/bin/mv")
                .arg(src.display().to_string())
                .arg(dest.display().to_string())
                .spawn()?
                .wait()
                .await?;
        } else {
            fs::rename(&src, &dest)
                .await
                .with_context(|| InternalError::RenameFileError {
                    from_path: src.to_owned(),
                    to_path: dest.to_owned(),
                })?;
        }
        Ok(Self {
            id,
            file: None,
            reservation_guard,
            path: dest,
            commited: false,
        })
    }
    pub async fn seek(&mut self, pos: io::SeekFrom) -> io::Result<u64> {
        let file = self.file.as_mut().unwrap();
        file.seek(pos).await
    }
    pub async fn get_std_file(&self) -> io::Result<std::fs::File> {
        Ok(self.get_file().await?.into_std().await)
    }
    pub async fn get_file(&self) -> io::Result<fs::File> {
        let file = self.file.as_ref().unwrap();
        file.sync_all().await?;
        let mut file = file.try_clone().await?;
        file.seek(io::SeekFrom::Start(0)).await?;
        Ok(file)
    }
    pub fn get_absolute_path(&self) -> &Path {
        self.path.as_path()
    }
    pub fn commit(&mut self) {
        self.commited = true;
    }
}

impl Drop for PreallocatedFile {
    fn drop(&mut self) {
        if let Some(f) = self.file.take() {
            drop(f);
        }
        if self.commited {
            return;
        }
        if let Err(err) = std::fs::remove_file(&self.path) {
            tracing::error!(path = %self.path.display(), ?err, "Failed to delete preallocated file");
        }
    }
}

impl AsyncWrite for PreallocatedFile {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<Result<usize, io::Error>> {
        let this = self.get_mut();
        if let Some(f) = &mut this.file {
            Pin::new(f).poll_write(cx, buf)
        } else {
            std::task::Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "file handle is already taken",
            )))
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), io::Error>> {
        let this = self.get_mut();
        if let Some(f) = &mut this.file {
            Pin::new(f).poll_flush(cx)
        } else {
            std::task::Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "file handle is already taken",
            )))
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), io::Error>> {
        let this = self.get_mut();
        if let Some(f) = &mut this.file {
            Pin::new(f).poll_shutdown(cx)
        } else {
            std::task::Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "file handle is already taken",
            )))
        }
    }

    fn poll_write_vectored(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        bufs: &[IoSlice<'_>],
    ) -> std::task::Poll<Result<usize, io::Error>> {
        let this = self.get_mut();
        if let Some(f) = &mut this.file {
            Pin::new(f).poll_write_vectored(cx, bufs)
        } else {
            std::task::Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "file handle is already taken",
            )))
        }
    }

    fn is_write_vectored(&self) -> bool {
        self.file.as_ref().map_or(false, |f| f.is_write_vectored())
    }
}

struct AllocatedPartSession {
    hash: Option<String>,
    written: u64,
    file: PreallocatedFile,
    size: u64,
}

pub struct UploadService {
    dir: PathBuf,
    file_service: Arc<FileService>,
    // store upload part info
    sessions: TtiCache<Uuid, AllocatedPartSession>,
}

pub struct UploadArgs {
    pub(crate) user_id: Option<Uuid>,
    pub(crate) device_id: Option<Ulid>,
    pub(crate) hash: Option<String>,
    pub(crate) ipaddr: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) caption: String,
    pub(crate) length: u64,
    pub(crate) mimetype: Option<String>,
    pub(crate) filename: Option<String>,
}

pub struct UploadPartArgs {
    pub(crate) user_id: Option<Uuid>,
    pub(crate) device_id: Option<Ulid>,
    pub(crate) ipaddr: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) caption: String,
    pub(crate) mimetype: Option<String>,
    pub(crate) filename: Option<String>,
}

impl UploadService {
    pub fn new(dir: PathBuf, file_service: Arc<FileService>) -> UploadService {
        Self {
            dir,
            file_service,
            sessions: TtiCache::new(Duration::from_secs(300)),
        }
    }
    async fn write_file(
        mut stream: BodyDataStream,
        preallocated: &mut PreallocatedFile,
    ) -> anyhow::Result<(String, usize), AppError> {
        let mut hasher = Sha256::new();
        let mut size = 0;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            hasher.update(chunk.as_ref());
            preallocated.write_all(chunk.as_ref()).await?;
            size += chunk.len();
        }

        let hash = format!("{:x}", hasher.finalize());
        Ok((hash, size))
    }
    async fn calculate_archive_hash(file: std::fs::File) -> anyhow::Result<String, AppError> {
        let task = tokio::task::spawn_blocking(move || {
            let mut hasher = Sha256::new();
            let mut archive = Archive::new(file);
            for entry in archive.entries()? {
                let mut entry = entry?;
                hasher.update(entry.path_bytes());
                if entry.header().entry_type() == EntryType::Directory {
                    continue;
                }
                let mut buf = [0; 4096];
                loop {
                    let n = entry.read(&mut buf)?;
                    if n == 0 {
                        break;
                    }
                    hasher.update(&buf[..n]);
                }
            }
            let hash = format!("{:x}", hasher.finalize());
            Ok(hash) as anyhow::Result<String, AppError>
        });
        Ok(task.await??)
    }
    async fn calculate_file_hash(file: fs::File) -> anyhow::Result<String, AppError> {
        let mut hasher = Sha256::new();
        let mut stream = ReaderStream::new(file);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            hasher.update(&chunk);
        }
        let hash = format!("{:x}", hasher.finalize());
        Ok(hash)
    }
    async fn write_archive(
        mut stream: BodyDataStream,
        preallocated: &mut PreallocatedFile,
    ) -> anyhow::Result<(String, usize), AppError> {
        let mut size = 0;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            preallocated.write_all(chunk.as_ref()).await?;
            size += chunk.len();
        }
        let hash = Self::calculate_archive_hash(preallocated.get_std_file().await?).await?;
        Ok((hash, size))
    }

    fn parse_filename(filename: Option<&String>) -> (String, Option<Cow<str>>) {
        let now = chrono::Local::now();
        if let Some(filename) = filename {
            let path = Path::new(filename);
            let filename = path
                .file_name()
                .map_or(Cow::Borrowed("untitled"), |it| it.to_string_lossy());
            let extname = path.extension().map(|it| it.to_string_lossy());
            (filename.to_string(), extname)
        } else {
            (format!("pasted_{}", now.format("%Y-%m-%d-%H-%M")), None)
        }
    }

    async fn prepare_related_assets(
        &self,
        path: &Path,
        mimetype: &str,
    ) -> anyhow::Result<FileMetadata> {
        if ImageService::is_support(mimetype) {
            let image_service = ImageService::new(path, mimetype)?;
            let filename = path
                .file_name()
                .map(|it| it.to_string_lossy())
                .ok_or_else(|| anyhow::format_err!("Failed to get file name"))?;
            let metadata = image_service
                .generate_thumbnail(&self.dir.join(format!("{}.thumbnail", filename)), 500, 280)
                .await?;
            return Ok(FileMetadata::Image(metadata));
        }
        Ok(FileMetadata::None)
    }

    pub async fn upload(
        &self,
        stream: BodyDataStream,
        args: UploadArgs,
    ) -> anyhow::Result<Uuid, AppError> {
        if let Some(hash) = args.hash.as_ref() {
            if let Some(existing_id) = self.file_service.exists(hash).await? {
                return Err(AppError::Conflict(existing_id));
            }
        }
        self.file_service
            .ensure_quota(args.user_id, args.length)
            .await?;
        let mut preallocated = PreallocatedFile::new(
            self.dir.as_path(),
            args.filename.as_ref(),
            Some(&args.length),
        )
        .await?;
        let (hash, size) = if args
            .mimetype
            .as_ref()
            .map_or(false, |mty| mty == "application/x-tar")
        {
            Self::write_archive(stream, &mut preallocated).await?
        } else {
            Self::write_file(stream, &mut preallocated).await?
        };
        if args.hash.map_or(false, |h| h != hash) {
            return Err(AppError::ETagMismatch);
        }
        let id = preallocated.id;
        let (basename, extname) = Self::parse_filename(args.filename.as_ref());
        let file = preallocated.get_file().await?;
        let mimetype =
            guess_mimetype_from_file(file, args.mimetype.as_deref(), extname.as_deref()).await;
        let size = size as u64;
        let tags = args.tags.join(", ");
        let metadata = self
            .prepare_related_assets(preallocated.get_absolute_path(), mimetype)
            .await
            .unwrap_or_else(|e| {
                tracing::error!("Failed to prepare related assets: {}", e);
                FileMetadata::None
            });
        self.file_service
            .append(AppendArgs {
                id,
                user_id: args.user_id,
                device_id: args.device_id,
                basename,
                hash,
                size,
                mimetype,
                extname: extname.as_deref(),
                ipaddr: args.ipaddr,
                caption: args.caption,
                tags,
                metadata,
            })
            .await?;
        preallocated.commit();
        Ok(id)
    }

    pub async fn allocate(
        &self,
        user_id: Option<Uuid>,
        hash: Option<String>,
        size: u64,
    ) -> anyhow::Result<(Uuid, u64), AppError> {
        if let Some(hash) = hash.as_ref() {
            if let Some(existing_id) = self.file_service.exists(hash).await? {
                return Err(AppError::Conflict(existing_id));
            }
        }
        self.file_service.ensure_quota(user_id, size).await?;

        let (id, start) = {
            let entry = hash.as_ref().and_then(|hash| {
                self.sessions
                    .iter()
                    .find(|it| it.value().hash.as_ref().map_or(false, |h| h == hash))
            });
            if let Some(entry) = entry {
                let id = entry.key().clone();
                let start = entry.value().written;
                (id, start)
            } else {
                let reservation_guard = self.file_service.reserve_quota(user_id, size);
                let file = PreallocatedFile::new_temp(size, reservation_guard).await?;
                let id = file.id.clone();

                self.sessions.insert(
                    id,
                    AllocatedPartSession {
                        hash,
                        file,
                        written: 0,
                        size,
                    },
                );
                (id, 0)
            }
        };
        Ok((id, start))
    }
    pub async fn append<S>(
        &self,
        id: &Uuid,
        mut stream: S,
        start: u64,
    ) -> anyhow::Result<(), AppError>
    where
        S: Stream<Item = Result<axum::body::Bytes, axum::Error>> + 'static + Send + Unpin,
    {
        let mut entry = self.sessions.get_mut(id).ok_or(AppError::NotFound)?;
        // 不允许重复写入 且除了最后一个 chunk 外每个 chunk size 应该是固定的
        if start < entry.written {
            return Ok(());
        }
        let file = &mut entry.file;
        file.seek(io::SeekFrom::Start(start)).await?;
        let mut end = start;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            end += chunk.len() as u64;
            file.write_all(chunk.as_ref()).await?;
        }
        entry.value_mut().written = end;
        Ok(())
    }

    pub async fn concatenate(
        &self,
        id: Uuid,
        args: UploadPartArgs,
    ) -> anyhow::Result<(), AppError> {
        let entry = self.sessions.get_mut(&id).ok_or(AppError::NotFound)?;
        if entry.written != entry.size {
            return Err(AppError::IncompleteUpload(entry.size, entry.written));
        }
        let hash = if args
            .mimetype
            .as_ref()
            .map_or(false, |mty| mty == "application/x-tar")
        {
            Self::calculate_archive_hash(entry.file.get_std_file().await?).await?
        } else {
            Self::calculate_file_hash(entry.file.get_file().await?).await?
        };
        if entry.hash.as_ref().map_or(false, |h| h != &hash) {
            return Err(AppError::ETagMismatch);
        }
        let (basename, extname) = Self::parse_filename(args.filename.as_ref());
        let file = entry.file.get_file().await?;
        let mimetype =
            guess_mimetype_from_file(file, args.mimetype.as_deref(), extname.as_deref()).await;
        let tags = args.tags.join(", ");
        let size = entry.size;
        drop(entry);
        let removed = self.sessions.remove(&id).unwrap();
        let mut preallocated = removed
            .file
            .persist(&self.dir, args.filename.as_ref())
            .await?;
        let metadata = self
            .prepare_related_assets(preallocated.get_absolute_path(), mimetype)
            .await
            .unwrap_or_else(|e| {
                tracing::error!("Failed to prepare related assets: {}", e);
                FileMetadata::None
            });
        self.file_service
            .append(AppendArgs {
                id,
                user_id: args.user_id,
                device_id: args.device_id,
                basename,
                hash,
                size,
                mimetype,
                extname: extname.as_deref(),
                ipaddr: args.ipaddr,
                caption: args.caption,
                tags,
                metadata,
            })
            .await?;
        preallocated.commit();
        Ok(())
    }
    
    pub async fn abort(&self, id: Uuid) -> anyhow::Result<(), AppError>{
        self.sessions.remove(&id).ok_or(AppError::NotFound)?;
        Ok(())
    }
}
