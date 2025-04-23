use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;
use crate::utils::{serialize_rfc3339, option_serialize_rfc3339};

#[derive(Debug, Clone, sqlx::Type, Serialize)]
pub enum UserRole{
    Normal = 0,
    Admin = 1,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct UserEntity {
    id: Uuid,
    username: String,
    #[serde(serialize_with = "option_serialize_rfc3339")]
    locked_until: Option<DateTime<Utc>>,
    #[serde(serialize_with = "option_serialize_rfc3339")]
    last_login: Option<DateTime<Utc>>,
    is_active: bool,
    storage_quota: i64,
    role: UserRole,
    #[serde(serialize_with = "serialize_rfc3339")]
    created_at: DateTime<Utc>,
    #[serde(serialize_with = "serialize_rfc3339")]
    updated_at: DateTime<Utc>,
}