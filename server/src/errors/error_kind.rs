use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::fmt::{Display, Formatter};
use uuid::Uuid;

#[derive(Debug)]
#[allow(unused)]
pub enum ErrorKind {
    QueryFieldMissing(String),
    HeaderFieldMissing(String),
    BodyFieldMissing(String),
    PathParameterMissing,
    RangeTooLarge,
    RangeNotSupported,
    InvalidRange,
    RangeNotFound,
    ResourceNotFound,
    HashMismatch,
    Unauthorized,
    Forbidden,
    DuplicateFile(Uuid),
    Internal(anyhow::Error),
}

impl Display for ErrorKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorKind::QueryFieldMissing(field) => {
                write!(f, "Required query field '{field}' is missing.")
            }
            ErrorKind::HeaderFieldMissing(field) => {
                write!(f, "Required header field '{field}' is missing.")
            }
            ErrorKind::BodyFieldMissing(field) => {
                write!(f, "Required body field '{field}' is missing.")
            }
            ErrorKind::PathParameterMissing => f.write_str("A required path parameter is missing."),
            ErrorKind::RangeTooLarge => f.write_str("The specified range is too large."),
            ErrorKind::RangeNotSupported => f.write_str("Range requests are not supported."),
            ErrorKind::InvalidRange => f.write_str("The specified range is invalid."),
            ErrorKind::RangeNotFound => f.write_str("The specified range does not exist."),
            ErrorKind::ResourceNotFound => {
                f.write_str("The requested resource could not be found.")
            }
            ErrorKind::HashMismatch => {
                f.write_str("The provided hash does not match the expected hash.")
            }
            ErrorKind::Unauthorized => f.write_str("Access denied: unauthorized."),
            ErrorKind::Forbidden => f.write_str("Access forbidden: insufficient permissions."),
            ErrorKind::DuplicateFile(uid) => {
                write!(f, "Rejected: file with UID '{uid}' already exists. ")
            }
            ErrorKind::Internal(_) => {
                write!(f, "An internal error occurred. Please try again later.")
            }
        }
    }
}

impl IntoResponse for ErrorKind {
    fn into_response(self) -> Response {
        let message = self.to_string();
        tracing::error!("{:?}", self);
        let status = match &self {
            ErrorKind::QueryFieldMissing(_)
            | ErrorKind::HeaderFieldMissing(_)
            | ErrorKind::BodyFieldMissing(_)
            | ErrorKind::HashMismatch => StatusCode::BAD_REQUEST,

            ErrorKind::PathParameterMissing | ErrorKind::ResourceNotFound => StatusCode::NOT_FOUND,
            ErrorKind::RangeTooLarge
            | ErrorKind::RangeNotFound
            | ErrorKind::RangeNotSupported
            | ErrorKind::InvalidRange => StatusCode::RANGE_NOT_SATISFIABLE,

            ErrorKind::DuplicateFile(_) => StatusCode::CONFLICT,

            ErrorKind::Forbidden => StatusCode::FORBIDDEN,
            ErrorKind::Unauthorized => StatusCode::UNAUTHORIZED,

            ErrorKind::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status, message).into_response()
    }
}

impl<E> From<E> for ErrorKind
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self::Internal(value.into())
    }
}
