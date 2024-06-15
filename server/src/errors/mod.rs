pub mod error_kind;
pub mod internal_error;

pub use error_kind::ErrorKind;
pub use internal_error::InternalError;

pub type ApiResponse<T> = Result<T, ErrorKind>;
