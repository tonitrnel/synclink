pub mod error;
pub mod internal_error;

pub use error::AppError;
pub use internal_error::InternalError;

pub type ApiResult<T> = Result<T, AppError>;
