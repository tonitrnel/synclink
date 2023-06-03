use crate::{config, models};
use std::sync::Arc;
use tokio::sync::broadcast;

#[allow(unused)]
#[derive(Clone)]
pub struct AppState {
    pub(crate) config: Arc<config::Config>,
    pub(crate) bucket: Arc<models::Bucket>,
    pub(crate) broadcast: broadcast::Sender<models::bucket::BucketAction>,
}
