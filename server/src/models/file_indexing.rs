use crate::config;
use crate::models::entity::{Entity, EntityMetadata};
use crate::models::image::Image;
use crate::utils::guess_mimetype_from_path;
use anyhow::Context;
use serde::Deserialize;
use std::fmt::{Display, Formatter};
use std::io::SeekFrom;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncSeekExt, AsyncWriteExt};
use tokio::{fs, io::AsyncReadExt};
use uuid::Uuid;

pub struct PreallocationFile {
    pub uid: Uuid,
    pub file: fs::File,
    pub path: PathBuf,
}

impl PreallocationFile {
    /// 清理文件
    pub async fn cleanup(self) {
        drop(self.file);
        if let Err(err) = fs::remove_file(&self.path).await {
            tracing::error!(reason = ?err, "Error: Failed to cleanup file from {:?}", self.path)
        };
    }
}

#[derive(Deserialize, Debug, Clone)]
struct Index {
    #[serde(rename = "item", default)]
    items: Vec<Entity>,
}

#[derive(Debug)]
pub struct FileIndexing {
    index: Arc<Mutex<Index>>,
    index_file: fs::File,
    directory: PathBuf,
}

#[derive(Debug)]
pub struct WriteIndexArgs {
    pub uid: Uuid,
    pub user_agent: Option<String>,
    pub filename: Option<String>,
    pub content_type: Option<String>,
    pub hash: String,
    pub size: usize,
    pub ip: Option<String>,
    pub caption: String,
    pub tags: Vec<String>,
}

impl WriteIndexArgs {
    async fn into_entity(self, dir: &PathBuf) -> Entity {
        let now = chrono::Local::now();
        let (name, ext) = if let Some(_name) = self.filename.as_ref() {
            let path = Path::new(_name);
            let name = path
                .file_name()
                .map(|it| it.to_string_lossy().to_string())
                .unwrap_or("untitled".to_string());
            let ext = path.extension().map(|it| it.to_string_lossy().to_string());
            (name, ext)
        } else {
            (format!("pasted_{}", now.format("%Y-%m-%d-%H-%M")), None)
        };
        let resource = match &ext {
            Some(ext) => format!("{}.{}", self.uid, ext),
            None => self.uid.to_string(),
        };
        Entity {
            uid: self.uid,
            name,
            created: now.timestamp_millis(),
            modified: None,
            hash: self.hash,
            size: self.size as u64,
            content_type: guess_mimetype_from_path(dir.join(resource), self.content_type).await,
            ext,
            ip: self.ip,
            metadata: None,
            caption: self.caption,
            tags: self.tags,
        }
    }
}

