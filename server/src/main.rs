mod common;
mod config;
mod extractors;
mod logs;
mod middlewares;
mod models;
mod pidfile;
mod routes;
mod server;
mod services;
mod state;
mod utils;

use crate::logs::registry_logs;
use crate::server::ServerArgs;
use std::net::ToSocketAddrs;
use std::sync::Arc;

fn print_banner() {
    tracing::info!("");
    tracing::info!(r#"       _____                       _  _         _     "#);
    tracing::info!(r#"      / ____|                     | |(_)       | |    "#);
    tracing::info!(r#"     | (___   _   _  _ __    ___  | | _  _ __  | | __ "#);
    tracing::info!(r#"      \___ \ | | | || '_ \  / __| | || || '_ \ | |/ / "#);
    tracing::info!(r#"      ____) || |_| || | | || (__  | || || | | ||   <  "#);
    tracing::info!(r#"     |_____/  \__, ||_| |_| \___| |_||_||_| |_||_|\_\ "#);
    tracing::info!(r#"               __/ |                                  "#);
    tracing::info!(r#"              |___/                                   "#);
    tracing::info!("");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    #[cfg(target_os = "linux")]
    let _pid = pidfile::Pidfile::new()?;
    let config = config::load();
    let (mut log_writer, log_handle) = logs::LogWriter::new()?;
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
    #[cfg(not(debug_assertions))]
    tracing::info!(
        "Synclink {version} ({commit_id} {build_date}) built with docker{docker_version}, {system_version}, rustc{rustc_version}",
        build_date = env!("BUILD_DATE"),
        version = env!("CARGO_PKG_VERSION"),
        commit_id = env!("COMMIT_ID"),
        docker_version = env!("DOCKER_VERSION"),
        rustc_version = env!("RUSTC_VERSION"),
        system_version = env!("SYSTEM_VERSION"),
    );
    tracing::info!("Listening on http://{}", listener.local_addr().unwrap());
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
            println!("Synclink stopping...")
        }
        Err(err) => {
            eprintln!("Synclink has encountered an error: {}", err);
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
