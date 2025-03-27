use std::net::SocketAddr;
use std::sync::{Arc, LazyLock};
use std::time::Duration;

use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{ConnectInfo, Json, State, WebSocketUpgrade};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use futures::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::broadcast;
use tokio::sync::broadcast::Receiver;
use uuid::Uuid;

use crate::common::{ApiError, ApiResult};
use crate::services::notify::SSEBroadcastEvent;
use crate::state::AppState;
use crate::utils::{Observer, SessionManager};

#[derive(Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ExchangeProtocolPriority {
    Webrtc,
    Websocket,
}

struct P2PSession {
    supports_rtc: bool,
    sender_id: Uuid,
    receiver_id: Uuid,
    established: bool,
    priority: Option<ExchangeProtocolPriority>,
    alive: u8,
}

static SHARED_SESSIONS: LazyLock<Arc<SessionManager<Uuid, P2PSession>>> =
    LazyLock::new(|| SessionManager::new(Duration::from_secs(300)));

#[derive(Debug, Deserialize)]
pub struct CreateP2PRequestDto {
    client_id: Uuid,
    target_id: Uuid,
    target_pin: Option<String>,
    supports_rtc: bool,
    priority: Option<ExchangeProtocolPriority>,
}
pub async fn create_request(
    State(state): State<AppState>,
    Json(form): Json<CreateP2PRequestDto>,
) -> ApiResult<Json<serde_json::Value>> {
    let request_id = Uuid::new_v4();
    let sessions = SHARED_SESSIONS.clone();
    // 确认接收端处于空闲状态（无其他 P2P 连接）
    if sessions.guard().iter().any(|(_, session)| {
        session.sender_id == form.target_id || session.receiver_id == form.target_id
    }) {
        return Err(ApiError::BadRequest(anyhow::format_err!(
            "P2P request creation failed due to receiver is currently busy."
        )));
    }
    let pins_match = match (
        form.target_pin,
        state.notify_manager.get_client_pin(&form.target_id),
    ) {
        (Some(sender_pin), Some(receiver_pin)) => sender_pin == receiver_pin,
        (None, None) => true,
        _ => false,
    };
    if !pins_match {
        return Err(ApiError::BadRequest(anyhow::format_err!(
            "P2P request creation failed due to PIN mismatch."
        )));
    }
    state
        .notify_manager
        .send_with_client(SSEBroadcastEvent::P2PRequest(request_id), &form.target_id)?;
    sessions.insert(
        request_id,
        P2PSession {
            supports_rtc: form.supports_rtc,
            priority: form.priority,
            sender_id: form.client_id,
            receiver_id: form.target_id,
            established: false,
            alive: 0,
        },
    );
    tracing::info!(
        "created p2p request, rtc: {}, request_id: {}",
        form.supports_rtc,
        request_id
    );
    Ok(Json(serde_json::json!({
        "request_id": request_id,
        "status": "pending"
    })))
}
#[derive(Debug, Deserialize)]
pub struct AcceptP2PRequestDto {
    request_id: Uuid,
    client_id: Uuid,
    supports_rtc: bool,
}
pub async fn accept_request(
    State(state): State<AppState>,
    Json(form): Json<AcceptP2PRequestDto>,
) -> ApiResult<Json<serde_json::Value>> {
    tracing::info!(
        "accepted p2p request, rtc: {}, request_id: {}",
        form.supports_rtc,
        form.request_id
    );
    let (protocol, sender_id, receiver_id) = {
        let mut guard = SHARED_SESSIONS.guard();
        let session = if let Some(value) = guard.get_mut(&form.request_id) {
            value
        } else {
            return Err(ApiError::BadRequest(anyhow::format_err!(
                "Failed to accept p2p request, the request has expired."
            )));
        };
        if session.receiver_id != form.client_id {
            return Err(ApiError::BadRequest(anyhow::format_err!(
                "Failed to accept p2p request, the request is invalid."
            )));
        }
        if !state.notify_manager.contains_client(&session.sender_id) {
            guard.remove(&form.request_id);
            return Err(ApiError::BadRequest(anyhow::format_err!(
                "Failed to accept p2p request, sender closed."
            )));
        }
        session.established = true;
        let protocol = if session.supports_rtc
            && session.supports_rtc == form.supports_rtc
            && session
                .priority
                .as_ref()
                .map(|priority| priority != &ExchangeProtocolPriority::Websocket)
                .unwrap_or(true)
        {
            ExchangeProtocol::Rtc
        } else {
            ExchangeProtocol::Socket
        };
        (protocol, session.sender_id, session.receiver_id)
    };
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let _ = state.notify_manager.send_with_clients(
            SSEBroadcastEvent::P2PExchange(Exchange {
                request_id: form.request_id,
                protocol,
                participants: vec![sender_id, receiver_id],
            }),
            vec![sender_id, receiver_id],
        );
    });
    Ok(Json(serde_json::json!({
        "status": "accepted"
    })))
}
#[derive(Debug, Deserialize)]
pub struct CreateSignalingDto {
    request_id: Uuid,
    client_id: Uuid,
    payload: serde_json::Value,
}
pub async fn signaling(
    State(state): State<AppState>,
    Json(form): Json<CreateSignalingDto>,
) -> ApiResult<Json<serde_json::Value>> {
    let sessions = SHARED_SESSIONS.clone();
    let session = sessions
        .get(&form.request_id)
        .with_context(|| "Failed to send signal: invalid request_id")?;
    let receiver_id = if session.sender_id == form.client_id {
        session.receiver_id
    } else {
        session.sender_id
    };
    state
        .notify_manager
        .send_with_client(SSEBroadcastEvent::P2PSignaling(form.payload), &receiver_id)?;
    Ok(Json(serde_json::json!({"msg": "ok!"})))
}
#[derive(Debug, Deserialize)]
pub struct DiscardRequestDto {
    request_id: Uuid,
}
pub async fn discard_request(
    State(state): State<AppState>,
    Json(form): Json<DiscardRequestDto>,
) -> ApiResult<Json<serde_json::Value>> {
    if let Some(session) = SHARED_SESSIONS.remove(&form.request_id) {
        state.notify_manager.send_with_client(
            SSEBroadcastEvent::P2PReject(form.request_id),
            &session.sender_id,
        )?;
    };
    tracing::info!("discard p2p request,request_id: {}", form.request_id);
    Ok(Json(serde_json::json!({"msg": "ok!"})))
}

