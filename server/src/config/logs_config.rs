use serde::{Deserialize, Deserializer};
use tracing::Level;

#[derive(Deserialize, Debug, Clone)]
pub struct LogsConfig {
    #[serde(deserialize_with = "level_deserialize")]
    pub level: Level,
    pub path: Option<String>,
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
