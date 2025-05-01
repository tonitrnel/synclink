use crate::models::file::{ArchiveEntry, FileEntity, FileMetadata, ImageFileMetadata};
use crate::models::types;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct FileRecordQueryDto {
    pub first: Option<u32>,
    pub last: Option<u32>,
    pub after: Option<types::Cursor>,
    pub before: Option<types::Cursor>,
    pub group: Option<String>,
    pub with_total: Option<bool>
}

#[derive(Debug, Serialize)]
pub struct FileRecordResponseDto {
    pub id: Uuid,
    pub name: String,
    pub hash: String,
    pub size: i64,
    pub mimetype: String,
    pub extname: Option<String>,
    #[serde(skip_serializing_if = "FileMetadataResponseDto::is_none")]
    pub metadata: FileMetadataResponseDto,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipaddr: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    pub is_encrypted: bool,
    pub is_pined: bool,
    pub created_at: types::Timestamp,
    pub updated_at: types::Timestamp,
    pub cursor: types::Cursor,
}

impl From<FileEntity> for FileRecordResponseDto {
    fn from(value: FileEntity) -> Self {
        Self {
            id: value.id,
            name: value.name,
            hash: value.hash,
            size: value.size,
            mimetype: value.mimetype,
            extname: value.extname,
            metadata: value.metadata.into(),
            ipaddr: value.ipaddr,
            device: value.device,
            is_encrypted: value.is_encrypted,
            is_pined: value.is_pined,
            created_at: value.created_at,
            updated_at: value.updated_at,
            cursor: types::Cursor::new(value.id, value.created_at.into()),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct FileQueryDto {
    pub raw: Option<String>,
    pub thumbnail_prefer: Option<String>,
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
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum FileMetadataResponseDto{
    Image(ImageFileMetadata),
    Archive(ArchiveMetadataResponseDto),
    None
}

impl FileMetadataResponseDto {
    pub fn is_none(&self) -> bool {
        matches!(self, FileMetadataResponseDto::None)
    }
}

impl From<FileMetadata> for FileMetadataResponseDto{
    fn from(value: FileMetadata) -> Self {
        match value {
            FileMetadata::Image(image) => FileMetadataResponseDto::Image(image),
            FileMetadata::Archive(archive) => {
                FileMetadataResponseDto::Archive(ArchiveMetadataResponseDto{
                    entries: archive.entries.into_iter().map(Into::into).collect()
                })
            },
            FileMetadata::None => FileMetadataResponseDto::None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ArchiveMetadataResponseDto{
    entries: Vec<ArchiveResponseDto>
}

#[derive(Debug, Serialize)]
pub struct ArchiveResponseDto {
    pub path: String,
    pub mtime: u64,
    pub size: u64,
    pub mimetype: Option<String>,
    pub is_file: bool,
    pub hash: Option<String>,
}

impl From<ArchiveEntry> for ArchiveResponseDto {
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

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PatchFileMetadataBodyDto{
    Image(ImageFileMetadata),
}