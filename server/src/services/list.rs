use crate::common::{ApiError, ApiResult};
use crate::models::entity::{Entity, EntityMetadata};
use crate::state::AppState;
use axum::extract::Path;
use axum::response::IntoResponse;
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct QueryParams {
    #[serde(default = "QueryParams::default_page")]
    page: u32,
    #[serde(default = "QueryParams::default_per_page")]
    per_page: u32,
    #[serde(default = "QueryParams::default_sort_by")]
    sort_by: String,
    #[serde(default = "QueryParams::default_order_by")]
    order_by: String,
    group_by: Option<String>,
    after: Option<i64>,
    before: Option<i64>,
    query: Option<String>,
}

impl QueryParams {
    fn default_page() -> u32 {
        1
    }
    fn default_per_page() -> u32 {
        10
    }
    fn default_order_by() -> String {
        "asc".to_string()
    }
    fn default_sort_by() -> String {
        "created".to_string()
    }
    fn keywords(&self) -> Option<Vec<String>> {
        self.query
            .as_ref()
            .map(|it| it.split(' ').map(|it| it.to_string()).collect::<Vec<_>>())
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
    ip: Option<String>,
    ip_alias: Option<String>,
    tags: Vec<String>,
    caption: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<EntityMetadata>,
}

impl ResponseDto {
    fn into_value(self) -> serde_json::Value {
        serde_json::json!(self)
    }
    fn from(entity: &Entity) -> Self {
        Self {
            uid: entity.get_uid().to_owned(),
            created: entity.get_created().to_owned(),
            name: entity.get_name().to_owned(),
            size: entity.get_size().to_owned(),
            r#type: entity.get_content_type().to_owned(),
            ext: entity.get_extension().to_owned(),
            ip: entity.get_ip().to_owned(),
            ip_alias: entity.get_ip_alias().cloned(),
            tags: entity.get_tags().to_vec(),
            caption: entity.get_caption().to_owned(),
            metadata: entity.get_metadata().to_owned(),
        }
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
) -> ApiResult<Json<PaginationDto<serde_json::Value>>> {
    let per_page = query.per_page as usize;
    let page = query.page as usize;
    let keywords = query.keywords();
    let (total, items) = state.indexing.map_clone(|items| {
        let sorted_indexes = {
            let mut indexes = (0..items.len()).collect::<Vec<_>>();
            indexes.sort_unstable_by(|&a, &b| {
                sorter((&items[a], &items[b]), &query.sort_by, &query.order_by)
            });
            indexes
        };
        let mut filters = Vec::<Box<dyn Fn(&Entity) -> bool>>::new();
        if let Some(keywords) = keywords {
            filters.push(Box::new(keywords_filter(keywords)))
        }
        if query.before.is_some() || query.after.is_some() {
            filters.push(Box::new(time_filter(&query.before, &query.after)));
        }
        if let Some(group_by) = &query.group_by {
            filters.push(Box::new(group_filter(group_by)))
        }
        let filtered_indexes = if !filters.is_empty() {
            sorted_indexes
                .into_iter()
                .filter(|idx| {
                    let entity = &items[*idx];
                    filters.iter().any(|filter| filter(entity))
                })
                .collect::<Vec<_>>()
        } else {
            sorted_indexes
        };
        (
            filtered_indexes.len(),
            filtered_indexes
                .into_iter()
                .skip(page * per_page - per_page)
                .take(per_page)
                .map(|idx| {
                    let it = &items[idx];
                    ResponseDto::from(it)
                })
                .collect::<Vec<_>>(),
        )
    });

    let data = items
        .into_iter()
        .map(|it| it.into_value())
        .collect::<Vec<_>>();
    Ok(Json(PaginationDto { total, data }))
}

fn time_filter<'a>(
    before: &'a Option<i64>,
    after: &'a Option<i64>,
) -> impl Fn(&'_ Entity) -> bool + 'a {
    return |entity| {
        let created = entity.get_created();
        (before.as_ref().map_or(true, |before| created < before))
            && (after.as_ref().map_or(true, |after| created > after))
    };
}

fn keywords_filter(keywords: Vec<String>) -> impl Fn(&'_ Entity) -> bool {
    return move |entity| {
        let name = entity.get_name();
        keywords.iter().any(|keyword| name.contains(keyword))
    };
}

#[allow(clippy::needless_lifetimes)]
fn group_filter<'a>(group_by: &'a str) -> impl Fn(&'_ Entity) -> bool + 'a {
    return move |entity| {
        let content_type = entity.get_content_type();
        let filename = entity.get_name();
        match group_by {
            "media" => {
                content_type.starts_with("video/")
                    || content_type.starts_with("audio/")
                    || content_type.starts_with("image/")
            }
            "document" => {
                filename.ends_with(".doc")
                    || filename.ends_with(".docx")
                    || filename.ends_with(".pdf")
                    || filename.ends_with(".txt")
                    || filename.ends_with(".odt")
                    || filename.ends_with(".rtf")
            }
            "image" => content_type.starts_with("image/"),
            "video" => content_type.starts_with("video/"),
            "audio" => content_type.starts_with("audio/"),
            "text" => content_type.starts_with("text/"),
            "application" => content_type.starts_with("application/"),
            "archives" => {
                filename.ends_with(".zip")
                    || filename.ends_with(".rar")
                    || filename.ends_with(".7z")
                    || filename.ends_with(".tar.gz")
                    || filename.ends_with(".tar.bz2")
            }
            _ => false,
        }
    };
}

#[allow(clippy::wildcard_in_or_patterns)]
fn sorter((a, b): (&Entity, &Entity), sort_by: &str, order_by: &str) -> std::cmp::Ordering {
    let mut ord = match sort_by {
        "size" => b.get_size().cmp(a.get_size()),
        "created" | _ => b.get_created().cmp(a.get_created()),
    };
    if order_by == "desc" {
        ord = ord.reverse()
    }
    ord
}

pub async fn get_metadata(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<impl IntoResponse> {
    if let Some(item) = &state.indexing.get(&id) {
        Ok(Json(ResponseDto::from(item)))
    } else {
        Err(ApiError::ResourceNotFound)
    }
}
