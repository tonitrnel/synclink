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
    let mut logs = Vec::with_capacity(body.logs.len() + 2);
    logs.push(format!(
        "==== From {} @ {} Logs ====\n",
        body.system.user_agent,
        Utc.timestamp_millis_opt(body.build.timestamp as i64)
            .map(|dt| dt.format("%H:%M:%S%.3f").to_string())
            .unwrap()
    ));
    for log in body.logs {
        logs.push(format!(
            "{} [{}] {}: {} {}",
            Utc.timestamp_millis_opt(log.time as i64)
                .map(|dt| dt.format("%H:%M:%S%.3f").to_string())
                .unwrap(),
            log.level,
            log.name,
            log.message,
            log.stack.splitn(2, '\n').take(1).collect::<String>(),
        ));
    }
    logs.push("\n===========  END  ===========".to_string());
    println!("{}", logs.join("\n"))
}
