mod auth;
mod file;
mod p2p;
mod sse;
mod system;
mod upload;

use crate::middlewares::trace_id::{TraceId, TraceIdLayer};
use crate::state::AppState;
use axum::body::Body;
use axum::http::Request;
use axum::response::Response;
use axum::{
    Router,
    routing::{delete, get, head, post, put},
};
use std::time::Duration;
use tracing::Span;

pub fn build() -> Router<AppState> {
    let static_files_service = tower_http::services::ServeDir::new(std::path::Path::new("public"))
        .append_index_html_on_directories(true)
        .fallback(tower_http::services::ServeFile::new("public/index.html"));
    Router::new()
        .route("/api/health", get(|| async { axum::http::StatusCode::OK }))
        .route(
            "/api/version",
            get(|| async { format!("ephemera_{}", env!("CARGO_PKG_VERSION")) }),
        )
        // .route("/api/beacon", post(services::beacon))
        // .route("/api/log-tracing", post(services::log_tracing))
        // ======== upload ========
        .route("/api/upload", post(upload::upload))
        .route(
            "/api/upload/multipart/start-session",
            post(upload::multipart::start_session),
        )
        .route(
            "/api/upload/multipart/concatenate",
            post(upload::multipart::finalize),
        )
        .route(
            "/api/upload/multipart/cancel",
            delete(upload::multipart::cancel),
        )
        .route(
            "/api/upload/multipart/{uuid}",
            put(upload::multipart::append_part),
        )
        .route("/api/upload/preflight", head(upload::preflight))
        .route("/api/notify", get(sse::notify))
        .route("/api/sse/connections", get(sse::connections))
        .route("/api/stats", get(system::stats))
        // .route("/api/clean-dump", get(services::clean_dump))
        // ======== file ========
        .route("/api/file/text-collection", post(file::get_text_collection))
        .route("/api/file/list", get(file::list))
        .route("/api/file/{uuid}/metadata", get(file::get_metadata))
        .route("/api/file/{uuid}", delete(file::delete))
        .route("/api/file/{uuid}", get(file::get))
        .route("/api/directory/{uuid}", get(file::get_virtual_directory))
        .route("/api/directory/{uuid}/{*path}", get(file::get_virtual_file))
        // ======== p2p ========
        .route("/api/p2p/create", post(p2p::create_request))
        .route("/api/p2p/accept", post(p2p::accept_request))
        .route("/api/p2p/discard", delete(p2p::discard_request))
        .route("/api/p2p/signaling", post(p2p::signaling))
        .route("/api/p2p/relay", get(p2p::relay))
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
                    axum::http::header::AUTHORIZATION,
                ]),
        )
}
