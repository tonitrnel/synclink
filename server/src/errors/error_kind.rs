use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use std::fmt::{Display, Formatter};

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
    Internal(anyhow::Error),
}

impl Display for ErrorKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorKind::QueryFieldMissing(field) => write!(f, "Query field missing: {field}"),
            ErrorKind::HeaderFieldMissing(field) => write!(f, "Header field missing: {field}"),
            ErrorKind::BodyFieldMissing(field) => write!(f, "Body field missing: {field}"),
            ErrorKind::PathParameterMissing => f.write_str("Path parameter missing"),
            ErrorKind::RangeTooLarge => f.write_str("Range too large"),
            ErrorKind::RangeNotSupported => f.write_str("Range not supported"),
            ErrorKind::InvalidRange => f.write_str("Invalid range"),
            ErrorKind::RangeNotFound => f.write_str("Range not found"),
            ErrorKind::ResourceNotFound => f.write_str("Resource not found"),
            ErrorKind::HashMismatch => f.write_str("Hash mismatch"),
            ErrorKind::Unauthorized => f.write_str("Unauthorized"),
            ErrorKind::Forbidden => f.write_str("Forbidden"),
            ErrorKind::Internal(err) => write!(f, "An internal error occurred: {err}"),
        }
    }
}

impl IntoResponse for ErrorKind {
    fn into_response(self) -> Response {
        let message = self.to_string();
        tracing::error!("{}", message);
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
