use std::path::PathBuf;
use tracing::Level;
use tracing_appender::non_blocking::{NonBlocking, WorkerGuard};
use tracing_appender::{non_blocking, rolling};
use tracing_subscriber::Layer;
use tracing_subscriber::{filter, layer::SubscriberExt, util::SubscriberInitExt};

fn file_appender(dir: &Option<PathBuf>, filename: &str) -> (NonBlocking, WorkerGuard) {
    if let Some(dir) = dir {
        let file_appender = rolling::Builder::new()
            .rotation(rolling::Rotation::DAILY)
            .filename_prefix(filename)
            .filename_suffix("log")
            .max_log_files(7)
            .build(dir)
            .expect("Initializing rolling file appender failed");
        let (non_blocking, guard) = non_blocking(file_appender);
        (non_blocking, guard)
    } else {
        let (non_blocking, guard) = non_blocking(std::io::stdout());
        (non_blocking, guard)
    }
}

pub fn logs_registry(level: Level, dir: Option<PathBuf>) -> anyhow::Result<Vec<WorkerGuard>> {
    let mut guards = Vec::new();
    // tracing_subscriber::registry()
    //     .with(
    //         tracing_subscriber::fmt::layer()
    //             .with_filter(tracing_subscriber::filter::LevelFilter::from_level(level))
    //             .with_filter(tracing_subscriber::filter::filter_fn(|metadata| {
    //                 metadata.target().starts_with("synclink")
    //             })),
    //     )
    //     .with(
    //         tracing_subscriber::fmt::layer()
    //             .compact()
    //             .with_file(false)
    //             .with_target(false)
    //             .with_filter(tracing_subscriber::filter::filter_fn(|metadata| {
    //                 metadata.target().starts_with("tower_http")
    //             })),
    //     )
    //     .with(
    //         tracing_subscriber::fmt::layer()
    //             .compact()
    //             .with_filter(tracing_subscriber::filter::LevelFilter::INFO)
    //             .with_filter(tracing_subscriber::filter::filter_fn(|metadata| {
    //                 !metadata.target().starts_with("synclink")
    //             })),
    //     )
    //     .with(tracing_error::ErrorLayer::default())
    //     .init();
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer({
                    let (non_blocking, guard) = file_appender(&dir, "http");
                    guards.push(guard);
                    non_blocking
                })
                .with_ansi(false)
                .with_filter(filter::filter_fn(|metadata| {
                    metadata.target() == "synclink"
                }))
                .with_filter(filter::LevelFilter::from_level(level)),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer({
                    let (non_blocking, guard) = file_appender(&dir, "access");
                    guards.push(guard);
                    non_blocking
                })
                .with_ansi(false)
                .with_filter(filter::filter_fn(|metadata| {
                    metadata.target() == "tower_http::trace::on_request"
                        || metadata.target() == "tower_http::trace::on_response"
                })),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer({
                    let (non_blocking, guard) = file_appender(&dir, "beacon");
                    guards.push(guard);
                    non_blocking
                })
                .with_ansi(false)
                .with_filter(filter::filter_fn(|metadata| {
                    metadata.target() == "synclink::services::beacon"
                })),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer({
                    let (non_blocking, guard) = file_appender(&dir, "event");
                    guards.push(guard);
                    non_blocking
                })
                .with_ansi(false)
                .with_filter(filter::filter_fn(|metadata| metadata.target() == "event")),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(true)
                .with_filter(filter::filter_fn(|metadata| {
                    if metadata.target() == "mio::poll" {
                        return false;
                    }
                    // println!("{:#?} ", metadata);
                    true
                })),
        )
        .with(tracing_error::ErrorLayer::default())
        .init();
    Ok(guards)
}
