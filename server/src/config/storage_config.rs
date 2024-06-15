use crate::config::root_dir;
use anyhow::Context;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize, Debug, Clone)]
pub struct StorageConfig {
    pub storage_path: String,
    pub quota: Option<usize>,
    pub max_size_of: Option<usize>,
}

impl StorageConfig {
    pub fn parse_dir(&self) -> anyhow::Result<PathBuf> {
        let path = std::path::Path::new(&self.storage_path).to_path_buf();
        let path = if path.is_absolute() {
            path
        } else {
            root_dir().join(path)
        };
        path.canonicalize()
            .with_context(|| "Failed to parse storage directory.".to_string())
    }
}
