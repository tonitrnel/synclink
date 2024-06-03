use crate::errors::ApiResponse;
use crate::extractors::Headers;
use crate::state::AppState;
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{AppendHeaders, IntoResponse},
};

pub async fn upload_preflight(
    State(state): State<AppState>,
    headers: Headers,
) -> ApiResponse<impl IntoResponse> {
    let content_hash = headers
        .get("x-content-sha256")
        .try_as_string()?
        .to_lowercase();
    match state.indexing.has_hash(&content_hash) {
        Some(uid) => Ok((
            StatusCode::CONFLICT,
            AppendHeaders([(header::LOCATION, uid.to_string())]),
        )
            .into_response()),
        None => Ok(StatusCode::OK.into_response()),
    }
}
