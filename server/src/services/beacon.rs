use crate::state::AppState;
use crate::utils::guardable;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{sse, IntoResponse, Sse};
use axum::{debug_handler, BoxError};
use futures::stream;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::sync::{
    mpsc::{self, Sender},
    RwLock,
};
use tokio_stream::StreamExt;

static SSE_TX: LazyLock<RwLock<Option<Sender<ReportObject>>>> = LazyLock::new(|| RwLock::new(None));

#[derive(Serialize, Deserialize, Debug, Clone)]
struct SystemPart {
    #[serde(rename = "userAgent")]
    user_agent: String,
    height: u32,
    width: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct BuildPart {
    version: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct LogPart {
    level: String,
    time: u64,
    path: String,
    name: String,
    message: String,
    stack: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ReportObject {
    logs: Vec<LogPart>,
    time: u64,
    system: SystemPart,
    build: BuildPart,
}

impl ReportObject {
    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

pub async fn beacon(body: String) {
    let body = serde_json::from_str::<ReportObject>(&body).unwrap();
    if let Some(tx) = SSE_TX.read().await.as_ref() {
        let _ = tx.send(body).await;
    }
}

struct CleanGuard {}
impl Drop for CleanGuard {
    fn drop(&mut self) {
        tokio::spawn(async move {
            SSE_TX.write().await.take();
        });
    }
}

#[debug_handler]
pub async fn log_tracing(State(state): State<AppState>) -> impl IntoResponse {
    let rx = {
        let mut global_tx = SSE_TX.write().await;
        if global_tx.is_some() {
            return StatusCode::LOCKED.into_response();
        }
        let (tx, rx) = mpsc::channel::<ReportObject>(8);
        *global_tx = Some(tx);
        rx
    };
    let stream = tokio_stream::wrappers::ReceiverStream::new(rx).filter_map(
        move |it| -> Option<Result<sse::Event, BoxError>> {
            Some(Ok(sse::Event::default().data(it.to_json())))
        },
    );
    let guard = CleanGuard {};
    let stream = guardable(stream, guard);
    let (stream, stream_controller) = stream::abortable(stream);
    let shutdown_signal = state.shutdown_signal.clone();
    // issue: https://github.com/hyperium/hyper/issues/2787
    tokio::spawn(async move {
        shutdown_signal.cancelled().await;
        stream_controller.abort();
    });
    (
        StatusCode::OK,
        Sse::new(stream).keep_alive(
            sse::KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keep ಠ_ಠ"),
        ),
    )
        .into_response()
}
