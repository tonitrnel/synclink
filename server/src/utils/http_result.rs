use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};

#[allow(unused)]
#[derive(thiserror::Error, Debug)]
pub enum HttpException {
    #[error("Bad Request")]
    BadRequest,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,

    #[error("Not Found")]
    NotFound,

    #[error("Range Not Satisfiable")]
    RangeNotSatisfiable,

    #[error("Internal Server Error")]
    InternalError,
}

pub struct HttpError {
    pub error: Option<anyhow::Error>,
    pub exception: HttpException,
    pub custom_message: Option<String>,
}

impl HttpError {
    pub fn get_msg(self) -> String {
        if let Some(message) = self.custom_message {
            return message;
        }
        match self.error {
            Some(err) => err.to_string(),
            None => format!("{}", self.exception),
        }
    }
}

// 将 HttpError 转化为 Response
impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        if let Some(err) = &self.error {
            tracing::error!("{:?}", err);
        }
        match self.exception {
            HttpException::BadRequest => (StatusCode::BAD_REQUEST, self.get_msg()).into_response(),
            HttpException::Unauthorized => {
                (StatusCode::UNAUTHORIZED, self.get_msg()).into_response()
            }
            HttpException::Forbidden => (StatusCode::FORBIDDEN, self.get_msg()).into_response(),
            HttpException::NotFound => (StatusCode::NOT_FOUND, self.get_msg()).into_response(),
            HttpException::RangeNotSatisfiable => {
                (StatusCode::RANGE_NOT_SATISFIABLE, self.get_msg()).into_response()
            }
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.get_msg()).into_response(),
        }
    }
}

// 将 anyhow::Error 转换为 HttpErrorWrapper
impl From<anyhow::Error> for HttpError {
    fn from(err: anyhow::Error) -> Self {
        Self {
            error: Some(err),
            exception: HttpException::InternalError,
            custom_message: Some("Something went wrong".to_string()),
        }
    }
}

// 将 Error 转换为 HttpErrorWrapper
impl From<HttpException> for HttpError {
    fn from(exception: HttpException) -> Self {
        Self {
            error: None,
            exception,
            custom_message: None,
        }
    }
}

// 将 () 转换为 HttpErrorWrapper
impl From<()> for HttpError {
    fn from(_: ()) -> Self {
        Self {
            error: None,
            exception: HttpException::InternalError,
            custom_message: Some("An unexpected error has occurred".to_string()),
        }
    }
}

impl From<(HttpException, anyhow::Error)> for HttpError {
    fn from(value: (HttpException, anyhow::Error)) -> Self {
        Self {
            error: Some(value.1),
            exception: value.0,
            custom_message: None,
        }
    }
}

impl From<(HttpException, String)> for HttpError {
    fn from(value: (HttpException, String)) -> Self {
        Self {
            error: None,
            exception: value.0,
            custom_message: Some(value.1),
        }
    }
}

impl From<(HttpException, &str)> for HttpError {
    fn from(value: (HttpException, &str)) -> Self {
        Self {
            error: None,
            exception: value.0,
            custom_message: Some(value.1.to_string()),
        }
    }
}

pub struct HttpResult<T, E = HttpError>(pub Result<T, E>);

// 将 HttpResult 转换为 Response
impl<T> IntoResponse for HttpResult<T>
where
    T: IntoResponse,
{
    fn into_response(self) -> Response {
        match self.0 {
            Ok(val) => val.into_response(),
            Err(err) => err.into_response(),
        }
    }
}

// 将 Result<_, anyhow::Error> 转化为 HttpResult
impl<T, E> From<Result<T, E>> for HttpResult<T>
where
    T: IntoResponse,
    E: Into<HttpError>,
{
    fn from(value: Result<T, E>) -> Self {
        Self(value.map_err(|err| err.into()))
    }
}

#[macro_export]
macro_rules! throw_error {
    ($e:expr) => {
        return Err($e).into()
    };
    ($e:expr, $m:expr) => {
        return Err(($e, $m)).into()
    };
}

#[macro_export]
/// Evaluates the given expression, returning the value if it is `Ok`, or returning an `Err` by
/// early exiting the function and converting the error into a specified error type.
///
/// # Examples
///
/// ```rust
/// fn process_data() -> HttpResult<()> {
///     let result: anyhow::Result<i32, CustomError> = do_something();
///
///     let value: i32 = try_break_ok!(result);
///
///     // Continue processing `value` here
///
///     Ok(())
/// }
/// ```
///
/// This macro is useful for handling `anyhow::Result` types and breaking out of the current function
/// early if an error is encountered. It converts the error into the specified error type and
/// returns it using the `Err` variant.
macro_rules! try_break_ok {
    ($e:expr) => {
        match $e {
            Ok(val) => val,
            Err(err) => return Err(err).into(),
        }
    };
}
