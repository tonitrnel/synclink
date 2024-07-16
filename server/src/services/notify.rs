use crate::errors::ApiResponse;
use crate::extractors::ClientIp;
use crate::state::AppState;
use axum::{
    extract::State,
    http::HeaderMap,
    response::{sse, Sse},
    BoxError, Json,
};
use futures::stream;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use uuid::Uuid;

#[derive(Clone)]
struct NotifyGuard {
    id: Uuid,
    user_agent: String,
    ip: String,
    notify_manager: Arc<NotifyManager>,
}
impl NotifyGuard {
    fn new(ip: String, user_agent: String, notify_manager: Arc<NotifyManager>) -> Self {
        let id = Uuid::new_v4();
        notify_manager.add_client(
            id,
            SSEConnection {
                ip: ip.to_string(),
                user_agent: user_agent.to_string(),
            },
        );
        Self {
            id,
            ip,
            user_agent,
            notify_manager,
        }
    }
}
impl Drop for NotifyGuard {
    fn drop(&mut self) {
        self.notify_manager.remove_client(&self.id);
        tracing::trace!("`{}@{}` disconnected", self.ip, self.user_agent);
    }
}

pub async fn notify(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    headers: HeaderMap,
) -> Sse<impl tokio_stream::Stream<Item = Result<sse::Event, BoxError>>> {
    let ip = ip.unwrap_or("unknown".to_string());
    let user_agent = headers
        .get("user-agent")
        .map(|it| String::from_utf8(it.as_bytes().to_vec()).unwrap())
        .unwrap_or("unknown user_agent".into());
    tracing::trace!("`{}@{}` connected", ip, user_agent);
    let guard = NotifyGuard::new(ip, user_agent, state.notify_manager.clone());
    let id = guard.id;
    let receiver = state.notify_manager.subscribe();
    let notify_stream = tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(
        move |it| -> Option<Result<sse::Event, BoxError>> {
            match it {
                Ok((payload, targets)) => match targets {
                    SSEBroadcastTargets::AllClients => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    SSEBroadcastTargets::Client(target) if target == id => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    SSEBroadcastTargets::ClientSet(targets) if targets.contains(&id) => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    SSEBroadcastTargets::AllExceptClient(target) if target != id => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    SSEBroadcastTargets::AllExceptClientSet(targets) if !targets.contains(&id) => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    _ => None,
                },
                Err(err) => {
                    tracing::error!(reason = ?err, "failed to read broadcast message.");
                    Some(Err(Box::new(err)))
                }
            }
        },
    );
    // let heart_stream = stream::repeat_with(|| {
    //     let now = SystemTime::now()
    //         .duration_since(std::time::UNIX_EPOCH)
    //         .unwrap_or_default();
    //     sse::Event::default().data(
    //         serde_json::json!({
    //             "type": "HEART",
    //             "time": now.as_millis()
    //         })
    //         .to_string(),
    //     )
    // })
    // .map(|it| -> Result<sse::Event, BoxError> { Ok(it) })
    // .throttle(Duration::from_secs(1));
    // let combined_stream = stream::select(notify_stream, heart_stream);
    let combined_stream = utils::guarded(notify_stream, guard);
    let (combined_stream, stream_controller) = stream::abortable(combined_stream);
    let shutdown_signal = state.shutdown_signal.clone();
    // issue: https://github.com/hyperium/hyper/issues/2787
    tokio::spawn(async move {
        shutdown_signal.cancelled().await;
        stream_controller.abort();
    });
    state
        .notify_manager
        .send_with_client(SSEBroadcastEvent::ClientId(id), &id)
        .unwrap();
    Sse::new(combined_stream).keep_alive(
        sse::KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep(•_•)"),
    )
}

#[derive(Serialize, Debug)]
pub struct ConnectionDto {
    id: Uuid,
    ip_alias: Option<String>,
    user_agent: String,
}
pub async fn sse_connections(
    State(state): State<AppState>,
) -> ApiResponse<Json<Vec<ConnectionDto>>> {
    let device_ip_tags = crate::config::load().device_ip_tags.as_ref();
    let guard = state.notify_manager.connections.lock().unwrap();
    let data = guard
        .iter()
        .map(|(id, it)| ConnectionDto {
            id: *id,
            ip_alias: device_ip_tags.and_then(|tags| tags.get(&it.ip).cloned()),
            user_agent: it.user_agent.clone(),
        })
        .collect::<Vec<_>>();
    Ok(Json(data))
}

#[derive(Debug)]
pub struct NotifyManager {
    sender: broadcast::Sender<(SSEBroadcastEvent, SSEBroadcastTargets)>,
    connections: Mutex<HashMap<Uuid, SSEConnection>>,
}
#[derive(Debug)]
pub struct SSEConnection {
    ip: String,
    user_agent: String,
}

type SendResult =
    Result<usize, broadcast::error::SendError<(SSEBroadcastEvent, SSEBroadcastTargets)>>;
