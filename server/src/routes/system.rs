use axum::extract::State;
use axum::Json;
use axum::response::IntoResponse;
use serde_json::json;
use crate::common::AppError;
use crate::state::AppState;

pub async fn health() -> impl IntoResponse {
    axum::http::StatusCode::OK
}
pub async fn version() ->  impl IntoResponse{
    format!("ephemera_{}", env!("CARGO_PKG_VERSION"))
}
pub async fn stats(State(state): State<AppState>) -> anyhow::Result<impl IntoResponse, AppError>{
    let now = tokio::time::Instant::now();
    let disk_usage = state.file_service.get_used_space(None).await?;
    let memory_usage = state.system_service.memory().await;
    let version = state.system_service.version();
    let uptime = state.system_service.uptime();
    let storage_quota = state.system_service.storage_quota();
    let default_reserved = state.system_service.reserved();
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