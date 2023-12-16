use crate::config;
use crate::errors::ErrorKind;
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use std::sync::OnceLock;

pub struct Claims;

static SECRET: OnceLock<Option<&'static str>> = OnceLock::new();

fn load_secret() -> &'static Option<&'static str> {
    SECRET.get_or_init(|| {
        let config = config::load();
        config.authorize.as_ref().map(|it| it.secret.as_str())
    })
}

#[async_trait]
impl<S> FromRequestParts<S> for Claims
where
    S: Send,
{
    type Rejection = ErrorKind;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(secret) = load_secret() {
            let authorization = parts
                .headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .map(|it| it["Bearer ".len()..].trim_start().to_string())
                .unwrap_or_default();
            return if &authorization == secret {
                Ok(Self)
            } else {
                Err(ErrorKind::Unauthorized)
            };
        } else {
            Ok(Self)
        }
    }
}
