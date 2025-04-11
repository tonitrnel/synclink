use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
#[allow(unused, clippy::enum_variant_names)]
pub enum InternalError {
    #[error("Failed to read stream from {path:?}")]
    ReadStreamError { path: PathBuf },

    #[error("Failed to create to directory {path:?}")]
    CreateDirectoryError { path: PathBuf },
    #[error("Failed to write to file {path:?}")]
    WriteFileError { path: PathBuf },

    #[error("Failed to access file {path:?}")]
    AccessFileError { path: PathBuf },
    #[error("Failed to read file {path:?}")]
    ReadFileError { path: PathBuf },

    #[error("Failed to rename file from {from_path:?} to {to_path:?}")]
    RenameFileError {
        from_path: PathBuf,
        to_path: PathBuf,
    },

    #[error("Failed to delete file {path:?}")]
    DeleteFileError { path: PathBuf },

    #[error("Failed to seek in file {path:?}")]
    FileSeekError { path: PathBuf },

    #[error("Failed to set size for file {path:?}")]
    SetFileSizeError { path: PathBuf },

    #[error("Failed to clone file handle for {path:?}")]
    CloneFileHandleError { path: PathBuf },

    #[error("Failed to read metadata from file {path:?}")]
    ReadMetadataError { path: PathBuf },

    #[error("Failed to broadcast index change: {0}")]
    BroadcastIndexChangeError(String),

    #[error("Failed to clean up file {path:?}")]
    CleanupFileError { path: PathBuf },
}
