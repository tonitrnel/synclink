use crate::errors::ApiResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn stat() -> ApiResponse<Json<Value>> {
    let version = env!("CARGO_PKG_VERSION");
    Ok(Json(json!({
        "version": version
    })))
}
