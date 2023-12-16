mod authorize_config;
mod logs_config;
mod server_config;
mod storage_config;

use anyhow::{anyhow, Context};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static ROOT_DIR: OnceLock<PathBuf> = OnceLock::new();
static UPTIME: OnceLock<u64> = OnceLock::new();

pub fn root_dir() -> &'static PathBuf {
    ROOT_DIR.get_or_init(|| std::env::current_dir().unwrap())
}

static CONFIG: OnceLock<Config> = OnceLock::new();

pub fn load() -> &'static Config {
    CONFIG.get_or_init(|| Config::from_config_file().unwrap())
}

pub fn uptime() -> u64 {
    let start = UPTIME.get().unwrap_or(&0);
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|it| it.as_secs() - start)
        .unwrap_or(0)
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct Config {
    pub server: server_config::ServerConfig,
    pub file_storage: storage_config::StorageConfig,
    pub logs: logs_config::LogsConfig,
    pub authorize: Option<authorize_config::AuthorizeConfig>,
    pub device_ip_tags: Option<HashMap<String, String>>,
}

impl Config {
    pub fn from_config_file() -> anyhow::Result<Self> {
        let path = Config::parse_config_file_path();
        UPTIME.get_or_init(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
        });
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

    fn parse_config_file_path() -> PathBuf {
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
