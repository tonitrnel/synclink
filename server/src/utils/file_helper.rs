use crate::errors::InternalError;
use anyhow::Context;
use std::io::SeekFrom;
use std::path::PathBuf;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

pub async fn open(path: &PathBuf) -> anyhow::Result<fs::File> {
    fs::File::open(&path)
        .await
        .with_context(|| InternalError::AccessFileError {
            path: path.to_owned(),
        })
}

pub async fn seek(file: &mut fs::File, pos: SeekFrom, path: &PathBuf) -> anyhow::Result<u64> {
    file.seek(pos)
        .await
        .with_context(|| InternalError::FileSeekError {
            path: path.to_owned(),
        })
}

pub async fn clone(file: &fs::File, path: &PathBuf) -> anyhow::Result<fs::File> {
    file.try_clone()
        .await
        .with_context(|| InternalError::CloneFileHandleError {
            path: path.to_owned(),
        })
}

pub async fn exact(file: &mut fs::File, size: usize, path: &PathBuf) -> anyhow::Result<Vec<u8>> {
    let mut buffer = vec![0; size];
    file.read_exact(&mut buffer)
        .await
        .with_context(|| InternalError::ReadFileError {
            path: path.to_owned(),
        })?;
    Ok(buffer)
}
