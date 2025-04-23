use crate::config::Config;
use crate::logging::LogWriter;
use crate::{routes, state};
use anyhow::Context;
use sqlx::migrate::Migrator;
use sqlx::sqlite;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tokio::{net::TcpListener, signal, task::JoinSet};
use tokio_util::sync::CancellationToken;

pub struct ServerArgs<'a> {
    pub logs: Arc<LogWriter>,
    pub config: &'a Config,
}

static MIGRATOR: Migrator = sqlx::migrate!();

async fn connect_database(dir: &PathBuf) -> anyhow::Result<sqlx::SqlitePool> {
    let path = dir.join("ephemera.db");
    if !path.exists() {
        std::fs::File::create(&path).with_context(|| {
            format!("Failed to create SQLite database file: {}", path.display())
        })?;
    }
    let database_url = format!(
        "sqlite:///{}?mode=rwc",
        path.to_str().unwrap().trim_start_matches(r"\\?\")
    );

    let options = sqlite::SqliteConnectOptions::from_str(&database_url)
        .with_context(|| format!("Failed to parse SQLite url: '{}'", database_url))?;
    let pool = sqlx::SqlitePool::connect_with(options)
        .await
        .with_context(|| format!("Failed to connect to SQLite database: {}", path.display()))?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

pub async fn run_until_done(args: ServerArgs<'_>, bind: TcpListener) -> anyhow::Result<()> {
    let mut join_set = JoinSet::new();
    let shutdown_signal = CancellationToken::new();
    // axum serve
    {
        let shutdown_signal = shutdown_signal.clone();
        let dir = args.config.file_storage.parse_dir()?;
        join_set.spawn(async move {
            let pool = connect_database(&dir).await.unwrap();
            let state = state::AppState::build(pool, dir, shutdown_signal.clone())
                .await
                .unwrap();
            let routes = routes::build().with_state(state);
            axum::serve(
                bind,
                routes.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async move {
                shutdown_signal.cancelled().await;
            })
            .await
        });
    }
    // register ctrl+c signal
    {
        let shutdown_signal = shutdown_signal.clone();
        join_set.spawn(async move {
            let _ = signal::ctrl_c().await;
            shutdown_signal.cancel();
            Ok(())
        });
    }
    // register usr1 signal to reopen log file when received
    // register sighup signal to reload config when received
    #[cfg(target_os = "linux")]
    {
        let shutdown_signal = shutdown_signal.clone();
        let logs = args.logs.clone();
        join_set.spawn(async move {
            let mut usr1 = signal::unix::signal(signal::unix::SignalKind::user_defined1())?;
            let mut sigterm = signal::unix::signal(signal::unix::SignalKind::terminate())?;
            loop {
                tokio::select! {
                    _ = sigterm.recv() => {
                        tracing::debug!("Received SIGTERM signal, start terminating");
                        shutdown_signal.cancel();
                    }
                    _ = usr1.recv() => {
                        tracing::debug!("Received USR1 signal, start reopening log files");
                        match logs.reopen(){
                            Ok(_) => tracing::info!("Log files reopen successful."),
                            Err(err) => eprintln!("Failed to reopen log files: {err:?}")
                        }
                    }
                }
            }
        });
    }
    while let Some(r) = join_set.join_next().await {
        if shutdown_signal.is_cancelled() {
            // println!("shutdown_signal is_cancelled, shutdown all set");
            join_set.shutdown().await;
            // println!("start terminal log");
            args.logs.terminal();
            break;
        }
        match r {
            Ok(Ok(_)) => (),
            Ok(Err(e)) => return Err(e.into()),
            Err(e) => anyhow::bail!("Internal error in spawn: {e}"),
        }
    }
    Ok(())
}
