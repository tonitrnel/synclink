use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::fmt::{Display, Formatter};
use uuid::Uuid;

#[derive(Debug)]
#[allow(unused)]
pub enum ApiError {
    HeaderFieldMissing(String),

    RangeTooLarge,
    RangeNotSupported,
    InvalidRange,
    RangeNotFound,

    ResourceNotFound,
    HashMismatch,
    DuplicateFile(Uuid),
    // 通用错误
    BadRequest(anyhow::Error),
    Unauthorized,
    Forbidden,
    Internal(anyhow::Error),
}

impl Display for ApiError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::HeaderFieldMissing(field) => {
                write!(f, "Required header field '{field}' is missing.")
            }
            ApiError::RangeTooLarge => f.write_str("The specified range is too large."),
            ApiError::RangeNotSupported => f.write_str("Range requests are not supported."),
            ApiError::InvalidRange => f.write_str("The specified range is invalid."),
            ApiError::RangeNotFound => f.write_str("The specified range does not exist."),
            ApiError::ResourceNotFound => f.write_str("The requested resource could not be found."),
            ApiError::HashMismatch => {
                f.write_str("The provided hash does not match the expected hash.")
            }
            ApiError::Unauthorized => f.write_str("Access denied: unauthorized."),
            ApiError::Forbidden => f.write_str("Access forbidden: insufficient permissions."),
            ApiError::DuplicateFile(uid) => {
                write!(f, "Rejected: file with UID '{uid}' already exists. ")
            }
            ApiError::Internal(_) => {
                write!(f, "An internal error occurred. Please try again later.")
            }
            ApiError::BadRequest(error) => {
                write!(f, "{error}")
            }
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let message = self.to_string();
        tracing::error!("{}", message);
        let status = match &self {
            ApiError::HeaderFieldMissing(_) | ApiError::HashMismatch => StatusCode::BAD_REQUEST,
            ApiError::RangeTooLarge
            | ApiError::RangeNotFound
            | ApiError::RangeNotSupported
            | ApiError::InvalidRange => StatusCode::RANGE_NOT_SATISFIABLE,

            ApiError::DuplicateFile(_) => StatusCode::CONFLICT,

            ApiError::Forbidden => StatusCode::FORBIDDEN,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,

            ApiError::Internal(err) => {
                tracing::error!("{:?}", self);
                err.chain()
                    .skip(1)
                    .for_each(|cause| tracing::error!("Because: {}", cause));
                StatusCode::INTERNAL_SERVER_ERROR
            }
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::ResourceNotFound => StatusCode::NOT_FOUND,
        };

        (status, message).into_response()
    }
}

impl<E> From<E> for ApiError
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self::Internal(value.into())
    }
}
