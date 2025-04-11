use crate::middlewares::trace_id::{TraceId, TraceIdLayer};
use crate::services;
use crate::state::AppState;
use axum::body::Body;
use axum::http::Request;
use axum::response::Response;
use axum::{
    middleware,
    routing::{delete, get, head, post, put},
    Router,
};
use std::time::Duration;
use tracing::Span;

pub fn build() -> Router<AppState> {
    let static_files_service = tower_http::services::ServeDir::new(std::path::Path::new("public"))
        .append_index_html_on_directories(true)
        .fallback(tower_http::services::ServeFile::new("public/index.html"));
    Router::new()
        .route("/api/health", get(|| async { axum::http::StatusCode::OK }))
        .route("/api/beacon", post(services::beacon))
        .route("/api/log-tracing", post(services::log_tracing))
        .route("/api/upload", post(services::upload))
        .route(
            "/api/upload-part/allocate",
            post(services::upload_part::allocate),
        )
        .route(
            "/api/upload-part/concatenate",
            post(services::upload_part::concatenate),
        )
        .route(
            "/api/upload-part/abort",
            delete(services::upload_part::abort),
        )
        .route("/api/upload-part/:uuid", put(services::upload_part::append))
        .route("/api/upload-preflight", head(services::upload_preflight))
        .route("/api/notify", get(services::notify))
        .route("/api/sse/connections", get(services::sse_connections))
        .route("/api/stats", get(services::stats))
        .route("/api/clean-dump", get(services::clean_dump))
        .route("/api/text-collection", post(services::get_text_collection))
        .route("/api/file/:uuid", delete(services::delete))
        .route("/api/file/:uuid", get(services::get))
        .route("/api/directory/:uuid", get(services::get_virtual_directory))
        .route(
            "/api/directory/:uuid/*path",
            get(services::get_virtual_file),
        )
        .route("/api/p2p/create", post(services::create_request))
        .route("/api/p2p/accept", post(services::accept_request))
        .route("/api/p2p/discard", delete(services::discard_request))
        .route("/api/p2p/signaling", post(services::signaling))
        .route("/api/p2p/socket", get(services::socket))
        .route("/api/authorize", post(services::authorize))
        .route("/api/:uuid", get(services::get_metadata))
        .route("/api", get(services::list))
        .layer(middleware::from_extractor::<services::Claims>())
        .fallback_service(static_files_service)
        .layer(
            tower_http::trace::TraceLayer::new_for_http()
                .make_span_with(|request: &Request<Body>| {
                    let trace_id = request.extensions().get::<TraceId>().unwrap();
                    tracing::debug_span!(
                        "request",
                        trace_id = %trace_id,
                    )
                })
                .on_request(|req: &Request<Body>, _span: &Span| {
                    tracing::trace!(
                        method = %req.method(),
                        uri = %req.uri(),
                        version = %format!("{:?}", req.version()),
                        "started processing request"
                    );
                })
                .on_response(|res: &Response, latency: Duration, _span: &Span| {
                    tracing::trace!(
                        status = ?res.status(),
                        latency = %format!("{}ms", latency.as_millis()),
                        "finished processing request"
                    );
                }),
        )
        .layer(TraceIdLayer::new())
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .expose_headers(tower_http::cors::Any)
                .allow_headers([
                    "CONTENT-TYPE".parse().unwrap(),
                    "ACCESS-TOKEN".parse().unwrap(),
                    "X-CONTENT-SHA256".parse().unwrap(),
                    "X-RAW-FILENAME".parse().unwrap(),
                ]),
        )
}
