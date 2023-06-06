use crate::config::state::AppState;
use crate::models::bucket::BucketAction;
use crate::utils::HttpResult;
use axum::{
    debug_handler,
    extract::{Path, State},
    Json,
};
use uuid::Uuid;

#[debug_handler]
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> HttpResult<Json<String>> {
    let result = state.bucket.delete(&id).await;
    match result {
        Ok(_) => {
            if let Err(err) = state.broadcast.send(BucketAction::Delete(id)) {
                tracing::warn!("broadcast {} failed", err);
            }
            Ok::<_, ()>(Json("ok!".to_string())).into()
        }
        Err(err) => Err(err).into(),
    }
}
