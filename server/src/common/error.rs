use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum AppError {
    // #[error("Missing required header: {0}")]
    // HeaderMissing(String),

    #[error("Range requests are not supported by this resource")]
    RangeNotSupported,
    #[error("Invalid range specified: {0}")]
    InvalidRange(String),
    #[error("Requested range not satisfiable")]
    RangeNotSatisfiable,
    #[error("Requested range is too large")]
    RangeTooLarge,

    #[error("Resource not found")]
    NotFound,

    #[error("ETag or hash mismatch")]
    ETagMismatch,

    #[error("Unauthorized")]
    Unauthorized,
    #[error("Forbidden")]
    Forbidden,

    #[error("Conflict: Resource already exists (UID: {0})")]
    Conflict(Uuid),

    #[error("Bad request: {0}")]
    BadRequest(anyhow::Error),

    #[error("Storage error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("Filesystem I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Formatting failed")]
    FormatError(#[from] std::fmt::Error),

    #[error("Request processing error: {0}")]
    RequestError(#[from] axum::Error),

    #[error("Disk quota exceeded or no space left on device")]
    // 这个错误通常由应用逻辑产生：
    // 1. 在写入文件时，将特定的 std::io::Error (如 ErrorKind::StorageFull) 映射过来。
    // 2. 或者，在写入文件前进行磁盘空间预检查。
    DiskQuotaExceeded,
    #[error("User quota exceeded: current usage {0} bytes + new file {1} bytes > quota {2} bytes")]
    // 这个错误由应用逻辑产生，在尝试上传/写入文件前，检查用户的已用空间
    // 是否会超出其配额限制。
    UserQuotaExceeded(u64, u64, u64),

    #[error("Background task execution failed: {0}")]
    // JoinError 的 Display 实现会说明是 panic 还是 cancelled
    TaskJoinError(#[from] tokio::task::JoinError),

    #[error("Cannot complete upload: expected {0} bytes but received {1} bytes")]
    IncompleteUpload(u64, u64),

    #[error("Internal server error: {0}")]
    Internal(#[from] anyhow::Error),
}
impl AppError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            // AppError::HeaderMissing(_) => StatusCode::BAD_REQUEST,
            AppError::RangeNotSupported => StatusCode::NOT_IMPLEMENTED, // Or BAD_REQUEST depending on semantics
            AppError::InvalidRange(_) => StatusCode::BAD_REQUEST,
            AppError::RangeNotSatisfiable => StatusCode::RANGE_NOT_SATISFIABLE,
            AppError::RangeTooLarge => StatusCode::BAD_REQUEST, // Or perhaps REQUESTED_RANGE_NOT_SATISFIABLE
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::ETagMismatch => StatusCode::PRECONDITION_FAILED, // Often maps to 412
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::DiskQuotaExceeded => StatusCode::INSUFFICIENT_STORAGE,
            AppError::UserQuotaExceeded(_, _, _) => StatusCode::INSUFFICIENT_STORAGE,
            AppError::TaskJoinError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::IncompleteUpload(_, _) => StatusCode::PRECONDITION_FAILED,
            AppError::DatabaseError(sqlx_err) => {
                match sqlx_err {
                    // Explicitly map RowNotFound from sqlx to HTTP 404 Not Found
                    sqlx::Error::RowNotFound => StatusCode::NOT_FOUND,

                    // Map unique constraint violations to HTTP 409 Conflict
                    sqlx::Error::Database(db_err) if db_err.is_unique_violation() => {
                        StatusCode::CONFLICT
                    }

                    // Map foreign key violations to HTTP 400 Bad Request (or 409 Conflict)
                    sqlx::Error::Database(db_err) if db_err.is_foreign_key_violation() => {
                        // Often indicates a bad client request (e.g., referencing a non-existent entity)
                        StatusCode::BAD_REQUEST
                    }

                    // Map constraint violations in general (if not unique/foreign key or specific check needed)
                    sqlx::Error::Database(db_err) if db_err.is_check_violation() => {
                        StatusCode::BAD_REQUEST // Or Conflict (409)
                    }

                    // Pool errors might indicate service overload or temporary issues
                    sqlx::Error::PoolTimedOut | sqlx::Error::PoolClosed => {
                        StatusCode::SERVICE_UNAVAILABLE // 503
                    }

                    // Treat other database errors as internal server errors
                    _ => StatusCode::INTERNAL_SERVER_ERROR,
                }
            }
            AppError::IoError(io_err) => {
                match io_err.kind() {
                    // Map specific IO errors to appropriate HTTP statuses
                    std::io::ErrorKind::NotFound => StatusCode::NOT_FOUND, // File not found -> 404
                    std::io::ErrorKind::PermissionDenied => StatusCode::FORBIDDEN, // Permissions issue -> 403

                    // Optional: Map other kinds if they have clear semantic meaning in your API
                    // IoErrorKind::AlreadyExists => StatusCode::CONFLICT, // Trying to create existing file -> 409
                    // IoErrorKind::InvalidInput => StatusCode::BAD_REQUEST, // Bad data provided to fs operation -> 400

                    // Treat most other I/O errors (disk full, pipe errors, etc.) as internal
                    _ => StatusCode::INTERNAL_SERVER_ERROR, // 500
                }
            }
            AppError::RequestError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::FormatError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match &self {
            AppError::Internal(err) => {
                tracing::error!("Application error: {:?}", self);
                err.chain()
                    .skip(1)
                    .for_each(|cause| tracing::error!("Because: {}", cause));
            }
            _ => {
                tracing::error!("Application error: {:?}", self);
            }
        };
        let status = self.status_code();
        // 如果是服务器错误则返回标准原因而不是内部错误信息
        let body = if status.is_server_error() {
            status
                .canonical_reason()
                .unwrap_or(&self.to_string())
                .to_string()
        } else {
            self.to_string()
        };
        (self.status_code(), body).into_response()
    }
}
