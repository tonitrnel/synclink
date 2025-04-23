use anyhow::Context;
use std::path::PathBuf;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
use crate::services::device::DeviceService;
use crate::services::file::FileService;
use crate::services::legacy::FileIndexingService;
use crate::services::notify::NotifyService;
use crate::services::p2p::P2PService;
use crate::services::relay_socket::RelaySocketService;
use crate::services::system::SystemService;
use crate::services::upload::UploadService;
use crate::utils::{Observable, Observer};

#[derive(Clone)]
pub struct AppState {
    pub file_service: Arc<FileService>,
    pub notify_service: Arc<NotifyService>,
    pub upload_service: Arc<UploadService>,
    pub socket_service: Arc<RelaySocketService>,
    pub p2p_service: Arc<P2PService>,
    pub system_service: Arc<SystemService>,
    pub device_service: Arc<DeviceService>,
    pub shutdown_signal: CancellationToken,
}

impl AppState {
    pub(crate) async fn build(
        pool: sqlx::SqlitePool,
        dir: PathBuf,
        signal: CancellationToken,
    ) -> anyhow::Result<Self> {
        let indexing = FileIndexingService::new(&dir)
            .await
            .context("Failed to read index")?;
        let notify_service = Arc::new(NotifyService::new());
        let file_service = Arc::new(FileService::new(
            dir.clone(),
            pool.clone(),
            notify_service.clone(),
        )?);
        file_service.migrate_from_indexing(&indexing).await?;
        let upload_service = Arc::new(UploadService::new(dir.clone(), file_service.clone()));
        let p2p_service = Arc::new(P2PService::new(notify_service.clone()));
        let socket_service = Arc::new(RelaySocketService::new(p2p_service.clone()));
        notify_service.register(Arc::downgrade(
            &(Arc::clone(&p2p_service) as Arc<dyn Observer<uuid::Uuid>>),
        ));
        let device_service = Arc::new(DeviceService::new(pool.clone()));
        let system_service = Arc::new(SystemService::new());
        let state = AppState {
            file_service,
            notify_service,
            socket_service,
            upload_service,
            p2p_service,
            system_service,
            device_service,
            shutdown_signal: signal,
        };
        Ok(state)
    }
}
