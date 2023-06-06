use std::fmt::{Display, Formatter, Result};

#[allow(unused)]
pub enum ApiError<'a> {
    QueryFieldMissing(&'a str),
    HeaderFieldMissing(&'a str),
    BodyFieldMissing(&'a str),
    PathParameterMissing,
    RangeTooLarge,
    RangeNotSupported,
    InvalidRange,
    RangeNotFound,
    ResourceNotFound,
    HashMismatch,
}

impl Display for ApiError<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        match self {
            ApiError::QueryFieldMissing(field) => {
                write!(f, "Query field is missing: {} [ERR-001]", field)
            }
            ApiError::HeaderFieldMissing(field) => {
                write!(f, "Header field is missing: {} [ERR-002]", field)
            }
            ApiError::BodyFieldMissing(field) => {
                write!(f, "Body field is missing: {} [ERR-003]", field)
            }
            ApiError::PathParameterMissing => {
                write!(f, "Path parameter is missing [ERR-004]")
            }
            ApiError::RangeTooLarge => {
                write!(f, "Range is too large [ERR-005]")
            }
            ApiError::RangeNotSupported => {
                write!(f, "Range is not supported [ERR-006]")
            }
            ApiError::InvalidRange => {
                write!(f, "Invalid range [ERR-007]")
            }
            ApiError::RangeNotFound => {
                write!(f, "Range not found [ERR-008]")
            }
            ApiError::ResourceNotFound => {
                write!(f, "Resource not found [ERR-009]")
            }
            ApiError::HashMismatch => {
                write!(
                    f,
                    "The SHA-256 hash does mismatch the expected value. [ERR-010]"
                )
            }
        }
    }
}

#[allow(unused)]
pub enum InternalError<'a> {
    ReadStream,
    WriteFile(&'a std::path::Path),
    OpenFile(&'a std::path::Path),
    RenameFile(&'a std::path::Path, &'a std::path::Path),
    DeleteFile(&'a std::path::Path),
    SeekFile,
    ExactFile,
    SetFileLength(&'a std::path::Path, &'a u64),
    CloneFileHandle,
    ReadFileMetadata(&'a std::path::Path),
    Broadcast(&'a str),
    Cleanup,
}

impl<'a> Display for InternalError<'a> {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        match self {
            InternalError::ReadStream => {
                write!(f, "Unexpected: failed to read stream chunk")
            }
            InternalError::Broadcast(target) => {
                write!(f, "Unexpected: failed to broadcast {}", target)
            }
            InternalError::OpenFile(path) => {
                write!(f, "Unexpected: failed to open file at path: {:?}", path)
            }
            InternalError::WriteFile(path) => {
                write!(f, "Unexpected: failed to write file at path: {:?}", path)
            }
            InternalError::RenameFile(src, dst) => {
                write!(
                    f,
                    "Unexpected: failed to rename file from {:?} to {:?}",
                    src, dst
                )
            }
            InternalError::DeleteFile(path) => {
                write!(f, "Unexpected: failed to delete file at path: {:?}", path)
            }
            InternalError::SeekFile => {
                write!(
                    f,
                    "Unexpected: failed to seek at the specified position of the file"
                )
            }
            InternalError::ExactFile => {
                write!(f, "Unexpected: failed to exact file content")
            }
            InternalError::SetFileLength(path, size) => {
                write!(
                    f,
                    "Unexpected: failed to set file length {} for file at path: {:?}",
                    size, path
                )
            }
            InternalError::CloneFileHandle => {
                write!(f, "Unexpected: failed to clone file handle")
            }
            InternalError::ReadFileMetadata(path) => {
                write!(
                    f,
                    "Unexpected: failed to read file metadata at path: {:?}",
                    path
                )
            }
            InternalError::Cleanup => {
                write!(f, "Unexpected: failed to execute cleanup")
            }
        }
    }
}
