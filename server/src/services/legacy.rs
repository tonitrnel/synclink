#[allow(unused)]
use crate::utils::guess_mimetype_from_path;
use crate::{config, utils};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::{fs, io::AsyncReadExt};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageMetadata {
    width: u32,
    height: u32,
    thumbnail_width: Option<u32>,
    thumbnail_height: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum EntityMetadata {
    Image(ImageMetadata),
}

impl EntityMetadata {
    pub fn try_into_image(self) -> Option<ImageMetadata> {
        match self {
            EntityMetadata::Image(metadata) => Some(metadata),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Entity {
    /// assigned uid
    pub(super) uid: Uuid,
    /// created date of the content
    #[serde(
        serialize_with = "utils::serialize_i64_to_utc",
        deserialize_with = "utils::deserialize_utc_to_i64"
    )]
    pub(super) created: i64,
    /// modified date of the content
    #[serde(
        serialize_with = "utils::serialize_option_i64_to_utc",
        deserialize_with = "utils::deserialize_option_utc_to_i64",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub(super) modified: Option<i64>,
    /// original file name of the content
    pub(super) name: String,
    /// hash of the content
    pub(super) hash: String,
    /// length of content
    pub(super) size: u64,
    /// mime type of the content
    #[serde(rename = "type")]
    pub(super) content_type: String,
    /// original file extension of the content
    pub(super) ext: Option<String>,
    pub(super) ip: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(super) caption: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) tags: Vec<String>,
    #[serde(skip_serializing, default)]
    pub(super) metadata: Option<EntityMetadata>,
}

impl Entity {
    #[inline]
    pub fn get_uid(&self) -> &Uuid {
        &self.uid
    }
    #[inline]
    pub fn get_filename(&self) -> String {
        if self.content_type == "text/plain" && self.ext.is_none() {
            format!("{}.txt", self.name)
        } else {
            self.name.to_string()
        }
    }
    #[inline]
    pub fn get_resource(&self) -> String {
        match &self.ext {
            Some(ext) => format!("{}.{}", self.uid, ext),
            None => self.uid.to_string(),
        }
    }
    #[inline]
    pub fn get_hash(&self) -> &str {
        &self.hash
    }
    #[inline]
    pub fn get_name(&self) -> &str {
        &self.name
    }
    #[inline]
    pub fn get_size(&self) -> &u64 {
        &self.size
    }
    #[inline]
    pub fn get_tags(&self) -> &[String] {
        &self.tags
    }
    #[inline]
    pub fn get_caption(&self) -> &str {
        &self.caption
    }
    #[inline]
    pub fn get_content_type(&self) -> &str {
        &self.content_type
    }
    #[inline]
    pub fn get_created(&self) -> &i64 {
        &self.created
    }
    #[inline]
    pub fn get_modified(&self) -> &Option<i64> {
        &self.modified
    }
    #[inline]
    pub fn get_created_date(&self) -> String {
        utils::i64_to_utc(&self.created).unwrap()
    }
    #[inline]
    pub fn get_modified_date(&self) -> Option<String> {
        self.modified.map(|t| utils::i64_to_utc(&t).unwrap())
    }
    #[inline]
    pub fn get_extension(&self) -> &Option<String> {
        &self.ext
    }
    #[inline]
    pub fn get_ip(&self) -> &Option<String> {
        &self.ip
    }
    #[inline]
    pub fn get_ip_alias(&self) -> Option<&String> {
        let device_ip_tags = &config::CONFIG.device_ip_tags;
        self.ip
            .as_ref()
            .zip(device_ip_tags.as_ref())
            .and_then(|(ip, tags)| tags.get(ip))
    }
    #[inline]
    pub fn get_metadata(&self) -> &Option<EntityMetadata> {
        &self.metadata
    }
}

impl PartialEq for Entity {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}

#[derive(Deserialize, Debug, Clone)]
struct Index {
    #[serde(rename = "item", default)]
    items: Vec<Entity>,
}

#[derive(Debug)]
pub struct FileIndexingService {
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
    async fn into_entity(self, dir: &Path) -> Entity {
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
            content_type: guess_mimetype_from_path(
                dir.join(resource),
                self.content_type.as_deref(),
            )
            .await
            .to_string(),
            ext,
            ip: self.ip,
            metadata: None,
            caption: self.caption,
            tags: self.tags,
        }
    }
}

impl FileIndexingService {
    pub async fn new(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref().to_owned();
        if !&path.is_dir() {
            anyhow::bail!("Error: Path '{:?}' is not a directory", path.as_os_str())
        }
        let index_path = path.join("index.toml");
        if index_path.exists() && !index_path.is_file() {
            anyhow::bail!("Error: Path '{:?}' is not a file", index_path.as_os_str())
        }
        let directory = index_path.parent().unwrap().to_path_buf();
        let mut index_file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(!index_path.exists())
            .open(&index_path)
            .await
            .with_context(|| format!("Error: Index file open '{:?}' failed", &index_path))?;
        let mut index_content = String::new();
        index_file
            .read_to_string(&mut index_content)
            .await
            .with_context(|| format!("Error: Index read '{:?}' failed", index_path.as_os_str()))?;
        let index: Index = toml::from_str(&index_content).unwrap_or_else(|err| {
            eprintln!("{:#?}", err);
            panic!("Error: Index parse failed")
        });
        let this = Self {
            index: Arc::new(Mutex::new(index)),
            index_file,
            directory,
        };
        Ok(this)
    }
    pub fn map_clone<T, F>(&self, f: F) -> T
    where
        F: FnOnce(&Vec<Entity>) -> T,
    {
        let guard = self.index.lock().unwrap();
        f(&guard.items)
    }
}
