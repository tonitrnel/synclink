use crate::errors::ErrorKind;
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderName, HeaderValue};
use std::convert::Infallible;

pub struct Headers {
    inner: HeaderMap,
}

impl Headers {
    pub fn get(&self, name: &str) -> HeaderValueTransformer {
        HeaderValueTransformer {
            name: name.to_string(),
            value: self.inner.get(name),
        }
    }
}
#[allow(unused)]
trait FromHeaderName {
    fn get(&self, name: HeaderName) -> HeaderValueTransformer;
}

impl FromHeaderName for Headers {
    fn get(&self, name: HeaderName) -> HeaderValueTransformer {
        HeaderValueTransformer {
            name: name.to_string(),
            value: self.inner.get(&name),
        }
    }
}

pub struct HeaderValueTransformer<'a> {
    name: String,
    value: Option<&'a HeaderValue>,
}

impl<'a> HeaderValueTransformer<'a> {
    pub fn try_as_string(&self) -> Result<String, ErrorKind> {
        self.value
            .and_then(|it| it.to_str().ok())
            .map(|it| it.to_string())
            .ok_or(ErrorKind::HeaderFieldMissing(self.name.to_string()))
    }
    pub fn try_as_u64(&self) -> Result<u64, ErrorKind> {
        self.value
            .and_then(|it| it.to_str().ok())
            .and_then(|it| it.parse::<u64>().ok())
            .ok_or(ErrorKind::HeaderFieldMissing(self.name.to_string()))
    }

    #[allow(unused)]
    pub fn try_as_f64(&self) -> Result<f64, ErrorKind> {
        self.value
            .and_then(|it| it.to_str().ok())
            .and_then(|it| it.parse::<f64>().ok())
            .ok_or(ErrorKind::HeaderFieldMissing(self.name.to_string()))
    }

    #[allow(unused)]
    pub fn try_as_i64(&self) -> Result<i64, ErrorKind> {
        self.value
            .and_then(|it| it.to_str().ok())
            .and_then(|it| it.parse::<i64>().ok())
            .ok_or(ErrorKind::HeaderFieldMissing(self.name.to_string()))
    }
}

#[async_trait]
impl<S> FromRequestParts<S> for Headers {
    type Rejection = Infallible;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(Self {
            inner: parts.headers.clone(),
        })
    }
}
