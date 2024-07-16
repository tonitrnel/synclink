use crate::errors::ApiResponse;
use crate::extractors::Headers;
use crate::state::AppState;
use axum::extract::Query;
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{AppendHeaders, IntoResponse},
};
use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct PreflightQuery {
    size: u64,
}

pub async fn upload_preflight(
    State(state): State<AppState>,
    query: Query<PreflightQuery>,
    headers: Headers,
) -> ApiResponse<impl IntoResponse> {
    let content_hash = headers
        .get("x-content-sha256")
        .try_as_string()?
        .to_lowercase();
    if let Some(uid) = state.indexing.has_hash(&content_hash) {
        return Ok((
            StatusCode::CONFLICT,
            AppendHeaders([(header::LOCATION, uid.to_string())]),
        )
            .into_response());
    }
    // if let Err(_err) = state.indexing.check_file_size_limit(query.size) {
    //     return Ok(StatusCode::PAYLOAD_TOO_LARGE.into_response());
    // }
    if let Err(_err) = state.indexing.check_storage_quota_exceeded(query.size) {
        return Ok(StatusCode::INSUFFICIENT_STORAGE.into_response());
    }
    Ok(StatusCode::OK.into_response())
}
