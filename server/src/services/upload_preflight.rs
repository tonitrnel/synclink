use crate::config::AppState;
use axum::{
    debug_handler,
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{AppendHeaders, IntoResponse},
};

#[debug_handler]
pub async fn upload_preflight(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let content_hash = headers
        .get("x-content-sha256")
        .map(|it| String::from_utf8_lossy(it.as_bytes()).to_lowercase())
        .unwrap_or_default();
    match state.bucket.has_hash(&content_hash) {
        Some(uid) => (
            StatusCode::CONFLICT,
            AppendHeaders([(header::LOCATION, uid.to_string())]),
        )
            .into_response(),
        None => StatusCode::OK.into_response(),
    }
}
