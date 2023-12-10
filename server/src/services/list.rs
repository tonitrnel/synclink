use crate::errors::ApiResponse;
use crate::state::AppState;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct QueryParams {
    after: Option<i64>,
    before: Option<i64>,
    page: Option<u32>,
    per_page: Option<u32>,
    fields: Option<String>,
}

impl QueryParams {
    fn per_page(&self) -> usize {
        self.per_page.unwrap_or(10) as usize
    }
    fn page(&self) -> usize {
        self.page.unwrap_or(1).max(1) as usize
    }
    fn fields(&self) -> HashSet<String> {
        self.fields
            .as_ref()
            .map(|it| {
                it.split(',')
                    .map(|field| field.trim().to_string())
                    .collect::<HashSet<_>>()
            })
            .unwrap_or_default()
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResponseDto {
    uid: Uuid,
    created: i64,
    name: String,
    size: u64,
    r#type: String,
    ext: Option<String>,
    user_agent: Option<String>,
    host: Option<String>,
}

impl ResponseDto {
    fn into_value(self) -> serde_json::Value {
        serde_json::json!(self)
    }
    fn into_hashmap(self) -> HashMap<String, serde_json::Value> {
        let mut map: HashMap<String, serde_json::Value> = HashMap::new();
        map.insert(
            "uid".to_string(),
            serde_json::Value::String(self.uid.to_string()),
        );
        map.insert(
            "created".to_string(),
            serde_json::Value::Number(self.created.into()),
        );
        map.insert("name".to_string(), serde_json::Value::String(self.name));
        map.insert(
            "size".to_string(),
            serde_json::Value::Number(self.size.into()),
        );
        map.insert(
            "type".to_string(),
            serde_json::Value::String(self.r#type.to_string()),
        );
        if let Some(ext) = self.ext {
            map.insert("ext".to_string(), serde_json::Value::String(ext));
        }
        if let Some(user_agent) = self.user_agent {
            map.insert(
                "user_agent".to_string(),
                serde_json::Value::String(user_agent),
            );
        }
        map
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PaginationDto<T>
where
    T: Serialize,
{
    total: usize,
    data: Vec<T>,
}

pub async fn list(
    State(state): State<AppState>,
    query: Query<QueryParams>,
) -> ApiResponse<Json<PaginationDto<serde_json::Value>>> {
    let per_page = query.per_page();
    let page = query.page();
    let fields = query.fields();
    let mut total = 0usize;
    let items = state.indexing.map_clone(|items| {
        total = items.len();
        let sorted_indexes = {
            let mut indexes = (0..total).collect::<Vec<_>>();
            indexes.sort_unstable_by(|&a, &b| items[b].get_created().cmp(items[a].get_created()));
            indexes
        };
        sorted_indexes
            .into_iter()
            .filter(|&idx| {
                let it = &items[idx];
                let created = *it.get_created();
                (query.before.map_or(true, |before| created < before))
                    && (query.after.map_or(true, |after| created > after))
            })
            .skip(page * per_page - per_page)
            .take(per_page)
            .map(|idx| {
                let it = &items[idx];
                ResponseDto {
                    uid: *it.get_uid(),
                    created: *it.get_created(),
                    name: it.get_name().to_string(),
                    size: *it.get_size(),
                    r#type: it.get_type().to_string(),
                    ext: it.get_extension().to_owned(),
                    user_agent: it.get_user_agent().to_owned(),
                    host: it.get_host().to_owned(),
                }
            })
            .collect::<Vec<_>>()
    });

    let data = if fields.is_empty() {
        items
            .into_iter()
            .map(|it| it.into_value())
            .collect::<Vec<_>>()
    } else {
        items
            .into_iter()
            .map(|it| {
                let mut map = it.into_hashmap();
                map.retain(|key, _| fields.contains(key));
                serde_json::to_value(map).unwrap()
            })
            .collect::<Vec<_>>()
    };
    Ok(Json(PaginationDto { total, data }))
}
