use crate::utils;
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};
use std::io::{Seek, SeekFrom, Write};
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tokio::{fs, sync::Mutex};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BucketEntity {
    /// assigned uid
    uid: Uuid,
    /// created date of the content
    #[serde(
        serialize_with = "utils::serialize_i64_to_utc",
        deserialize_with = "utils::deserialize_utc_to_i64"
    )]
    created: i64,
    /// modified date of the content
    #[serde(
        serialize_with = "utils::serialize_option_i64_to_utc",
        deserialize_with = "utils::deserialize_option_utc_to_i64",
        skip_serializing_if = "Option::is_none",
        default
    )]
    modified: Option<i64>,
    /// original file name of the content
    name: String,
    /// hash of the content
    hash: String,
    /// length of content
    size: u64,
    /// mime type of the content
    r#type: String,
    /// original file extension of the content
    ext: Option<String>,
}

#[allow(unused)]
impl BucketEntity {
    pub fn get_uid(&self) -> &Uuid {
        &self.uid
    }
    pub fn get_filename(&self) -> String {
        match &self.ext {
            Some(ext) => format!("{}.{}", self.name, ext),
            None => self.name.to_string(),
        }
    }
    pub fn get_resource(&self) -> String {
        match &self.ext {
            Some(ext) => format!("{}.{}", self.uid, ext),
            None => self.uid.to_string(),
        }
    }
    pub fn get_hash(&self) -> &str {
        &self.hash
    }
    pub fn get_name(&self) -> &str {
        &self.name
    }
    pub fn get_size(&self) -> &u64 {
        &self.size
    }
    pub fn get_type(&self) -> &str {
        &self.r#type
    }
    pub fn get_created(&self) -> &i64 {
        &self.created
    }
    pub fn get_modified(&self) -> &Option<i64> {
        &self.modified
    }
    pub fn get_created_date(&self) -> String {
        utils::i64_to_utc(&self.created).unwrap()
    }
    pub fn get_modified_date(&self) -> Option<String> {
        self.modified.map(|t| utils::i64_to_utc(&t).unwrap())
    }
    pub fn get_extension(&self) -> &Option<String> {
        &self.ext
    }
}

impl PartialEq for BucketEntity {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}

pub struct PreallocationFile {
    pub uid: Uuid,
    pub file: fs::File,
    pub path: PathBuf,
}

impl PreallocationFile {
    /// 清理文件
    pub async fn cleanup(self) -> anyhow::Result<()> {
        drop(self.file);
        fs::remove_file(&self.path)
            .await
            .with_context(|| format!("Error: Cleanup file failed from {:?}", self.path))?;
        Ok(())
    }
}

