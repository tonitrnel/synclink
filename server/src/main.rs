use config::state;
use std::net::ToSocketAddrs;
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, Layer};

mod config;
mod errors;
mod models;
mod routes;
mod services;
mod utils;

#[tokio::main]
async fn main() {
    let config = config::load().unwrap();
    let config::ServerConfig { port, host } = config.server.clone();
    let config::LogConfig { level } = config.log.clone();
    let (tx, _) = tokio::sync::broadcast::channel(8);
    // Initialize logger tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_filter(tracing_subscriber::filter::LevelFilter::from_level(level))
                .with_filter(tracing_subscriber::filter::filter_fn(|metadata| {
                    metadata.target().starts_with("synclink")
                })),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .compact()
                .with_file(false)
                .with_target(false)
                .with_filter(tracing_subscriber::filter::filter_fn(|metadata| {
                    metadata.target().starts_with("tower_http")
                })),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .compact()
                .with_filter(tracing_subscriber::filter::LevelFilter::INFO)
                .with_filter(tracing_subscriber::filter::filter_fn(|metadata| {
                    !metadata.target().starts_with("synclink")
                })),
        )
        .with(tracing_error::ErrorLayer::default())
        .init();
    let bucket = Arc::new(models::Bucket::connect(config.read_storage_dir()).await);
    let config = Arc::new(config);
    let state = state::AppState {
        bucket,
        config,
        broadcast: tx,
    };
    let app = routes::routes();
    let addr = format!("{}:{}", host, port)
        .to_socket_addrs()
        .map(|mut it| it.next().unwrap())
        .unwrap();
    let server = axum::Server::bind(&addr)
        .serve(app.with_state(state).into_make_service())
        .with_graceful_shutdown(shutdown_signal());

    tracing::info!("Listening on http://{}", addr);
    server.await.unwrap();
}

async fn shutdown_signal() {
    use tokio::signal;
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Error: Install Ctrl+C handler failed")
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Error: Install signal handler failed")
            .recv()
            .await
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {
            println!("Shutdown...");
            std::process::exit(0);
        },
        _ = terminate => {},
    }
}
