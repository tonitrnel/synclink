use crate::config;
use anyhow::Context;

pub struct SystemService {}

impl SystemService {
    pub fn new() -> Self {
        Self {}
    }
    pub fn version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }
    pub fn uptime(&self) -> u64 {
        config::uptime()
    }
    pub fn storage_quota(&self) -> u64{
        let cfg = &config::CONFIG.file_storage;
        (cfg.get_quota() - cfg.get_default_reserved()) as u64
    }
    pub fn reserved(&self) -> u64{
        let cfg = &config::CONFIG.file_storage;
        cfg.get_default_reserved() as u64
    }
    pub async fn memory(&self) -> u64 {
        let pid = std::process::id();
        let memory_usage = load_memory_usage(pid).await.unwrap_or_else(|err| {
            tracing::warn!(reason = ?err, "failed to read memory usage");
            0
        });
        memory_usage
    }
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
#[cfg(target_os = "macos")]
async fn load_memory_usage(pid: u32) -> anyhow::Result<u64> {
    let output = tokio::process::Command::new("ps")
        .arg("-p")
        .arg(pid.to_string())
        .arg("-o rss")
        .output()
        .await?;
    if !output.status.success() {
        anyhow::bail!(
            "Failed to exec Get-Process command, reason: {}",
            String::from_utf8(output.stderr).unwrap_or_default()
        )
    }
    let output = String::from_utf8(output.stdout.clone())
        .with_context(|| "Failed to parse bytes to utf8")?;
    let value = output
        .trim()
        .split('\n')
        .last()
        .unwrap_or_default()
        .trim()
        .parse::<u64>()?;
    Ok(value * 1024 / 4)
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
