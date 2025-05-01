use crate::common::ApiResult;
use crate::extractors::Header;
use crate::models::CursorPager;
use crate::models::dtos::file::{FileCollectionQueryDto, FileHeaderDto, FileQueryDto, FileRecordQueryDto, FileRecordResponseDto, PatchFileMetadataBodyDto};
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
    Query(query): Query<FileRecordQueryDto>,
) -> ApiResult<impl IntoResponse> {
    let pagination = CursorPager {
        first: query.first,
        last: query.last,
        after: query.after,
        before: query.before,
    };
    pagination.validate()?;
    let group = query
        .group
        .as_ref()
        .map(|it| it.split(",").map(|p| p.trim()).collect::<Vec<_>>())
        .unwrap_or_default();
    let with_total = query.with_total.unwrap_or(false);
    let (entries, has_prev, has_next) = state
        .file_service
        .list(
            None,
            ListArgs {
                pager: &pagination,
                group: &group,
            },
        )
        .await?;
    let total = if with_total {
        Some(state
            .file_service
            .total(None, TotalArgs { group: &group })
            .await?)
    } else { 
        None
    };
    Ok(Json(PaginationDto {
        data: entries
            .into_iter()
            .map(|it| FileRecordResponseDto::from(it))
            .collect::<Vec<_>>(),
        has_prev,
        has_next,
        total,
    }))
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
                range: header.range,
                method,
                raw: query.raw.is_some(),
                thumbnail_prefer: query.thumbnail_prefer.is_some()
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
    let entry = state.file_service.get_by_id(id).await?;

    Ok(Json(FileRecordResponseDto::from(entry)))
}

/// 更新文件元数据，适用于服务端没有元数据的情况
pub async fn patch_metadata(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<PatchFileMetadataBodyDto>,
)-> ApiResult<impl IntoResponse>{
    match body { 
        PatchFileMetadataBodyDto::Image(metadata) => {
            state.file_service.update_image_metadata(id, metadata).await?;
        }
    }
    Ok(Json("ok!"))
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
                path_or_hash: ph,
                range: header.range,
                raw: query.raw.is_some(),
                method,
            },
        )
        .await?;
    Ok(response.into_response())
}
