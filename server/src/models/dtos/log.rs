use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Deserialize)]
pub struct LogBodyDto{
    level: LogLevel,
    message: String,
    location: Option<String>,
    file: Option<String>,
    line: Option<u32>,
}