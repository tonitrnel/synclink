use axum::async_trait;
use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::request::Parts;
use std::convert::Infallible;
use std::net::SocketAddr;

#[derive(Clone, Debug)]
pub struct ClientIp(pub Option<String>);

#[async_trait]
impl<S> FromRequestParts<S> for ClientIp
where
    S: Send + Sync,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // 尝试从 x-forwarded-for 头部获取 IP
        if let Some(x_forwarded_for) = parts.headers.get("x-forwarded-for") {
            if let Ok(value) = x_forwarded_for.to_str() {
                return Ok(ClientIp(Some(
                    value
                        .split(',')
                        .next()
                        .unwrap_or_default()
                        .trim()
                        .to_string(),
                )));
            }
        }
        // 尝试从 x-real-ip 头部获取 IP
        if let Some(x_real_ip) = parts.headers.get("x-real-ip") {
            if let Ok(value) = x_real_ip.to_str() {
                return Ok(ClientIp(Some(value.to_string())));
            }
        }
        // 从连接信息获取 IP
        if let Ok(ConnectInfo(addr)) =
            ConnectInfo::<SocketAddr>::from_request_parts(parts, state).await
        {
            return Ok(ClientIp(Some(addr.ip().to_string())));
        }

        Ok(ClientIp(None))
    }
}
