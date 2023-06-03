use crate::config::state::AppState;
use crate::services;
use axum::{
    routing::{delete, get, post},
    Router,
};

pub fn routes() -> Router<AppState> {
    let static_files_service =
        tower_http::services::ServeDir::new(std::path::Path::new("../public"))
            .append_index_html_on_directories(true);
    Router::new()
        .route("/api", get(services::list_bucket))
        .route("/api/upload", post(services::add_bucket))
        .layer(axum::extract::DefaultBodyLimit::max(4 * 1024 * 1024 * 1024))
        .route("/api/notify", get(services::update_notify))
        .route("/api/:uuid", delete(services::delete_bucket))
        .route("/api/:uuid/metadata", get(services::get_bucket_metadata))
        .route("/api/:uuid", get(services::get_bucket))
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
