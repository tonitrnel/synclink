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

#[derive(Clone, Copy)]
struct Ports {
    #[allow(unused)]
    http: u16,
    https: u16,
}

#[tokio::main]
async fn main() {
    let config = config::load().unwrap();
    let config::ServerConfig { port, host } = config.server.clone();
    let config::LogConfig { level } = config.log.clone();
    let https_config = config.https.clone();
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
    match https_config {
        Some(https_config) => {
            let ports = Ports {
                http: port,
                https: https_config.port,
            };
            tokio::spawn(redirect_http_to_https(ports));
            let pem_config = axum_server::tls_rustls::RustlsConfig::from_pem_file(
                config::utils::read_path(&https_config.cert),
                config::utils::read_path(&https_config.key),
            )
            .await
            .unwrap();
            let server = axum_server::bind_rustls(
                format!("{}:{}", &host, &ports.https)
                    .to_socket_addrs()
                    .map(|mut it| it.next().unwrap())
                    .unwrap(),
                pem_config,
            )
            .serve(app.with_state(state).into_make_service());

            tracing::info!("Listening on https://{}:{}", host, ports.https);
            server.await.unwrap();
        }
        None => {
            let server = axum::Server::bind(
                &format!("{}:{}", host, port)
                    .to_socket_addrs()
                    .map(|mut it| it.next().unwrap())
                    .unwrap(),
            )
            .serve(app.with_state(state).into_make_service())
            .with_graceful_shutdown(shutdown_signal());

            tracing::info!("Listening on http://{}:{}", &host, &port);
            server.await.unwrap();
        }
    };
}

async fn redirect_http_to_https(ports: Ports) {
    use axum::handler::HandlerWithoutStateExt;

    fn make_https(
        host: String,
        uri: axum::http::Uri,
        ports: Ports,
    ) -> Result<axum::http::Uri, axum::BoxError> {
        let mut parts = uri.into_parts();

        parts.scheme = Some(axum::http::uri::Scheme::HTTPS);

        if parts.path_and_query.is_none() {
            parts.path_and_query = Some("/".parse().unwrap());
        }

        let https_host = host.replace(&ports.http.to_string(), &ports.https.to_string());
        parts.authority = Some(https_host.parse()?);

        Ok(axum::http::Uri::from_parts(parts)?)
    }

    let redirect = move |axum::extract::Host(host): axum::extract::Host, uri: axum::http::Uri| async move {
        match make_https(host, uri, ports) {
            Ok(uri) => Ok(axum::response::Redirect::permanent(&uri.to_string())),
            Err(error) => {
                tracing::warn!(%error, "failed to convert URI to HTTPS");
                Err(axum::http::StatusCode::BAD_REQUEST)
            }
        }
    };

    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], ports.http));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    tracing::debug!("listening on {}", listener.local_addr().unwrap());
    axum::Server::from_tcp(listener.into_std().unwrap())
        .unwrap()
        .serve(redirect.into_make_service());
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
