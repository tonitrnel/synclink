use crate::models;
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct AppState {
    pub indexing: Arc<models::file_indexing::FileIndexing>,
    pub notify_manager: Arc<crate::services::NotifyManager>,
    pub socket_manager: Arc<crate::services::P2PSocketManager>,
    pub shutdown_signal: CancellationToken,
}

#[async_trait]
impl FromRequestParts<AppState> for Arc<models::file_indexing::FileIndexing> {
    type Rejection = Infallible;
    async fn from_request_parts(
        _parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(state.indexing.clone())
    }
}