impl NotifyManager {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(8);
        Self {
            sender: tx,
            connections: Mutex::new(HashMap::new()),
        }
    }
    pub fn add_client(&self, id: Uuid, conn: SSEConnection) {
        let mut guard = self.connections.lock().unwrap();
        guard.insert(id, conn);
        println!("add_client, connection len {:?}", guard.len());
        if let Err(err) = self.send(SSEBroadcastEvent::UserConnected(id)) {
            tracing::error!(reason = ?err, "Failed to send sse client connected event");
        }
    }
    pub fn remove_client(&self, id: &Uuid) {
        let mut guard = self.connections.lock().unwrap();
        guard.remove(id);
        println!("remove_client, connection len {:?}", guard.len());
        if let Err(err) = self.send(SSEBroadcastEvent::UserDisconnected(*id)) {
            tracing::error!(reason = ?err, "Failed to send sse client disconnected event");
        };
    }
    pub fn send(&self, event: SSEBroadcastEvent) -> SendResult {
        self.sender.send((event, SSEBroadcastTargets::AllClients))
    }
    pub fn send_with_client(&self, event: SSEBroadcastEvent, conn_id: &Uuid) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::Client(*conn_id)))
    }
    pub fn send_without_client(&self, event: SSEBroadcastEvent, conn_id: &Uuid) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::AllExceptClient(*conn_id)))
    }
    pub fn send_with_clients(&self, event: SSEBroadcastEvent, conn_ids: Vec<Uuid>) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::ClientSet(conn_ids)))
    }
    pub fn send_without_clients(
        &self,
        event: SSEBroadcastEvent,
        conn_ids: Vec<Uuid>,
    ) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::AllExceptClientSet(conn_ids)))
    }
    pub fn subscribe(&self) -> broadcast::Receiver<(SSEBroadcastEvent, SSEBroadcastTargets)> {
        self.sender.subscribe()
    }
}
#[derive(Debug, Clone)]
pub enum SSEBroadcastEvent {
    ClientId(Uuid),
    UserConnected(Uuid),
    UserDisconnected(Uuid),
    IndexUpdate(crate::models::file_indexing::IndexChangeAction),
    P2PRequest(Uuid),
    P2PReject(Uuid),
    P2PExchange(crate::services::p2p::Exchange),
    P2PSignaling(serde_json::Value),
}
#[derive(Debug, Clone)]
pub enum SSEBroadcastTargets {
    AllClients,                    // 所有客户端
    Client(Uuid),                  // 指定的单个客户端
    ClientSet(Vec<Uuid>),          // 指定的客户端集
    AllExceptClient(Uuid),         // 除了指定的单个客户端
    AllExceptClientSet(Vec<Uuid>), // 除了指定的客户端集
}
impl SSEBroadcastEvent {
    pub fn to_json(&self) -> String {
        let (action, uid) = match self {
            SSEBroadcastEvent::IndexUpdate(value) => return value.to_json(),
            SSEBroadcastEvent::UserConnected(uid) => ("USER_CONNECTED", uid),
            SSEBroadcastEvent::UserDisconnected(uid) => ("USER_DISCONNECTED", uid),
            SSEBroadcastEvent::ClientId(uid) => ("CLIENT_ID", uid),
            SSEBroadcastEvent::P2PRequest(uid) => ("P2P_REQUEST", uid),
            SSEBroadcastEvent::P2PReject(uid) => ("P2P_REJECT", uid),
            SSEBroadcastEvent::P2PExchange(value) => return value.to_json(),
            SSEBroadcastEvent::P2PSignaling(value) => {
                return serde_json::json!({
                    "type": "P2P_SIGNALING",
                    "payload": value
                })
                .to_string()
            }
        };
        serde_json::json!({
            "type": action,
            "payload": uid
        })
        .to_string()
    }
}
impl From<crate::models::file_indexing::IndexChangeAction> for SSEBroadcastEvent {
    fn from(value: crate::models::file_indexing::IndexChangeAction) -> Self {
        SSEBroadcastEvent::IndexUpdate(value)
    }
}

mod utils {
    use futures::Stream;
    use pin_project_lite::pin_project;
    use std::pin::Pin;
    use std::task::{Context, Poll};

    pub fn guarded<S, G>(stream: S, guard: G) -> GuardedStream<S, G>
    where
        S: Stream,
    {
        GuardedStream::new(stream, guard)
    }
    pin_project! {
        #[derive(Debug, Clone)]
        pub struct GuardedStream<S, G> {
            #[pin]
            inner: S,
            guard: Option<G>,
        }
    }
    impl<S, G> GuardedStream<S, G> {
        fn new(stream: S, guard: G) -> Self {
            Self {
                inner: stream,
                guard: Some(guard),
            }
        }
    }
    impl<S, G> Stream for GuardedStream<S, G>
    where
        S: Stream,
        G: Unpin,
    {
        type Item = S::Item;
        fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            let mut this = self.project();
            let r = Pin::new(&mut this.inner).poll_next(cx);
            if let Poll::Ready(None) = r {
                this.guard.take();
            }
            r
        }
        fn size_hint(&self) -> (usize, Option<usize>) {
            self.inner.size_hint()
        }
    }
}
