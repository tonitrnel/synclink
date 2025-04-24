use crate::common::AppError;
use crate::extractors::Header;
use crate::models::dtos::p2p::{P2PAcceptBodyDto, P2PCreateBodyDto, P2PDiscardBodyDto, P2PDowngradeBodyDto, SignalingBodyDto, SocketProxyHeaderDto};
use crate::state::AppState;
use axum::extract::{ConnectInfo, Json, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use std::net::SocketAddr;

/// 创建连接请求
pub async fn create_request(
    State(state): State<AppState>,
    Json(form): Json<P2PCreateBodyDto>,
) -> anyhow::Result<impl IntoResponse, AppError> {
    let request_id = state.p2p_service.create_request(form)?;
    Ok(Json(serde_json::json!({
        "request_id": request_id,
        "status": "pending"
    })))
}

/// 同意连接请求
pub async fn accept_request(
    State(state): State<AppState>,
    Json(form): Json<P2PAcceptBodyDto>,
) -> anyhow::Result<impl IntoResponse, AppError> {
    state.p2p_service.accept_request(form)?;
    Ok(Json(serde_json::json!({
        "status": "accepted"
    })))
}

/// 丢弃连接请求
pub async fn discard_request(
    State(state): State<AppState>,
    Json(form): Json<P2PDiscardBodyDto>,
) -> anyhow::Result<impl IntoResponse, AppError> {
    let is_primary = state.p2p_service.discard_request(form)?;
    let status = if is_primary { "canceled" } else { "rejected" };
    Ok(Json(serde_json::json!({
        "status": status
    })))
}

/// 上传当前设备的信令（用于 WebRTC 打洞）
pub async fn signaling(
    State(state): State<AppState>,
    Json(form): Json<SignalingBodyDto>,
) -> anyhow::Result<impl IntoResponse, AppError> {
    state.p2p_service.signaling(form)?;
    Ok(Json("ok!"))
}
pub async fn downgrade(
    State(state): State<AppState>,
    Json(form): Json<P2PDowngradeBodyDto>,
) -> anyhow::Result<impl IntoResponse, AppError> {
    state.p2p_service.downgrade(form)?;
    Ok(Json("ok!"))
}
/// 用于不支持 WebRTC 时使用服务充当代理
pub async fn relay(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Header(header): Header<SocketProxyHeaderDto>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    use tracing::Instrument;
    let user_agent = header.user_agent;

    ws.on_upgrade(move |socket| {
        // 创建一个 Span，带上 client_addr 和 user_agent 两个字段
        let span = tracing::info_span!(
            "relay_connection",
            client_addr = %addr,
            user_agent = %user_agent,
        );
        async move {
            // 进入连接
            tracing::info!("client connected");

            // 运行 relay 业务
            if let Err(err) = state.socket_service.relay(socket, addr).await {
                tracing::error!(%err, "relay handler failed");
            }

            // 离开连接
            tracing::info!("client disconnected");
        }
        .instrument(span) // 将 async block 包裹到 span 里
    })
}
