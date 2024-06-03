use crate::extractors::ClientIp;
use crate::state::AppState;
use axum::{
    extract::State,
    http::HeaderMap,
    response::{sse, Sse},
    BoxError,
};
use futures::stream;
use serde_json::json;
use std::time::{Duration, SystemTime};
use tokio_stream::StreamExt;

struct NotifyGuard {
    user_agent: String,
    ip: String,
}
impl Drop for NotifyGuard {
    fn drop(&mut self) {
        tracing::info!("`{}@{}` disconnected", self.ip, self.user_agent)
    }
}

pub async fn update_notify(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<sse::Event, BoxError>>> {
    let ip = ip.unwrap_or("unknown".to_string());
    let user_agent = headers
        .get("user-agent")
        .map(|it| String::from_utf8(it.as_bytes().to_vec()).unwrap())
        .unwrap_or("Unknown user_agent".into());
    tracing::info!("`{}@{}` connected", ip, user_agent);
    let _guard = NotifyGuard { ip, user_agent };
    let receiver = state.broadcast.subscribe();
    let notify_stream = tokio_stream::wrappers::BroadcastStream::new(receiver).map(
        |it| -> Result<sse::Event, BoxError> {
            match it {
                Ok(payload) => Ok(sse::Event::default().data(payload.to_json())),
                Err(err) => {
                    tracing::error!(reason = ?err, "failed to read broadcast message.");
                    Err(Box::new(err))
                }
            }
        },
    );
    let heart_stream = stream::repeat_with(|| {
        let now = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        sse::Event::default().data(
            json!({
                "type": "HEART",
                "time": now.as_millis()
            })
            .to_string(),
        )
    })
    .map(|it| -> Result<sse::Event, BoxError> { Ok(it) })
    .throttle(Duration::from_secs(1));
    let combined_stream = stream::select(notify_stream, heart_stream);
    let (combined_stream, ab) = stream::abortable(combined_stream);
    let shutdown_signal = state.shutdown_signal.clone();
    // issue: https://github.com/hyperium/hyper/issues/2787
    tokio::spawn(async move {
        shutdown_signal.cancelled().await;
        ab.abort()
    });
    Sse::new(combined_stream).keep_alive(
        sse::KeepAlive::new()
            .interval(Duration::from_secs(1))
            .text("keep"),
    )
}
