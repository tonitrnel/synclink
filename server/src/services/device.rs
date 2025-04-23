use sqlx::SqlitePool;
use crate::models::Ulid;

pub struct DeviceService {
    pool: SqlitePool,
}

impl DeviceService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
    pub async fn exists(&self, id: &Ulid) -> bool {
        sqlx::query!("SELECT id FROM devices WHERE id = ?", id)
            .fetch_optional(&self.pool)
            .await
            .ok()
            .flatten()
            .is_some()
    }
}
