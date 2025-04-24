use crate::models::types;
use serde::{Deserialize, Serialize};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::sqlite::SqliteTypeInfo;
use sqlx::{Database, Decode, Encode, FromRow, Sqlite, Type};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFileMetadata {
    pub width: u32,
    pub height: u32,
    pub thumbnail_width: Option<u32>,
    pub thumbnail_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mimetype: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub hash: Option<String>,
    pub entry_type: u8,
    pub header_position: u64,
    pub file_position: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveFileMetadata {
    pub(crate) entries: Vec<ArchiveEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum FileMetadata {
    Image(ImageFileMetadata),
    Archive(ArchiveFileMetadata),
    None,
}

impl Default for FileMetadata {
    fn default() -> Self {
        FileMetadata::None
    }
}

impl FileMetadata {
    pub fn to_json_string(&self) -> anyhow::Result<String> {
        let str = serde_json::to_string(&self)?;
        Ok(str)
    }
}

impl<'a> TryFrom<&'a str> for FileMetadata {
    type Error = serde_json::Error;
    fn try_from(value: &'a str) -> Result<Self, Self::Error> {
        serde_json::from_str::<FileMetadata>(&value)
    }
}
impl From<String> for FileMetadata {
    fn from(value: String) -> Self {
        Self::try_from(value.as_str()).unwrap_or_else(|e| {
            tracing::warn!("Failed to convert string to FileMetadata: {:?}", e);
            FileMetadata::None
        })
    }
}
impl From<Option<String>> for FileMetadata {
    fn from(value: Option<String>) -> Self {
        match value {
            None => FileMetadata::None,
            Some(value) => Self::from(value),
        }
    }
}
impl From<Option<FileMetadata>> for FileMetadata {
    fn from(value: Option<FileMetadata>) -> Self {
        value.unwrap_or_else(|| FileMetadata::None)
    }
}
impl From<ImageFileMetadata> for FileMetadata {
    fn from(value: ImageFileMetadata) -> Self {
        Self::Image(value)
    }
}
impl From<Vec<ArchiveEntry>> for FileMetadata {
    fn from(value: Vec<ArchiveEntry>) -> Self {
        Self::Archive(ArchiveFileMetadata { entries: value })
    }
}

impl<'q> Encode<'q, Sqlite> for FileMetadata {
    fn encode_by_ref(
        &self,
        buf: &mut <Sqlite as Database>::ArgumentBuffer<'q>,
    ) -> Result<IsNull, BoxDynError> {
        match self {
            FileMetadata::None => Ok(IsNull::Yes),
            _ => <String as Encode<'q, Sqlite>>::encode_by_ref(&self.to_json_string()?, buf),
        }
    }
}
impl<'r> Decode<'r, Sqlite> for FileMetadata {
    fn decode(value: <Sqlite as Database>::ValueRef<'r>) -> Result<Self, BoxDynError> {
        let s = <Option<String> as Decode<'r, Sqlite>>::decode(value)?;
        match s {
            Some(s) => FileMetadata::try_from(s.as_str()).map_err(|e| Box::new(e) as _),
            None => Ok(FileMetadata::None),
        }
    }
}
impl Type<Sqlite> for FileMetadata {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<Sqlite>>::type_info()
    }
    fn compatible(ty: &<Sqlite as Database>::TypeInfo) -> bool {
        <String as Type<Sqlite>>::compatible(ty)
    }
}

#[derive(Debug, Clone, FromRow)]
pub struct FileEntity {
    pub id: Uuid,
    pub name: String,
    pub hash: String,
    pub size: i64,
    pub mimetype: String,
    pub extname: Option<String>,
    pub metadata: FileMetadata,
    pub ipaddr: Option<String>,
    pub device: Option<String>,
    pub is_encrypted: bool,
    pub is_pined: bool,
    pub created_at: types::Timestamp,
    pub updated_at: types::Timestamp,
}
