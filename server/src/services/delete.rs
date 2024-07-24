use crate::common::ApiResult;
use crate::models::file_indexing::IndexChangeAction;
use crate::state::AppState;
use axum::{
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<String>> {
    state.indexing.delete(&id).await?;

    if let Err(err) = state
        .notify_manager
        .send(IndexChangeAction::DelItem(id).into())
    {
        tracing::warn!("broadcast {} failed", err);
    }
    Ok(Json("ok!".to_string()))
}
