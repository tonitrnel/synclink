use crate::common::{ApiError, ApiResult};
use crate::config;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::{async_trait, Json};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    exp: usize,
}
static SECRET: OnceLock<Option<&'static str>> = OnceLock::new();
static KEYS: OnceLock<Option<Keys>> = OnceLock::new();

fn load_secret() -> &'static Option<&'static str> {
    SECRET.get_or_init(|| {
        let config = config::load();
        config.authorize.as_ref().map(|it| it.secret.as_str())
    })
}
fn load_keys() -> &'static Option<Keys> {
    KEYS.get_or_init(|| load_secret().map(|it| Keys::new(it.as_bytes())))
}

struct Keys {
    encoding: EncodingKey,
    decoding: DecodingKey,
}
impl Keys {
    fn new(secret: &[u8]) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
        }
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for Claims
where
    S: Send,
{
    type Rejection = ApiError;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(keys) = load_keys() {
            let authorization = parts
                .headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .map(|it| it["Bearer ".len()..].trim_start().to_string())
                .unwrap_or_default();
            let claims =
                match decode::<Claims>(&authorization, &keys.decoding, &Validation::default()) {
                    Ok(data) => data.claims,
                    Err(_err) => return Err(ApiError::Unauthorized),
                };
            return Ok(claims);
        } else {
            Ok(Claims { exp: 0 })
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct AuthPayloadDto {
    secret: String,
}
#[derive(Debug, Serialize)]
pub struct AuthBodyDto {
    access_token: String,
    token_type: String,
}
pub async fn authorize(Json(payload): Json<AuthPayloadDto>) -> ApiResult<Json<AuthBodyDto>> {
    let secret = match load_secret() {
        Some(secret) => *secret,
        None => return Err(ApiError::BadRequest(anyhow::format_err!("Bad Request"))),
    };
    if safeq(secret, &payload.secret) {
        return Err(ApiError::BadRequest(anyhow::format_err!("Bad Request")));
    }
    let now = chrono::Utc::now();
    let claims = Claims {
        exp: now.timestamp() as usize,
    };
    let keys = load_keys().as_ref().unwrap();
    let token = encode(&Header::default(), &claims, &keys.encoding)?;
    Ok(Json(AuthBodyDto {
        access_token: token,
        token_type: "Bearer".to_string(),
    }))
}

fn safeq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut equal: u8 = 0;
    for i in 0..a.len() {
        equal |= a[i] ^ b[i];
    }
    equal == 0
}
