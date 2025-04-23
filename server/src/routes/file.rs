use crate::common::ApiResult;
use crate::extractors::Header;
use crate::models::dtos::file::{
    FileCollectionQueryDto, FileHeaderDto, FileListQueryDto, FileQueryDto,
};
use crate::models::dtos::pagination::PaginationDto;
use crate::services::file::{GetArchiveEntryArgs, GetContentArgs, ListArgs, TotalArgs};
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::Method;
use axum::response::IntoResponse;
use uuid::Uuid;

/// 列出所有文件
pub async fn list(
    State(state): State<AppState>,
    Query(query): Query<FileListQueryDto>,
) -> ApiResult<impl IntoResponse> {
    let offset = query.page * query.per_page;
    let limit = query.per_page;
    let group = query
        .group
        .as_ref()
        .map(|it| it.split(",").map(|p| p.trim()).collect::<Vec<_>>())
        .unwrap_or_default();
    let data = state
        .file_service
        .list(
            None,
            ListArgs {
                offset,
                limit,
                after: query.after,
                before: query.before,
                group: &group,
            },
        )
        .await?;
    let total = state
        .file_service
        .total(
            None,
            TotalArgs {
                after: query.after,
                before: query.before,
                group: &group,
            },
        )
        .await?;
    Ok(Json(PaginationDto { data, total }))
}

/// 读取文件内容
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Header(header): Header<FileHeaderDto>,
    Query(query): Query<FileQueryDto>,
    method: Method,
) -> ApiResult<impl IntoResponse> {
    let response = state
        .file_service
        .get_content_by_id(
            id,
            GetContentArgs {
                r: header.range,
                m: method,
                q: query,
            },
        )
        .await?;
    Ok(response.into_response())
}

/// 获取文件元数据
pub async fn get_metadata(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<impl IntoResponse> {
    let metadata = state.file_service.get_by_id(id).await?;

    Ok(Json(metadata))
}

/// 删除文件
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<impl IntoResponse> {
    state.file_service.delete_by_id(id).await?;
    Ok(Json("ok!"))
}

/// 清理
// pub async fn clean_dump() {}

/// 对于文本文件可以合并输出
pub async fn get_text_collection(
    State(state): State<AppState>,
    Json(FileCollectionQueryDto { uuids }): Json<FileCollectionQueryDto>,
) -> ApiResult<impl IntoResponse> {
    let response = state.file_service.get_text_collection(uuids).await?;
    Ok(response.into_response())
}

/// 访问 tar 文件目录
pub async fn get_virtual_directory(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<impl IntoResponse> {
    let entries = state.file_service.get_archive_entries(id).await?;
    Ok(Json(entries))
}

/// 访问 tar 文件
pub async fn get_virtual_file(
    State(state): State<AppState>,
    Path((id, ph)): Path<(Uuid, String)>,
    Header(header): Header<FileHeaderDto>,
    Query(query): Query<FileQueryDto>,
    method: Method,
) -> ApiResult<impl IntoResponse> {
    let response = state
        .file_service
        .get_archive_entry(
            id,
            GetArchiveEntryArgs {
                ph,
                r: header.range,
                q: query,
                m: method,
            },
        )
        .await?;
    Ok(response.into_response())
}
