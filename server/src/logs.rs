use tracing::Level;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, Layer};

pub fn logs_registry(level: Level) {
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
}
