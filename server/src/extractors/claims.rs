use std::convert::Infallible;
use crate::common::AppError;
use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::{DecodingKey, EncodingKey, Validation, decode, Algorithm, encode, Header};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    iss: String,
    sub: Uuid,
    exp: i64,
    jti: String,
}
static SECRET: LazyLock<&'static str> = LazyLock::new(|| "If@b$#*LHv%*j2");
static KEYS: LazyLock<Keys> = LazyLock::new(|| Keys::new(SECRET.as_bytes()));

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

impl<S> FromRequestParts<S> for Claims
where
    S: Send + Sync,
{
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parse_claims(parts)?)
    }
}

fn parse_claims(parts: &Parts) -> Result<Claims, AppError> {
    let authorization = parts
        .headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(|it| it["Bearer ".len()..].trim_start().to_string())
        .ok_or(AppError::Unauthorized)?;
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&["ephemera"]);
    decode::<Claims>(&authorization, &KEYS.decoding, &validation)
        .map(|data| data.claims)
        .map_err(|_| AppError::Unauthorized)
}


pub struct UserId(Uuid);

impl<S> FromRequestParts<S> for UserId
where
    S: Send + Sync,
{
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(Self(parse_claims(parts)?.sub))
    }
}

pub struct OptionalUserId(Option<Uuid>);

impl<S> FromRequestParts<S> for OptionalUserId
where
    S: Send + Sync,
{
    type Rejection = Infallible;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(Self(parse_claims(parts).map(|claims| claims.sub).ok()))
    }
}

pub(crate) fn issue(user_id: Uuid, expire: i64) -> anyhow::Result<(ulid::Ulid, String)>{
    let now = chrono::Utc::now();
    let id = ulid::Ulid::new();
    let claims = Claims {
        iss: "ephemera".to_string(),
        sub: user_id,
        exp: now.timestamp() + expire,
        jti: id.to_string(),
    };
    let token = encode(&Header::default(), &claims, &KEYS.encoding)?;
    Ok((id, token))
}