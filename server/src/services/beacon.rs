use chrono::{TimeZone, Utc};
use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[allow(unused)]
struct SystemPart {
    #[serde(rename = "userAgent")]
    user_agent: String,
    height: u32,
    width: u32,
}

#[derive(Deserialize, Debug)]
#[allow(unused)]
struct BuildPart {
    version: String,
    timestamp: u64,
}

#[derive(Deserialize, Debug)]
#[allow(unused)]
struct LogPart {
    level: String,
    time: u64,
    path: String,
    name: String,
    message: String,
    stack: String,
}

#[derive(Deserialize, Debug)]
#[allow(unused)]
pub struct ReportObject {
    logs: Vec<LogPart>,
    time: u64,
    system: SystemPart,
    build: BuildPart,
}

pub async fn beacon(body: String) {
    let body = serde_json::from_str::<ReportObject>(&body).unwrap();
    print_beacon_logs(body)
}

fn print_beacon_logs(report: ReportObject) {
    let span = tracing::span!(
        tracing::Level::INFO,
        "beacon",
        timestamp = Utc
            .timestamp_millis_opt(report.build.timestamp as i64)
            .map(|dt| dt.format("%F %T%.6fZ").to_string())
            .unwrap(),
        user_agent = report.system.user_agent
    );
    let _guard = span.enter();
    for log in report.logs {
        tracing::info!(
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
