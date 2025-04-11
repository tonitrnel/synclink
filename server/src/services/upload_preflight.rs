use axum::extract::Query;
use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{AppendHeaders, IntoResponse},
};
use serde::Deserialize;

use crate::common::ApiResult;
use crate::extractors::Header;
use crate::state::AppState;

#[derive(Deserialize, Debug)]
pub struct PreflightQueryDto {
    size: u64,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "kebab-case")]
pub struct PreflightHeaderDto {
    x_content_sha256: String,
}

pub async fn upload_preflight(
    State(state): State<AppState>,
    query: Query<PreflightQueryDto>,
    header: Header<PreflightHeaderDto>,
) -> ApiResult<impl IntoResponse> {
    let content_hash = header.x_content_sha256.to_lowercase();
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