pub async fn socket(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let user_agent = headers
        .get("user-agent")
        .map(|it| String::from_utf8(it.as_bytes().to_vec()).unwrap())
        .unwrap_or("unknown user_agent".into());
    ws.on_upgrade(move |socket| async move {
        if let Err(err) = handle_socket(socket, state, addr, user_agent.clone()).await {
            tracing::error!("{}", err)
        }
        tracing::debug!("`{}@{}` disconnected", addr, user_agent);
    })
}

#[repr(u8)]
#[derive(Eq, PartialEq)]
enum PacketFlag {
    Data = 0x01,
    // reserved 240-255
    Reserved = 0xF0,
    // 和服务端连接已就绪
    ConnectionReady = 0xF1,
    // 和另一个客户端已建立连接
    ConnectionEstablished = 0xF2,
    // 和服务端连接已关闭
    ConnectionClose = 0xF3,
    Who = 0xF4,
    Heartbeat = 0xFE,
    Error = 0xFF,
}
impl From<u8> for PacketFlag {
    fn from(value: u8) -> Self {
        match value {
            0..=0xEF => PacketFlag::Data,
            0xF0 => PacketFlag::Reserved,
            0xF1 => PacketFlag::ConnectionReady,
            0xF2 => PacketFlag::ConnectionEstablished,
            0xF3 => PacketFlag::ConnectionClose,
            0xF4 => PacketFlag::Who,
            0xFE => PacketFlag::Heartbeat,
            0xFF => PacketFlag::Error,
            _ => PacketFlag::Reserved,
        }
    }
}

