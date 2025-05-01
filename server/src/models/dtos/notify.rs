use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct NotifyHeaderDto {
    pub user_agent: String,
    pub cookie: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct SseClientResponseDto {
    pub id: Uuid,
    pub ip_alias: Option<String>,
    pub user_agent: String,
    pub active: bool,
}