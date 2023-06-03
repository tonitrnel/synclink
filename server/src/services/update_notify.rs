use crate::config::state::AppState;
use axum::{
    debug_handler,
    extract::State,
    http::HeaderMap,
    response::{sse, Sse},
};

#[debug_handler]
pub async fn update_notify(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<sse::Event, std::convert::Infallible>>> {
    let user_agent = headers
        .get("user-agent")
        .map(|it| String::from_utf8(it.as_bytes().to_vec()).unwrap())
        .unwrap_or("Unknown user_agent".into());
    tracing::info!("`{}` connected", user_agent);
    struct Guard {
        user_agent: String,
    }
    impl Drop for Guard {
        fn drop(&mut self) {
            tracing::info!("`{}` disconnected", self.user_agent)
        }
    }
    use async_stream::try_stream;
    use axum::response::sse;
    let mut receiver = state.broadcast.subscribe();
    let stream = try_stream! {
        let _guard = Guard{ user_agent };
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
    Sse::new(stream).keep_alive(sse::KeepAlive::default())
}
