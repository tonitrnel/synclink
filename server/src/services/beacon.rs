use axum::debug_handler;
use chrono::{TimeZone, Utc};
use serde::Deserialize;

#[allow(unused)]
#[derive(Deserialize, Debug)]
struct SystemPart {
    #[serde(rename = "userAgent")]
    user_agent: String,
    height: u32,
    width: u32,
}

#[allow(unused)]
#[derive(Deserialize, Debug)]
struct BuildPart {
    version: String,
    timestamp: u64,
}

#[allow(unused)]
#[derive(Deserialize, Debug)]
struct LogPart {
    level: String,
    time: u64,
    path: String,
    name: String,
    message: String,
    stack: String,
}

#[allow(unused)]
#[derive(Deserialize, Debug)]
pub struct ReportObject {
    logs: Vec<LogPart>,
    time: u64,
    system: SystemPart,
    build: BuildPart,
}

#[debug_handler]
pub async fn beacon(body: String) {
    let body = serde_json::from_str::<ReportObject>(&body).unwrap();
    let span = tracing::span!(
        tracing::Level::INFO,
        "beacon",
        timestamp = Utc
            .timestamp_millis_opt(body.build.timestamp as i64)
            .map(|dt| dt.format("%F %T%.6fZ").to_string())
            .unwrap(),
        user_agent = body.system.user_agent
    );
    let _guard = span.enter();
    for log in body.logs {
        tracing::debug!(
            timestamp = Utc
                .timestamp_millis_opt(log.time as i64)
                .map(|dt| dt.format("%F %T%.6fZ").to_string())
                .unwrap(),
            level = log.level,
            stack = log
                .stack
                .splitn(2, '\n')
                .take(1)
                .collect::<String>()
                .trim_start_matches(' '),
            "{}: {}",
            log.name,
            log.message,
        )
    }
}
