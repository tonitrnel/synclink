use uuid::Uuid;

#[derive(Debug, Clone)]
pub enum SSEBroadcastEvent {
    ClientRegistration(Uuid, String), // uuid, code
    UserConnected(Uuid),
    UserDisconnected(Uuid),
    IndexChanged(crate::services::file::IndexChange),
    P2PRequest(Uuid),
    P2PRejected(Uuid),
    P2PCanceled(Uuid),
    P2PExchange(crate::services::p2p::Exchange),
    P2PSignaling(serde_json::Value),
}
impl From<crate::services::file::IndexChange> for SSEBroadcastEvent {
    fn from(v: crate::services::file::IndexChange) -> Self {
        Self::IndexChanged(v)
    }
}
impl From<crate::services::p2p::Exchange> for SSEBroadcastEvent {
    fn from(v: crate::services::p2p::Exchange) -> Self {
        Self::P2PExchange(v)
    }
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
            SSEBroadcastEvent::IndexChanged(value) => return value.to_json(),
            SSEBroadcastEvent::UserConnected(uid) => ("USER_CONNECTED", uid),
            SSEBroadcastEvent::UserDisconnected(uid) => ("USER_DISCONNECTED", uid),
            SSEBroadcastEvent::ClientRegistration(uid, pin_code) => {
                return serde_json::json!({
                    "type": "CLIENT_ID",
                    "payload": format!("{uid};{pin_code}")
                })
                .to_string();
            }
            SSEBroadcastEvent::P2PRequest(uid) => ("P2P_REQUEST", uid),
            SSEBroadcastEvent::P2PRejected(uid) => ("P2P_REJECT", uid),
            SSEBroadcastEvent::P2PCanceled(uid) => ("P2P_CANCELED", uid),
            SSEBroadcastEvent::P2PExchange(value) => return value.to_json(),
            SSEBroadcastEvent::P2PSignaling(value) => {
                return serde_json::json!({
                    "type": "P2P_SIGNALING",
                    "payload": value
                })
                .to_string();
            }
        };
        serde_json::json!({
            "type": action,
            "payload": uid
        })
        .to_string()
    }
}
