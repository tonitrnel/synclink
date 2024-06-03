use std::fmt::{Display, Formatter};
use std::future::Future;
use std::ops::Deref;
use std::pin::Pin;
use std::task::{Context, Poll};

use axum::body::Body;
use axum::http::Request;
use axum::response::Response;
use tower::{Layer, Service};
use uuid::Uuid;

#[derive(Debug, Clone, Copy)]
pub struct TraceId(Uuid);
impl Deref for TraceId {
    type Target = Uuid;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl Display for TraceId {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}
#[derive(Debug, Clone, Copy)]
pub struct TraceIdLayer {}

impl TraceIdLayer {
    pub fn new() -> Self {
        Self {}
    }
}
impl<S> Layer<S> for TraceIdLayer {
    type Service = TraceIdService<S>;
    fn layer(&self, inner: S) -> Self::Service {
        TraceIdService {
            inner,
            trace_id: TraceId(Uuid::new_v4()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TraceIdService<S> {
    inner: S,
    trace_id: TraceId,
}

impl<S> Service<Request<Body>> for TraceIdService<S>
where
    S: Service<Request<Body>, Response = Response<Body>>,
    S::Future: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }
    fn call(&mut self, mut req: Request<Body>) -> Self::Future {
        req.extensions_mut().insert(self.trace_id);
        let fut = self.inner.call(req);
        let trace_id = self.trace_id.to_string();
        let inner = async move {
            let res: Result<Self::Response, Self::Error> = fut.await;
            res.map(|mut it| {
                it.headers_mut()
                    .insert("x-request-id", trace_id.parse().unwrap());
                it
            })
        };
        Box::pin(inner)
    }
}