#[macro_export]
macro_rules! cleanup_preallocation {
    ($pre:ident) => {
        if let Err(_err) = $pre.cleanup().await {
            return Err(_err).into();
        };
    };
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Index {
    #[serde(rename = "item", default)]
    items: Vec<BucketEntity>,
}

pub(crate) struct Bucket {
    index: Arc<Mutex<Index>>,
    index_file: std::fs::File,
    path: PathBuf,
}

impl Bucket {
    pub(crate) async fn connect(path: impl AsRef<Path>) -> Self {
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
            index_file: index_file.into_std().await,
            path,
        }
    }
    /// 获取 BucketEntity
    pub(crate) fn get(&self, id: &Uuid) -> Option<BucketEntity> {
        self.find(|it| &it.uid == id)
    }
    /// 查找 BucketEntity
    pub(crate) fn find<F>(&self, predicate: F) -> Option<BucketEntity>
    where
        F: FnMut(&&BucketEntity) -> bool,
    {
        let guard = self.index.try_lock().unwrap();
        guard.items.iter().find(predicate).cloned()
    }
    pub(crate) fn clone_inner(&self) -> Vec<BucketEntity> {
        let guard = self.index.try_lock().unwrap();
        guard.items.clone()
    }
    pub(crate) fn has(&self, id: &Uuid) -> bool {
        self.find(|it| it.uid.eq(id)).is_some()
    }
    pub(crate) fn has_hash(&self, hash: &str) -> Option<Uuid> {
        let guard = self.index.try_lock().unwrap();
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
    pub(crate) async fn delete(&self, id: &Uuid) -> anyhow::Result<()> {
        let mut index = self.index.try_lock().unwrap();
        let entity_with_idx = index.items.iter().enumerate().find_map(|(idx, it)| {
            if &it.uid == id {
                Some((idx, it))
            } else {
                None
            }
        });
        match entity_with_idx {
            Some((idx, entity)) => {
                let resource_path = self.get_storage_path().join(entity.get_resource());
                if resource_path.exists() {
                    fs::remove_file(&resource_path).await.with_context(|| {
                        format!("Error: Remove resource file '{:?}' failed", &resource_path)
                    })?;
                };
                // Regenerate index file content
                let (deleted, content) = {
                    let deleted = index.items.remove(idx);
                    (
                        deleted,
                        if index.items.is_empty() {
                            "".to_string()
                        } else {
                            toml::to_string(&index.deref()).unwrap()
                        },
                    )
                };
                let mut file = self.index_file.try_clone()?;
                let bytes = content.as_bytes();
                file.seek(SeekFrom::Start(0))?;
                // `write_all` is used to overwrite not truncate, so set the length here to ensure that all content is overwritten
                file.set_len(bytes.len() as u64)?;
                match file
                    .write_all(bytes)
                    .with_context(|| "Fatal error: Update index file failed")
                {
                    Ok(_) => {
                        self.sync_all()?;
                        Ok(())
                    }
                    Err(err) => {
                        // rollback
                        index.items.insert(idx, deleted);
                        Err(err)
                    }
                }
            }
            _ => Ok(()),
        }
    }
    pub(crate) fn get_storage_path(&self) -> &PathBuf {
        &self.path
    }
    /// Writing entity to index file
    async fn write_index(&self, entity: &BucketEntity) -> anyhow::Result<()> {
        let part = format!(
            "{newline}[[item]]\n{body}",
            newline = if self.index.try_lock()?.items.is_empty() {
                ""
            } else {
                "\n"
            },
            body = toml::to_string(entity)?
        );
        let mut file = self.index_file.try_clone()?;
        file.seek(SeekFrom::End(0))?;
        file.write_all(part.as_bytes())
            .with_context(|| "Fatal Error: Write new index to index file failed")?;
        self.sync_all()?;
        Ok(())
    }
    /// Sync indexes to index file
    fn sync_all(&self) -> anyhow::Result<()> {
        self.index_file
            .sync_all()
            .with_context(|| "Fatal Error: Sync indexes to file failed")
    }
    /// 预分配一个 UUID 和文件，并可选择进行预分配大小。
    ///
    /// # 参数
    /// - `ext`：文件的扩展名，可选。如果提供了扩展名，文件名将使用 UUID 加上扩展名的形式。
    /// - `size`：预分配的文件大小，可选。如果提供了大小，将会设置文件的大小为指定值。
    ///
    /// # 返回值
    /// 返回一个包含生成的 UUID 和打开的文件的元组，成功时返回 `Ok`，失败时返回 `Err`。
    pub(crate) async fn preallocation(
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
        let path = self.path.join({
            match ext {
                Some(ext) => format!("{}.{}", uid, ext),
                None => uid.to_string(),
            }
        });
        let file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(&path)
            .await?;
        if let Some(size) = size {
            file.set_len(*size).await?;
        }
        Ok(PreallocationFile { uid, file, path })
    }
    /// 写入 Bucket
    pub(crate) async fn write(
        &self,
        uid: Uuid,
        filename: Option<String>,
        r#type: String,
        hash: String,
        size: usize,
    ) -> anyhow::Result<()> {
        let now = chrono::Local::now();
        let (name, ext) = if let Some(_name) = filename.as_ref() {
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
        let item = BucketEntity {
            uid,
            name,
            created: now.timestamp_millis(),
            modified: None,
            hash,
            size: size as u64,
            r#type,
            ext,
        };
        self.write_index(&item).await?;
        self.index.try_lock().unwrap().items.push(item);
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub enum BucketAction {
    Add(Uuid),
    Delete(Uuid),
}

impl BucketAction {
    pub fn to_json(&self) -> String {
        let (action, uid) = match self {
            BucketAction::Add(uid) => ("ADD", uid),
            BucketAction::Delete(uid) => ("DELETE", uid),
        };
        serde_json::json!({
            "type": action,
            "uid": uid
        })
        .to_string()
    }
}

impl Display for BucketAction {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let (action, uid) = match self {
            BucketAction::Add(uid) => ("ADD", uid),
            BucketAction::Delete(uid) => ("DELETE", uid),
        };
        write!(f, "[{}]@{}", action, uid)
    }
}
