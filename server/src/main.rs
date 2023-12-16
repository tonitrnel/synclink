use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::Arc;

mod config;
mod errors;
mod extactors;
mod logs;
mod models;
mod routes;
mod services;
mod state;
mod utils;

#[tokio::main]
async fn main() {
    let config = config::load();
    // Initialize logger tracing
    let _guards = logs::logs_registry(
        config.logs.level.to_owned(),
        config.logs.parse_dir().unwrap(),
    )
    .unwrap();
    let addr = format!("{}:{}", config.server.host, config.server.port)
        .to_socket_addrs()
        .map(|mut it| it.next().unwrap())
        .unwrap();
    let (tx, _) = tokio::sync::broadcast::channel(8);

    let indexing = Arc::new(
        models::file_indexing::FileIndexing::new(config.file_storage.parse_dir().unwrap()).await,
    );
    let state = state::AppState {
        indexing,
        broadcast: tx,
    };
    let routes = routes::build().with_state(state);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::info!("Listening on http://{}", listener.local_addr().unwrap());
    axum::serve(
        listener,
        routes.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}
