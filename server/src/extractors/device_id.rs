use crate::state::AppState;
use axum::extract::{FromRef, FromRequestParts};
use axum::http::header::{COOKIE, SET_COOKIE};
use axum::http::request::Parts;
use std::convert::Infallible;
use axum::http::HeaderValue;
use crate::models::Ulid;

#[derive(Clone, Debug)]
pub struct DeviceId(pub Option<Ulid>);

impl<S> FromRequestParts<S> for DeviceId
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let device_id = if let Some(device_id) = parts
            .headers
            .get(COOKIE)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split("; ").find(|part| part.starts_with("device_id=")))
            .and_then(|part| part.split_once('='))
            .and_then(|(_, value)| ulid::Ulid::from_string(value).ok())
        {
            Ulid::from(device_id)
        } else {
            return Ok(Self(None))
        };
        let state = AppState::from_ref(state);
        if state.device_service.exists(&device_id).await {
            Ok(Self(Some(device_id)))
        } else {
            parts.headers.insert(SET_COOKIE, HeaderValue::from_static("device_id=; Max-Age=0"));
            Ok(Self(None))
        }
    }
}
