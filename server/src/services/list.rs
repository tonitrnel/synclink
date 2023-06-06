use crate::config::state::AppState;
use crate::utils::HttpResult;
use axum::{
    debug_handler,
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct QueryParams {
    after: Option<i64>,
    before: Option<i64>,
}

#[derive(Serialize, Debug, Clone)]
pub struct BucketEntityDto {
    uid: Uuid,
    created: i64,
    name: String,
    size: u64,
    r#type: String,
    ext: Option<String>,
    user_agent: Option<String>
}

#[debug_handler]
pub async fn list(
    State(state): State<AppState>,
    query: Query<QueryParams>,
) -> HttpResult<Json<Vec<BucketEntityDto>>> {
    let query: QueryParams = query.0;
    let items = state.bucket.clone_inner();
    let mut items = if query.after.is_some() || query.before.is_some() {
        let before = query.before.unwrap_or(i64::MAX);
        let after = query.after.unwrap_or(i64::MIN);
        items
            .into_iter()
            .filter(|it| it.get_created().lt(&before) && it.get_created().gt(&after))
            .collect::<Vec<_>>()
    } else {
        items
    };
    items.sort_by_key(|it| -it.get_created());
    let result = items
        .into_iter()
        .map(|it| BucketEntityDto {
            uid: *it.get_uid(),
            created: *it.get_created(),
            name: it.get_name().to_string(),
            size: *it.get_size(),
            r#type: it.get_type().to_string(),
            ext: it.get_extension().to_owned(),
            user_agent: it.get_user_agent().to_owned(),
        })
        .collect::<Vec<_>>();
    Ok::<_, ()>(Json(result)).into()
}
