use crate::common::{ApiResult, AppError};
use crate::extractors::{ClientIp, DeviceId, Header};
use crate::models::dtos::upload::{PreflightQueryDto, UploadHeaderDto, UploadQueryDto};
use crate::services::upload::UploadArgs;
use crate::state::AppState;
use crate::utils::decode_uri;
use axum::extract::{Query, Request, State};
use axum::http::{header, StatusCode};
use axum::response::{AppendHeaders, IntoResponse};
use axum::Json;

/// 上传文件
pub async fn upload(
    State(state): State<AppState>,
    ClientIp(ipaddr): ClientIp,
    Query(query): Query<UploadQueryDto>,
    Header(header): Header<UploadHeaderDto>,
    DeviceId(device_id): DeviceId,
    request: Request,
) -> ApiResult<impl IntoResponse> {
    let tags = query
        .tags
        .as_ref()
        .map(|it| {
            it.split(',')
                .map(|it| it.trim().to_string())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let caption = query.caption.clone().unwrap_or_default();
    let length = header.content_length;
    let mimetype = header.content_type.clone();
    let hash = query.hash.map(|it| it.to_lowercase());
    let filename = query
        .filename
        .clone()
        .map(|it| decode_uri(&it).map_err(AppError::from))
        .transpose()?;
    let stream = request.into_body().into_data_stream();
    let uuid = state
        .upload_service
        .upload(
            stream,
            UploadArgs {
                user_id: None,
                device_id,
                hash,
                ipaddr,
                tags,
                caption,
                length,
                mimetype,
                filename,
            },
        )
        .await?;
    Ok((StatusCode::CREATED, Json(uuid)).into_response())
}

/// 分片上传相关接口
pub mod multipart {
    use crate::common::{ApiResult, AppError};
    use crate::extractors::{ClientIp, DeviceId};
    use crate::models::dtos::upload::{
        AppendPartQueryDto, FinalizeQueryDto, StartSessionQueryDto,
    };
    use crate::services::upload::UploadPartArgs;
    use crate::state::AppState;
    use crate::utils::decode_uri;
    use axum::extract::{Path, Query, Request, State};
    use axum::http::StatusCode;
    use axum::response::{AppendHeaders, IntoResponse};
    use axum::Json;
    use uuid::Uuid;

    /// 开启一个新的分片会话
    pub async fn start_session(
        State(state): State<AppState>,
        Query(query): Query<StartSessionQueryDto>,
    ) -> ApiResult<impl IntoResponse> {
        if let Some(hash) = query.hash.as_ref() {
            if let Some(uuid) = state.file_service.exists(hash).await? {
                return Ok((
                    StatusCode::CONFLICT,
                    AppendHeaders([("location", uuid.to_string())]),
                )
                    .into_response());
            };
        };
        let (id, start) = state
            .upload_service
            .allocate(None, query.hash, query.size)
            .await?;
        Ok((StatusCode::CREATED, format!("{id};{start}")).into_response())
    }

    /// 完成分片合并，生成最终文件
    pub async fn finalize(
        State(state): State<AppState>,
        Path(id): Path<Uuid>,
        Query(query): Query<FinalizeQueryDto>,
        ClientIp(ipaddr): ClientIp,
        DeviceId(device_id): DeviceId,
    ) -> ApiResult<impl IntoResponse> {
        let tags = query
            .tags
            .as_ref()
            .map(|it| {
                it.split(',')
                    .map(|it| it.trim().to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let caption = query.caption.clone().unwrap_or_default();
        let filename = query
            .filename
            .as_ref()
            .map(|it| decode_uri(it).map_err(AppError::from))
            .transpose()?;
        state
            .upload_service
            .concatenate(
                id,
                UploadPartArgs {
                    user_id: None,
                    device_id,
                    ipaddr,
                    tags,
                    caption,
                    mimetype: query.mimetype,
                    filename,
                },
            )
            .await?;
        Ok(Json("ok!"))
    }

    /// 添加一个分片
    pub async fn append_part(
        State(state): State<AppState>,
        Path(id): Path<Uuid>,
        Query(query): Query<AppendPartQueryDto>,
        request: Request,
    ) -> ApiResult<impl IntoResponse> {
        let stream = request.into_body().into_data_stream();
        state
            .upload_service
            .append(&id, stream, query.start)
            .await?;
        Ok(Json("ok!"))
    }

    /// 取消会话
    ///
    /// 这将终止上传，删除所有片段
    pub async fn cancel(
        State(state): State<AppState>,
        Path(id): Path<Uuid>,
    ) -> ApiResult<impl IntoResponse> {
        state.upload_service.abort(id).await?;
        Ok(Json("ok!"))
    }
}

/// 预检查
///
/// - 检查 HASH 是否存在
/// - 检查容量是否满足
pub async fn preflight(
    State(state): State<AppState>,
    Query(query): Query<PreflightQueryDto>,
) -> ApiResult<impl IntoResponse> {
    if let Some(hash) = query.hash.as_ref() {
        if let Some(uuid) = state.file_service.exists(hash).await? {
            return Ok((
                StatusCode::CONFLICT,
                AppendHeaders([(header::LOCATION, uuid.to_string())]),
            )
                .into_response());
        }
    }
    state.file_service.ensure_quota(None, query.size).await?;
    Ok(Json("ok!").into_response())
}
