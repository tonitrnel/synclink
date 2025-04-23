use crate::services::p2p::P2PService;
use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use std::mem;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc;
use uuid::Uuid;

struct RelaySocketSession {
    primary: BidiEndpoint<Message, Message>,
    secondary: BidiEndpoint<Message, Message>,
}

pub struct RelaySocketService {
    sessions: DashMap<Uuid, RelaySocketSession>,
    p2p_service: Arc<P2PService>,
}
impl RelaySocketService {
    pub fn new(p2p_service: Arc<P2PService>) -> Self {
        Self {
            sessions: DashMap::new(),
            p2p_service,
        }
    }
    pub async fn relay(
        &self,
        mut socket: WebSocket,
        addr: SocketAddr,
    ) -> anyhow::Result<()> {
        // 身份解析
        let (request_id, client_id) = if let Some(Ok(message)) = socket.recv().await {
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

        if !self.p2p_service.verify(&request_id, &client_id) {
            anyhow::bail!("invalid connection");
        }

        socket
            .send(Message::Binary([PacketFlag::Ready as u8].to_vec().into()))
            .await
            .with_context(|| "Could not send connection ready event")?;

        let is_primary = !self.sessions.contains_key(&request_id);
        // 等待对话结束
        let rt = {
            let mut session = self.sessions.entry(request_id).or_insert_with(|| {
                let (primary, secondary) = new_bidi_channel(8);
                RelaySocketSession { primary, secondary }
            });
            // 如果主机因某些原因断开重连 is_primary 必定是 true, 因此需要查看 primary 是否绑定
            let is_primary = is_primary || !session.primary.is_bound();
            let handle = if is_primary {
                session.primary.bind_socket(socket)?
            } else {
                session.secondary.bind_socket(socket)?
            };
            if session.primary.is_bound() && session.secondary.is_bound() {
                let packet = [PacketFlag::Established as u8];
                session.primary.send(packet.to_vec()).await?;
                session.secondary.send(packet.to_vec()).await?;
            }
            handle
        }
        .await??;
        let mut session = self.sessions.get_mut(&request_id).unwrap();
        // 通知另一个客户端“连接已关闭”
        let packet = [PacketFlag::Disconnected as u8];
        if is_primary {
            session.primary.unbind(rt);
            session.secondary.send(packet.to_vec()).await?;
        } else {
            session.secondary.unbind(rt);
            session.primary.send(packet.to_vec()).await?;
        }
        // 如果两边都没有绑定则移除会话
        if !session.primary.is_bound() && !session.secondary.is_bound() {
            drop(session);
            self.sessions.remove(&request_id);
        }
        Ok(())
    }
}

#[repr(u8)]
#[derive(Eq, PartialEq)]
enum PacketFlag {
    Data = 0x01,
    // reserved 240-255
    Reserved = 0xF0,
    // 和服务端连接已就绪
    Ready = 0xF1,
    // 和另一个客户端已建立连接
    Established = 0xF2,
    // 对方设备和服务端连接丢失，但随时可能建立
    Disconnected = 0xF3,
    Who = 0xF4,
    Heartbeat = 0xFE,
    Error = 0xFF,
}
impl From<u8> for PacketFlag {
    fn from(value: u8) -> Self {
        match value {
            0..=0xEF => PacketFlag::Data,
            0xF0 => PacketFlag::Reserved,
            0xF1 => PacketFlag::Ready,
            0xF2 => PacketFlag::Established,
            0xF3 => PacketFlag::Disconnected,
            0xF4 => PacketFlag::Who,
            0xFE => PacketFlag::Heartbeat,
            0xFF => PacketFlag::Error,
            _ => PacketFlag::Reserved,
        }
    }
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

enum BidiEndpoint<Out, In> {
    Unbound(mpsc::Sender<Out>, mpsc::Receiver<In>),
    Bound(mpsc::Sender<Out>),
}

impl BidiEndpoint<Message, Message> {
    fn bind_socket(
        &mut self,
        socket: WebSocket,
    ) -> anyhow::Result<
        tokio::task::JoinHandle<anyhow::Result<(mpsc::Sender<Message>, mpsc::Receiver<Message>)>>,
    > {
        let sender = match self {
            BidiEndpoint::Unbound(sender, _) => sender.clone(),
            BidiEndpoint::Bound(_) => anyhow::bail!("Socket is already bound"),
        };
        let (rx, mut tx) = match mem::replace(self, BidiEndpoint::Bound(sender)) {
            BidiEndpoint::Unbound(rx, tx) => (rx, tx),
            BidiEndpoint::Bound(_) => unreachable!(),
        };
        let (mut sender, mut receiver) = socket.split();
        let signal = tokio_util::sync::CancellationToken::new();
        let c_signal = signal.clone();
        let mut recv_bidi = tokio::spawn(async move {
            let mut recv = async || {
                tokio::select! {
                    v = tx.recv() => {
                        v
                    },
                    _ = c_signal.cancelled() => {
                        None
                    }
                }
            };
            while let Some(bytes) = recv().await {
                sender
                    .send(Message::from(bytes))
                    .await
                    .context("Failed to send message to WebSocket")?;
            }
            Ok(tx) as anyhow::Result<mpsc::Receiver<Message>>
        });
        let c_signal = signal.clone();
        let mut recv_socket = tokio::spawn(async move {
            let mut recv = async || {
                tokio::select! {
                    v = receiver.next() => {
                        v
                    },
                    _ = c_signal.cancelled() => {
                        None
                    }
                }
            };
            while let Some(message) = recv().await {
                let message = message.context("WebSocket receive error")?;
                rx.send(message)
                    .await
                    .context("Failed to send message to channel")?;
            }
            Ok(rx) as anyhow::Result<mpsc::Sender<Message>>
        });
        let handle = tokio::spawn(async {
            let a = signal;
            let b = a.clone();
            let (rx, tx) = tokio::select! {
                v = &mut recv_socket => {
                    a.cancel();
                    (v??, recv_bidi.await??)
                },
                v = &mut recv_bidi => {
                    b.cancel();
                    (recv_socket.await??, v??)
                },
            };
            Ok((rx, tx))
        });
        Ok(handle)
    }
    fn unbind(&mut self, rt: (mpsc::Sender<Message>, mpsc::Receiver<Message>)) {
        let _ = mem::replace(self, BidiEndpoint::Unbound(rt.0, rt.1));
    }
    fn is_bound(&self) -> bool {
        matches!(self, BidiEndpoint::Bound(_))
    }

    /// 向目标发送数据
    ///
    /// **注意**: 如果未绑定 socket 则忽略发送
    async fn send(&self, bytes: Vec<u8>) -> Result<(), mpsc::error::SendError<Message>> {
        let message = Message::Binary(bytes.into());
        match self {
            BidiEndpoint::Unbound(_, _) => Ok(()),
            BidiEndpoint::Bound(sender) => Ok(sender.send(message).await?),
        }
    }
}

fn new_bidi_channel<A, B>(capacity: usize) -> (BidiEndpoint<A, B>, BidiEndpoint<B, A>) {
    let (tx1, rx1) = mpsc::channel(capacity);
    let (tx2, rx2) = mpsc::channel(capacity);
    let channel1 = BidiEndpoint::Unbound(tx1, rx2);
    let channel2 = BidiEndpoint::Unbound(tx2, rx1);

    (channel1, channel2)
}
