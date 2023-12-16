use crate::services;
use crate::state::AppState;
use axum::{
    middleware,
    routing::{delete, get, head, post, put},
    Router,
};

pub fn build() -> Router<AppState> {
    let static_files_service = tower_http::services::ServeDir::new(std::path::Path::new("public"))
        .append_index_html_on_directories(true)
        .fallback(tower_http::services::ServeFile::new("public/index.html"));
    Router::new()
        .route("/api/beacon", post(services::beacon))
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
        .route("/api/notify", get(services::update_notify))
        .route("/api/stats", get(services::stats))
        .route("/api/clean-dump", get(services::clean_dump))
        .route("/api/file/:uuid", delete(services::delete))
        .route("/api/file/:uuid", get(services::get))
        .route("/api/:uuid", get(services::get_metadata))
        .route("/api", get(services::list))
        .layer(middleware::from_extractor::<services::authorize::Claims>())
        .fallback_service(static_files_service)
        .layer(tower_http::trace::TraceLayer::new_for_http())
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
