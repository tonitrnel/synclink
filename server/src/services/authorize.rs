use sqlx::SqlitePool;
use uuid::Uuid;
use crate::extractors::claims::issue;

pub struct AuthorizeService{
    pool: SqlitePool
}

impl AuthorizeService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
    pub fn issue(user_id: Uuid) -> anyhow::Result<String>{
        let (_id, token) = issue(user_id, 1814400)?; // 21 days
        Ok(token)
    }
}