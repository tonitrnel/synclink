use crate::models;
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct AppState {
    pub indexing: Arc<models::FileIndexing>,
    pub broadcast: broadcast::Sender<models::file_indexing::IndexChangeAction>,
}

#[async_trait]
impl FromRequestParts<AppState> for Arc<models::FileIndexing> {
    type Rejection = Infallible;
    async fn from_request_parts(
        _parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(state.indexing.clone())
    }
}
