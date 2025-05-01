use uuid::Uuid;

#[derive(Debug, Clone)]
pub enum BroadcastEvent {
    ClientRegistration(Uuid, String), // uuid, code
    UserConnected(Uuid),
    UserDisconnected(Uuid),
    IndexChanged(crate::services::file::IndexChange),
    P2PRequest(Uuid),
    P2PRejected(Uuid),
    P2PCanceled(Uuid),
    P2PDowngrade(Uuid),
    P2PExchange(crate::services::p2p::Exchange),
    P2PSignaling(serde_json::Value),
}
impl From<crate::services::file::IndexChange> for BroadcastEvent {
    fn from(v: crate::services::file::IndexChange) -> Self {
        Self::IndexChanged(v)
    }
}
impl From<crate::services::p2p::Exchange> for BroadcastEvent {
    fn from(v: crate::services::p2p::Exchange) -> Self {
        Self::P2PExchange(v)
    }
}
#[derive(Debug, Clone)]
pub enum BroadcastScope {
    All,                  // 所有客户端
    Only(Uuid),           // 指定的单个客户端
    OnlySet(Vec<Uuid>),   // 指定的客户端集
    Except(Uuid),         // 除了指定的单个客户端
    ExceptSet(Vec<Uuid>), // 除了指定的客户端集
}
impl BroadcastEvent {
    pub fn to_json(&self) -> String {
        let (action, uid) = match self {
            BroadcastEvent::IndexChanged(value) => return value.to_json(),
            BroadcastEvent::UserConnected(uid) => ("USER_CONNECTED", uid),
            BroadcastEvent::UserDisconnected(uid) => ("USER_DISCONNECTED", uid),
            BroadcastEvent::ClientRegistration(uid, pin_code) => {
                return serde_json::json!({
                    "type": "CLIENT_ID",
                    "payload": format!("{uid};{pin_code}")
                })
                .to_string();
            }
            BroadcastEvent::P2PRequest(uid) => ("P2P_REQUEST", uid),
            BroadcastEvent::P2PRejected(uid) => ("P2P_REJECTED", uid),
            BroadcastEvent::P2PCanceled(uid) => ("P2P_CANCELED", uid),
            BroadcastEvent::P2PExchange(value) => return value.to_json(),
            BroadcastEvent::P2PSignaling(value) => {
                return serde_json::json!({
                    "type": "P2P_SIGNALING",
                    "payload": value
                })
                .to_string();
            }
            BroadcastEvent::P2PDowngrade(value) => {
                return serde_json::json!({
                    "type": "P2P_DOWNGRADE",
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
