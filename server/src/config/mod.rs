mod authorize_config;
mod logs_config;
mod server_config;
mod storage_config;

use anyhow::{anyhow, Context};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::OnceLock;

static ROOT_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn root_dir() -> &'static PathBuf {
    ROOT_DIR.get_or_init(|| std::env::current_dir().unwrap())
}

static CONFIG: OnceLock<Config> = OnceLock::new();

pub fn config() -> &'static Config {
    CONFIG.get_or_init(|| Config::load().unwrap())
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    pub server: server_config::ServerConfig,
    pub file_storage: storage_config::StorageConfig,
    pub logs: logs_config::LogsConfig,
    pub authorize: Option<authorize_config::AuthorizeConfig>,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let path = Config::parse_config_path();
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

    fn parse_config_path() -> PathBuf {
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
}
