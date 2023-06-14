use crate::config::state::AppState;
use crate::services;
use axum::{
    routing::{delete, get, head, post},
    Router,
};

pub fn routes() -> Router<AppState> {
    let static_files_service = tower_http::services::ServeDir::new(std::path::Path::new("public"))
        .append_index_html_on_directories(true);
    Router::new()
        .route("/api", get(services::list))
        .route("/api/beacon", post(services::beacon))
        .route(
            "/api/upload",
            post(services::upload).layer(axum::extract::DefaultBodyLimit::max(4 * 1024 * 1024)),
        )
        .route("/api/upload-part/", post(services::upload_part))
        .route(
            "/api/upload-part/:uuid",
            post(services::upload_part).layer(axum::extract::DefaultBodyLimit::max(1024 * 1024)),
        )
        .route("/api/upload-preflight", head(services::upload_preflight))
        .route("/api/notify", get(services::update_notify))
        .route("/api/:uuid", delete(services::delete))
        .route("/api/:uuid/metadata", get(services::get_metadata))
        .route("/api/:uuid", get(services::get))
        .fallback_service(static_files_service)
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers([
                    "CONTENT-TYPE".parse().unwrap(),
                    "ACCESS-TOKEN".parse().unwrap(),
                    "X-CONTENT-SHA256".parse().unwrap(),
                    "X-RAW-FILENAME".parse().unwrap(),
                ]),
        )
}
