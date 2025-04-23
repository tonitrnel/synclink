use crate::models::{Timestamp, Ulid};
use uuid::Uuid;

pub struct Device {
    pub id: Ulid,
    pub fingerprint_hash: String,
    pub device_name: String,
    pub user_id: Option<Uuid>,
    pub created_at: Timestamp,
}
