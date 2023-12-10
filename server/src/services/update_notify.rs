use crate::state::AppState;
use async_stream::try_stream;
use axum::{
    extract::{ConnectInfo, State},
    http::HeaderMap,
    response::{sse, Sse},
};
use futures::stream;
use serde_json::json;
use std::net::SocketAddr;
use std::time::{Duration, SystemTime};
use tokio_stream::StreamExt;

pub async fn update_notify(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<sse::Event, std::convert::Infallible>>> {
    let ip = addr.ip().to_string();
    let user_agent = headers
        .get("user-agent")
        .map(|it| String::from_utf8(it.as_bytes().to_vec()).unwrap())
        .unwrap_or("Unknown user_agent".into());
    tracing::info!("`{}@{}` connected", ip, user_agent);
    struct Guard {
        user_agent: String,
        ip: String,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            tracing::info!("`{}@{}` disconnected", self.ip, self.user_agent)
        }
    }
    let mut receiver = state.broadcast.subscribe();
    let notify_stream = try_stream! {
        let _guard = Guard{ ip, user_agent };
        loop{
            match receiver.recv().await{
                Ok(i) => {
                    let event = sse::Event::default().data(i.to_json());
                    yield event;
                },
                Err(err) => {
                    tracing::error!(error = ?err, "Failed to get");
                }
            }
        }
    };
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
    .map(|it| -> Result<sse::Event, std::convert::Infallible> { Ok(it) })
    .throttle(Duration::from_secs(1));
    let combined_stream = stream::select(notify_stream, heart_stream);
    Sse::new(combined_stream).keep_alive(
        sse::KeepAlive::new()
            .interval(Duration::from_secs(1))
            .text("keep"),
    )
}