async fn handle_socket(
    socket: WebSocket,
    state: AppState,
    addr: SocketAddr,
    user_agent: String,
) -> anyhow::Result<()> {
    tracing::debug!("`{}@{}` connected", addr, user_agent);
    let (mut sender, mut receiver) = socket.split();
    let (request_id, sender_id) = if let Some(Ok(message)) = receiver.next().await {
        let (flag, bytes) = parse_message(&message)?;
        if flag == PacketFlag::Who && bytes.len() == 32 {
            let (request_id, client_id) = bytes.split_at(16);
            let request_id = Uuid::from_slice(request_id)?;
            let client_id = Uuid::from_slice(client_id)?;
            (request_id, client_id)
        } else {
            anyhow::bail!("unrecognized data packet");
        }
    } else {
        anyhow::bail!("client {addr} abruptly disconnected");
    };
    let (receiver_id, alive) = {
        let mut guard = SHARED_SESSIONS.guard();
        let session = guard
            .get_mut(&request_id)
            .filter(|it| it.established)
            .with_context(|| "Unable to establish connection")?;
        if session.alive == 2 {
            anyhow::bail!("Only one peer-to-peer connection can be established")
        }
        session.alive += 1;
        let receiver_id = if session.sender_id == sender_id {
            session.receiver_id
        } else {
            session.sender_id
        };
        (receiver_id, session.alive)
    };
    sender
        .send(Message::Binary(
            [PacketFlag::ConnectionReady as u8].to_vec().into(),
        ))
        .await
        .with_context(|| "Could not send connection ready event")?;
    let socket_manager = state.socket_manager.clone();
    // 如果 alive 有两个则通过 socket 通知当前客户端和通过 broadcast 通知另一个客户端“连接已就绪”
    if alive == 2 {
        let packet = [PacketFlag::ConnectionEstablished as u8];
        sender
            .send(Message::Binary(packet.to_vec().into()))
            .await
            .with_context(|| "Could not send connection established event")?;
        socket_manager
            .send(packet.to_vec(), &receiver_id)
            .with_context(|| "Could not send connection established event")?;
    }
    // 接收 socket 和 broadcast 数据
    {
        let socket_manager = socket_manager.clone();
        let mut rx = socket_manager.subscribe();
        // 接收 broadcast 数据
        let mut send_task = tokio::spawn(async move {
            while let Ok((packet, target)) = rx.recv().await {
                if target != sender_id {
                    drop(packet);
                    continue;
                }
                let packet = Arc::unwrap_or_clone(packet);
                // let packet = if packet[0] >= 0xF0 || packet.len() < 8196 {
                //     packet.as_ref().clone()
                // } else {
                //     match packet.into_inner() {
                //         Some(packet) => {
                //             packet
                //         },
                //         None => {
                //             tracing::error!("Unexpected error, packet has been used");
                //             continue;
                //         }
                //     }
                // };
                if sender.send(Message::Binary(packet.into())).await.is_err() {
                    break;
                }
            }
            drop(rx)
        });
        // 接收 socket 数据
        let mut recv_task = tokio::spawn(async move {
            while let Some(Ok(Message::Binary(bytes))) = receiver.next().await {
                if bytes[0] < 0xF0 {
                    let _ = socket_manager.send(bytes.to_vec(), &receiver_id);
                    continue;
                }
                // handle reserve event
                todo!()
            }
        });
        tokio::select! {
            _ = &mut send_task => recv_task.abort(),
            _ = &mut recv_task => send_task.abort(),
        }
    }
    // 如果 session 还存在则更新 alive 字段
    {
        let mut guard = SHARED_SESSIONS.guard();
        if let Some(value) = guard.get_mut(&request_id) {
            value.alive -= 1;
        };
    }
    // 通过 broadcast 通知另一个客户端“连接已关闭”
    {
        socket_manager
            .send([PacketFlag::ConnectionClose as u8].to_vec(), &receiver_id)
            .with_context(|| "Could not send connection close event")?;
    }
    Ok(())
}
fn parse_message(message: &Message) -> anyhow::Result<(PacketFlag, &[u8])> {
    match message {
        Message::Binary(bytes) => {
            if bytes.is_empty() {
                anyhow::bail!("invalid data packet")
            }
            let (flag, bytes) = bytes.split_first().unwrap();
            let flag = PacketFlag::from(*flag);
            Ok((flag, bytes))
        }
        Message::Ping(bytes) => Ok((PacketFlag::Heartbeat, bytes)),
        Message::Pong(bytes) => Ok((PacketFlag::Heartbeat, bytes)),
        _ => anyhow::bail!("invalid message"),
    }
}
// fn to_packet(flag: PacketFlag, bytes: Vec<u8>) -> Vec<u8> {
//     match flag {
//         PacketFlag::Data => bytes,
//         _ => {
//             let mut packet = vec![flag as u8];
//             packet.extend(bytes);
//             packet
//         }
//     }
// }

pub struct SocketManager {
    tx: broadcast::Sender<(Arc<Vec<u8>>, Uuid)>,
}
impl SocketManager {
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(8);
        Self { tx }
    }
    pub fn send(&self, bytes: Vec<u8>, target: &Uuid) -> anyhow::Result<usize> {
        self.tx
            .send((Arc::new(bytes), *target))
            .with_context(|| "Could not send bytes")
    }
    pub fn subscribe(&self) -> Receiver<(Arc<Vec<u8>>, Uuid)> {
        self.tx.subscribe()
    }
}

impl Observer<Uuid> for SocketManager {
    fn notify(&self, value: Uuid) {
        SHARED_SESSIONS.remove(&value);
    }
}

#[derive(Debug, Clone)]
pub enum ExchangeProtocol {
    Rtc,
    Socket,
}

#[derive(Debug, Clone)]
pub struct Exchange {
    request_id: Uuid,
    protocol: ExchangeProtocol,
    participants: Vec<Uuid>,
}

impl Exchange {
    pub fn to_json(&self) -> String {
        let protocol = match self.protocol {
            ExchangeProtocol::Rtc => "webrtc",
            ExchangeProtocol::Socket => "websocket",
        };
        serde_json::json!({
            "type": "P2P_EXCHANGE",
            "payload": {
                "request_id": self.request_id,
                "protocol": protocol,
                "participants": self.participants
            }
        })
        .to_string()
    }
}
