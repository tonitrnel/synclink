use crate::common::ApiResult;
use crate::config;
use crate::state::AppState;
use anyhow::Context;
use axum::extract::State;
use axum::Json;
use serde_json::{json, Value};
use std::collections::HashSet;

pub async fn stats(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let now = tokio::time::Instant::now();
    let disk_usage = {
        state
            .indexing
            .map_clone(|it| it.iter().fold(0, |a, b| a + b.get_size()))
    };
    let pid = std::process::id();
    let memory_usage = load_memory_usage(pid).await.unwrap_or_else(|err| {
        tracing::warn!(reason = ?err, "failed to read memory usage");
        0
    });
    let version = env!("CARGO_PKG_VERSION");
    let uptime = config::uptime();
    let c = &config::load().file_storage;
    let storage_quota = c.get_quota();
    let default_reserved = c.get_default_reserved();
    Ok(Json(json!({
        "version": version,
        "disk_usage": disk_usage,
        "memory_usage": memory_usage,
        "query_elapsed": now.elapsed().as_millis() as u64,
        "storage_quota": storage_quota,
        "default_reserved": default_reserved,
        "uptime": uptime
    })))
}

#[cfg(target_os = "linux")]
async fn load_memory_usage(pid: u32) -> anyhow::Result<u64> {
    let path = format!("/proc/{}/stat", pid);
    let path = std::path::Path::new(&path);
    if !path.is_file() {
        anyhow::bail!("Not found stat file")
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .with_context(|| format!("Failed to read stat file, {:?}", path))?;
    let view = content.split(' ').collect::<Vec<_>>();
    // read process resident memory
    Ok(view
        .get(23)
        .and_then(|it| it.trim().parse::<u64>().ok())
        .map(|it| it * 4096)
        .unwrap_or(0))
}

#[cfg(target_os = "windows")]
async fn load_memory_usage(pid: u32) -> anyhow::Result<u64> {
    // read process working set memory
    let output = tokio::process::Command::new("powershell")
        .arg("Get-Process -Pid")
        .arg(pid.to_string())
        .arg("|")
        .arg("Select-Object -ExpandProperty WS")
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "Failed to exec Get-Process command, reason: {}",
            String::from_utf8(output.stderr).unwrap_or_default()
        )
    }
    let value = String::from_utf8(output.stdout)
        .map(|it| it.trim().parse::<u64>())
        .with_context(|| "Failed to parse bytes to utf8")??;
    Ok(value)
}

#[cfg(all(not(target_os = "linux"), not(target_os = "windows")))]
async fn load_memory_usage(_: u32) -> anyhow::Result<u64> {
    Ok(0)
}

pub async fn clean_dump(State(state): State<AppState>) -> ApiResult<Json<Value>> {
    let tmp_dir = std::env::temp_dir().join("synclink");
    let storage_dir = state.indexing.get_storage_dir();
    let exists_ids = state.indexing.map_clone(|items| {
        items
            .iter()
            .map(|it| it.get_uid().to_string())
            .collect::<HashSet<_>>()
    });
    let mut entities = tokio::fs::read_dir(&storage_dir)
        .await
        .with_context(|| format!("failed to read dir {:?}", storage_dir))?;
    let mut free = 0;
    let mut temp = 0;
    while let Some(entry) = entities.next_entry().await? {
        if !entry.path().is_file() {
            continue;
        }
        let uid = entry
            .file_name()
            .to_string_lossy()
            .split('.')
            .next()
            .unwrap_or_default()
            .to_string();
        // non uuid format.
        if !uid.chars().all(|it| it.is_ascii_hexdigit() || it == '-') {
            continue;
        }
        // index valid.
        if exists_ids.contains(&uid) {
            continue;
        };
        tokio::fs::remove_file(entry.path()).await?;
        free += 1;
    }
    if !tmp_dir.exists() || !tmp_dir.is_dir() {
        return Ok(Json(json!({
            "free": free,
            "temp": temp
        })));
    }
    let mut entities = tokio::fs::read_dir(&tmp_dir)
        .await
        .with_context(|| format!("failed to read dir {:?}", tmp_dir))?;
    while let Some(entry) = entities.next_entry().await? {
        tokio::fs::remove_file(entry.path()).await?;
        temp += 1;
    }
    Ok(Json(json!({
            "free": free,
            "temp": temp
    })))
}
