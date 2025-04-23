use crate::models::file::ArchiveEntry;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct FileListQueryDto {
    pub page: u32,
    pub per_page: u32,
    pub group: Option<String>,
    pub after: Option<i64>,
    pub before: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct FileQueryDto {
    pub raw: bool,
    pub thumbnail_prefer: bool,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct FileHeaderDto {
    pub range: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct FileCollectionQueryDto {
    pub uuids: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct ArchiveEntryResponseDto {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
    pub mimetype: Option<String>,
    pub is_file: bool,
    pub hash: Option<String>,
}

impl From<ArchiveEntry> for ArchiveEntryResponseDto {
    fn from(value: ArchiveEntry) -> Self {
        Self {
            path: value.path,
            mtime: value.mtime,
            size: value.size,
            mimetype: value.mimetype,
            is_file: tar::EntryType::new(value.entry_type).is_file(),
            hash: value.hash,
        }
    }
}
