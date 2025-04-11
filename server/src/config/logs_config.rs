use anyhow::Context;
use serde::{Deserialize, Deserializer};
use std::path::PathBuf;
use tracing::Level;
use crate::config::ROOT_DIR;

#[derive(Deserialize, Debug, Clone)]
pub struct LogsConfig {
    #[serde(deserialize_with = "level_deserialize")]
    pub level: Level,
    pub storage_path: Option<String>,
    #[serde(default)]
    pub enable_file_logging: bool,
}

impl LogsConfig {
    pub fn parse_dir(&self) -> anyhow::Result<Option<PathBuf>> {
        if let Some(storage_path) = &self.storage_path {
            let path = std::path::Path::new(storage_path).to_path_buf();
            let path = if path.is_absolute() {
                path
            } else {
                ROOT_DIR.join(path)
            };
            Ok(Some(path.canonicalize().with_context(|| {
                format!("Failed to parse logs directory. {:?}", path)
            })?))
        } else {
            Ok(None)
        }
    }
}
fn level_deserialize<'de, D>(deserializer: D) -> Result<Level, D::Error>
where
    D: Deserializer<'de>,
{
    let s: String = Deserialize::deserialize(deserializer)?;
    match s.to_lowercase().as_str() {
        "error" => Ok(Level::ERROR),
        "warn" => Ok(Level::WARN),
        "info" => Ok(Level::INFO),
        "debug" => Ok(Level::DEBUG),
        "trace" => Ok(Level::TRACE),
        _ => Err(serde::de::Error::custom(format!(
            "Unsupported log level: {}",
            s
        ))),
    }
}
