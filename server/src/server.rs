use std::net::SocketAddr;
use std::sync::Arc;

use crate::config::Config;
use crate::logging::LogWriter;
use crate::utils::{Observable, Observer};
use crate::{models, routes, state};
use tokio::{net::TcpListener, signal, task::JoinSet};
use tokio_util::sync::CancellationToken;

pub struct ServerArgs<'a> {
    pub logs: Arc<LogWriter>,
    pub config: &'a Config,
}

pub async fn run_until_done(args: ServerArgs<'_>, bind: TcpListener) -> anyhow::Result<()> {
    let mut join_set = JoinSet::new();
    let shutdown_signal = CancellationToken::new();
    // axum serve
    {
        let shutdown_signal = shutdown_signal.clone();
        let dir = args.config.file_storage.parse_dir()?;
        join_set.spawn(async move {
            let indexing = Arc::new(models::file_indexing::FileIndexing::new(dir).await);
            let mut notify_manager = crate::services::NotifyManager::new();
            let socket_manager = Arc::new(crate::services::P2PSocketManager::new());
            notify_manager.register(Arc::downgrade(
                &(Arc::clone(&socket_manager) as Arc<dyn Observer<uuid::Uuid>>),
            ));
            let state = state::AppState {
                indexing,
                notify_manager: Arc::new(notify_manager),
                socket_manager,
                shutdown_signal: shutdown_signal.clone(),
            };
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
