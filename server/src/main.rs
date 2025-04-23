mod common;
mod config;
mod extractors;
mod logging;
mod middlewares;
mod models;
mod routes;
mod server;
mod services;
mod state;
mod utils;
mod macros;

use crate::logging::{registry_logs, LogWriter};
use crate::server::ServerArgs;
use std::net::ToSocketAddrs;
use std::sync::Arc;

fn print_banner() {
    tracing::info!("");
    tracing::info!(r#"  ______         _                                        "#);
    tracing::info!(r#" |  ____|       | |                                       "#);
    tracing::info!(r#" | |__    _ __  | |__    ___  _ __ ___    ___  _ __  __ _ "#);
    tracing::info!(r#" |  __|  | '_ \ | '_ \  / _ \| '_ ` _ \  / _ \| '__|/ _` |"#);
    tracing::info!(r#" | |____ | |_) || | | ||  __/| | | | | ||  __/| |  | (_| |"#);
    tracing::info!(r#" |______|| .__/ |_| |_| \___||_| |_| |_| \___||_|   \__,_|"#);
    tracing::info!(r#"         | |                                              "#);
    tracing::info!(r#"         |_|                                              "#);
    tracing::info!("");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    #[cfg(target_os = "linux")]
    let _pid = utils::pidfile::Pidfile::new()?;
    let config = &config::CONFIG;
    let (mut log_writer, log_handle) = LogWriter::new()?;
    let listener = {
        // Initialize logger tracing
        registry_logs(
            &mut log_writer,
            config.logs.level.to_owned(),
            config.logs.parse_dir().unwrap(),
        )?;
        let addr = format!("{}:{}", config.server.host, config.server.port)
            .to_socket_addrs()
            .map(|mut it| it.next().unwrap())?;
        tokio::net::TcpListener::bind(addr).await?
    };
    print_banner();
    #[cfg(all(not(debug_assertions), target_os = "linux"))]
    tracing::info!(
        "Ephemera {version} ({commit_id} {build_date}) built with docker{docker_version}, {system_version}, rustc{rustc_version}",
        build_date = env!("BUILD_DATE"),
        version = env!("CARGO_PKG_VERSION"),
        commit_id = env!("COMMIT_ID"),
        docker_version = env!("DOCKER_VERSION"),
        rustc_version = env!("RUSTC_VERSION"),
        system_version = env!("SYSTEM_VERSION"),
    );
    tracing::info!("listening on http://{}", listener.local_addr()?);
    match server::run_until_done(
        ServerArgs {
            config,
            logs: Arc::new(log_writer),
        },
        listener,
    )
    .await
    {
        Ok(()) => {
            println!("Ephemera stopping...")
        }
        Err(err) => {
            eprintln!("Ephemera has encountered an error: {}", err);
            return Err(err);
        }
    }
    match log_handle.await {
        Ok(result) => result?,
        Err(err) if err.is_panic() => {
            panic!("{}", err)
        }
        _ => (),
    };
    Ok(())
}