impl FileIndexing {
    pub async fn new(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_owned();
        if !&path.is_dir() {
            panic!("Error: Path '{:?}' is not a directory", path.as_os_str())
        }
        let index_path = path.join("index.toml");
        if index_path.exists() && !index_path.is_file() {
            panic!("Error: Path '{:?}' is not a file", index_path.as_os_str())
        }
        let mut index_file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(!index_path.exists())
            .open(&index_path)
            .await
            .unwrap_or_else(|_| panic!("Error: Index file open '{:?}' failed", &index_path));
        let mut index_content = String::new();
        index_file
            .read_to_string(&mut index_content)
            .await
            .unwrap_or_else(|_| panic!("Error: Index read '{:?}' failed", index_path.as_os_str()));
        let index: Index = toml::from_str(&index_content).unwrap_or_else(|err| {
            eprintln!("{:#?}", err);
            panic!("Error: Index parse failed")
        });
        let path = index_path.parent().unwrap().to_path_buf();
        Self {
            index: Arc::new(Mutex::new(index)),
            index_file,
            directory: path,
        }
    }
    /// Get BucketEntity
    pub fn get(&self, id: &Uuid) -> Option<Entity> {
        let guard = &self.index.lock().unwrap();
        guard.items.iter().find(|it| it.uid == *id).cloned()
    }
    pub fn has(&self, id: &Uuid) -> bool {
        let guard = &self.index.lock().unwrap();
        guard.items.iter().any(|it| &it.uid == id)
    }
    pub fn has_hash(&self, hash: &str) -> Option<Uuid> {
        let guard = self.index.lock().unwrap();
        if let Some(uuid) =
            guard
                .items
                .iter()
                .find_map(|it| if it.hash == hash { Some(it.uid) } else { None })
        {
            return Some(uuid);
        }
        None
    }
    pub fn map_clone<T, F>(&self, f: F) -> T
    where
        F: FnOnce(&Vec<Entity>) -> T,
    {
        let guard = self.index.lock().unwrap();
        f(&guard.items)
    }
    async fn delete_related_files(&self, entity: &Entity) -> anyhow::Result<()> {
        let resource_path = self.get_storage_dir().join(entity.get_resource());
        if resource_path.exists() {
            fs::remove_file(&resource_path).await.with_context(|| {
                format!("Error: Remove resource file '{:?}' failed", &resource_path)
            })?;
        }
        // 缩略图
        {
            let thumbnail_path = self
                .get_storage_dir()
                .join(format!("{}.thumbnail", entity.get_resource()));
            if thumbnail_path.exists() {
                if let Err(err) = fs::remove_file(&thumbnail_path).await {
                    tracing::warn!(reason = ?err, "failed to remove thumbnail file, path = {:?}", thumbnail_path);
                };
            }
        }
        // 索引
        {
            let idx_path = self
                .get_storage_dir()
                .join(format!("{}.idx", entity.get_resource()));
            if idx_path.exists() {
                if let Err(err) = fs::remove_file(&idx_path).await {
                    tracing::warn!(reason = ?err, "failed to remove index file, path = {:?}", idx_path);
                };
            }
        }
        Ok(())
    }
    pub async fn delete(&self, id: &Uuid) -> anyhow::Result<()> {
        let (idx, entity) = {
            let mut guard = self.index.lock().unwrap();
            if let Some(idx) = guard.items.iter().position(|it| &it.uid == id) {
                (idx, guard.items.remove(idx))
            } else {
                tracing::warn!("no index matching {uid} was found.", uid = id);
                return Ok(());
            }
        };
        tracing::info!(target: "event", "delete [uuid={id}]");
        if let Err(err) = self.delete_related_files(&entity).await {
            tracing::error!(reason = ?err, "failed to delete related files, rollback index.");
            self.index.lock().unwrap().items.insert(idx, entity);
            return Err(err);
        }
        self.sync_index_to_storage().await?;
        tracing::info!(target: "event", "delete [uuid={id}] successfully");
        Ok(())
    }
    async fn sync_index_to_storage(&self) -> anyhow::Result<()> {
        let mut file = self.index_file.try_clone().await?;
        file.seek(SeekFrom::Start(0)).await?;
        let content = {
            let items = &self.index.lock().unwrap().items;
            // Regenerate index file content
            if items.is_empty() {
                "".to_string()
            } else {
                let mut str = String::new();
                for item in items {
                    if let Err(err) = item.serialize_and_write(&mut str, "item") {
                        tracing::error!(reason = ?err, "failed to serialize string");
                        anyhow::bail!("failed to update index")
                    }
                }
                str
            }
        };
        let bytes = content.as_bytes();
        // `write_all` is used to overwrite not truncate, so set the length here to ensure that all content is overwritten
        file.set_len(bytes.len() as u64).await?;
        file.write_all(bytes)
            .await
            .with_context(|| "failed to write index to disk")?;
        self.sync_all().await?;
        Ok(())
    }
    pub fn get_storage_dir(&self) -> &PathBuf {
        &self.directory
    }
    /// Writing entity to index file
    async fn write_index(&self, entity: &Entity) -> anyhow::Result<()> {
        let mut part = String::new();
        if let Err(err) = entity.serialize_and_write(&mut part, "item") {
            tracing::error!(reason = ?err, "failed to serialize string");
            anyhow::bail!("failed to update index")
        };
        let mut file = self.index_file.try_clone().await?;
        file.seek(SeekFrom::End(0)).await?;
        file.write_all(part.as_bytes())
            .await
            .with_context(|| "Fatal Error: Write new index to index file failed")?;
        self.sync_all().await?;
        Ok(())
    }
    /// Sync indexes to index file
    async fn sync_all(&self) -> anyhow::Result<()> {
        self.index_file
            .sync_all()
            .await
            .with_context(|| "Fatal Error: Sync indexes to file failed")
    }
    /// Pre-allocate a UUID and file with the option to pre-size.
    ///
    /// # Params
    /// - `ext`：The extension of the file, optionally. If an extension is provided, the file name will be in the form of a `{UUID}.{extension}`.
    /// - `size`：Pre-allocated file size, optional. If size is provided, will set the size of the file to the specified value.
    ///
    /// # Return
    /// Returns a tuple containing the generated UUID and the opened file, returning `Ok` on success and `Err` on failure.
    pub async fn preallocation(
        &self,
        filename: &Option<String>,
        size: &Option<u64>,
    ) -> anyhow::Result<PreallocationFile> {
        let uid = Uuid::new_v4();
        let ext = filename
            .as_ref()
            .map(Path::new)
            .and_then(|it| it.extension())
            .map(|it| it.to_string_lossy().to_string());
        let path = self.directory.join({
            match ext {
                Some(ext) => format!("{}.{}", uid, ext),
                None => uid.to_string(),
            }
        });
        let file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)
            .await?;
        if let Some(size) = size {
            file.set_len(*size).await?;
        }
        Ok(PreallocationFile { uid, file, path })
    }
    /// Writing bucket to index file
    pub async fn write(&self, args: WriteIndexArgs) -> anyhow::Result<()> {
        let uid = args.uid.to_string();
        let mut entity = args.into_entity(self.get_storage_dir()).await;
        if let Err(err) = self.prepare_related_assets(&mut entity).await {
            tracing::warn!(reason = ?err, "failed to prepare related assets")
        }
        tracing::info!(target: "event",
            "write [uuid={uid}] [filename={filename}] [mime_type={mime_type}] [ext={extension:?}]",
            filename = entity.name, mime_type = entity.content_type, extension = entity.ext
        );
        self.write_index(&entity).await?;
        self.index.lock().unwrap().items.push(entity);
        tracing::info!(target: "event", "write [uuid={uid}] successfully");
        Ok(())
    }
    pub async fn prepare_related_assets(&self, entity: &mut Entity) -> anyhow::Result<()> {
        if Image::is_support(&entity.content_type) {
            let image = Image::new(
                self.get_storage_dir().join(entity.get_resource()),
                entity.content_type.to_owned(),
            )
            .await?;
            entity.metadata = Some(EntityMetadata::Image(image.get_metadata()));
            image
                .generate_thumbnail(
                    self.get_storage_dir()
                        .join(format!("{}.thumbnail", entity.get_resource())),
                    500,
                    500,
                )
                .await?;
        }
        Ok(())
    }
    // pub fn check_file_size_limit(&self, file_size: u64) -> anyhow::Result<()> {
    //     if let Some(max_size_of) = config::load().file_storage.max_size_of_file {
    //         if max_size_of >= file_size as usize {
    //             Ok(())
    //         } else {
    //             anyhow::bail!("The file size exceeds the maximum limit. Allowed maximum size is {max_size_of} bytes, but the file size is {file_size} bytes.")
    //         }
    //     } else {
    //         Ok(())
    //     }
    // }
    pub fn check_storage_quota_exceeded(&self, file_size: u64) -> anyhow::Result<()> {
        let c = &config::load().file_storage;
        let quota = c.get_quota();
        let default_reserved = c.get_default_reserved();
        let current_storage = self
            .index
            .lock()
            .unwrap()
            .items
            .iter()
            .fold(0, |a, b| a + *b.get_size());
        if ((current_storage + file_size) as usize) < quota - default_reserved {
            Ok(())
        } else {
            anyhow::bail!("Adding this file exceeds the storage quota. Current storage usage is ${current_storage} bytes plus the file size of ${file_size} bytes exceeds the quota of ${quota} bytes.")
        }
    }
}

#[derive(Debug, Clone)]
pub enum IndexChangeAction {
    AddItem(Uuid),
    DelItem(Uuid),
}

impl IndexChangeAction {
    pub fn to_json(&self) -> String {
        let (action, uid) = match self {
            IndexChangeAction::AddItem(uid) => ("RECORD_ADDED", uid),
            IndexChangeAction::DelItem(uid) => ("RECORD_DELETED", uid),
        };
        serde_json::json!({
            "type": action,
            "payload": uid
        })
        .to_string()
    }
}

impl Display for IndexChangeAction {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let (action, uid) = match self {
            IndexChangeAction::AddItem(uid) => ("ADD", uid),
            IndexChangeAction::DelItem(uid) => ("DELETE", uid),
        };
        write!(f, "[{}]@{}", action, uid)
    }
}
