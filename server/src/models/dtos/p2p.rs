use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct SocketProxyHeaderDto {
    pub user_agent: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "lowercase")]
pub enum ExchangeProtocol {
    WebRTC,
    WebSocket,
}
#[derive(Debug, Deserialize)]
pub struct P2PCreateBodyDto {
    pub client_id: Uuid,
    /// PIN 码
    pub code: String,
    /// 是否支持 webrtc
    pub supports_rtc: bool,
    /// 优先使用的协议
    pub priority: Option<ExchangeProtocol>,
}

#[derive(Debug, Deserialize)]
pub struct P2PAcceptBodyDto {
    pub request_id: Uuid,
    pub client_id: Uuid,
    pub supports_rtc: bool,
}

#[derive(Debug, Deserialize)]
pub struct P2PDiscardBodyDto {
    pub request_id: Uuid,
    pub client_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct SignalingBodyDto {
    pub request_id: Uuid,
    pub client_id: Uuid,
    pub payload: serde_json::Value,
}
