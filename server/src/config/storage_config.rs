use crate::config::root_dir;
use anyhow::Context;
use serde::{Deserialize, Deserializer};
use std::path::PathBuf;

#[derive(Deserialize, Debug, Clone)]
pub struct StorageConfig {
    pub storage_path: String,
    #[serde(deserialize_with = "size_deserialize", default)]
    pub quota: Option<usize>,
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

fn size_deserialize<'de, D>(deserializer: D) -> Result<Option<usize>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: Option<String> = Deserialize::deserialize(deserializer)?;
    let s = if let Some(s) = s {
        s.to_lowercase()
    } else {
        return Ok(None);
    };
    let (number, unit) = s.split_at(s.len() - 2);
    let number = number
        .parse::<usize>()
        .map_err(|_| serde::de::Error::custom(format!("Invalid digest: {}", number)))?;
    match unit {
        "kb" => Ok(Some(number * 1024)),
        "mb" => Ok(Some(number * 1024 * 1024)),
        "gb" => Ok(Some(number * 1024 * 1024 * 1024)),
        _ => Err(serde::de::Error::custom(format!("Invalid unit: {}", unit))),
    }
}
