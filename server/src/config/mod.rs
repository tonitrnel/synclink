use anyhow::{anyhow, Context};
use serde::{Deserialize, Deserializer};
use tracing::Level;

pub mod state;

pub use state::AppState;

#[derive(Deserialize, Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Deserialize, Debug, Clone)]
pub struct FileStorageConfig {
    pub storage_path: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct LogConfig {
    #[serde(deserialize_with = "level_deserialize")]
    pub level: Level,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HttpsConfig {
    pub port: u16,
    pub cert: String,
    pub key: String,
}

pub fn level_deserialize<'de, D>(deserializer: D) -> Result<Level, D::Error>
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

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    pub server: ServerConfig,
    pub file_storage: FileStorageConfig,
    pub log: LogConfig,
}

impl Config {
    pub(crate) fn read_storage_dir(&self) -> std::path::PathBuf {
        utils::read_path(&self.file_storage.storage_path)
    }
}

pub mod utils {
    pub(crate) fn read_path(str: &str) -> std::path::PathBuf {
        let path = std::path::Path::new(str);
        let current_dir = std::env::current_dir().unwrap();
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            current_dir.join(path)
        }
    }
}

fn parse_config_path() -> std::path::PathBuf {
    let mut args = std::env::args();
    args.next();
    while let Some(arg) = args.next() {
        if arg == "-c" || arg == "--config" {
            if let Some(path) = args.next() {
                return std::path::Path::new(&path).to_path_buf();
            } else {
                panic!("Error: Please specify path string for -c argument.")
            }
        }
    }
    panic!("Error: Please specify configuration file argument. Usage: -c <config_file>")
}

pub(crate) fn load() -> anyhow::Result<Config> {
    let path = parse_config_path();
    if !path.is_file() {
        return Err(anyhow!(
            "Error: Configuration file not found or invalid.\n\
        Please make sure that the configuration file exists and is a valid TOML file.\n\
        Expected file path: {:?}",
            path
        ));
    }
    let content = std::fs::read_to_string(path).with_context(|| {
        "Error: Failed to read configuration file.\n\
        Please check the file path and file permissions, and make sure the file is valid accessible"
    })?;
    toml::from_str(&content).with_context(|| {
        "Error: Failed to parse configuration file.\n\
        Please check the file syntax is valid TOML syntax"
    })
}
