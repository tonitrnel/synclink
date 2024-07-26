pub use log_writer::LogWriter;
use std::path::PathBuf;
use tracing::Level;
use tracing_subscriber::fmt::time::ChronoLocal;
use tracing_subscriber::Layer;
use tracing_subscriber::{filter, layer::SubscriberExt, util::SubscriberInitExt};

mod log_writer;

pub fn registry_logs(
    writer: &mut LogWriter,
    level: Level,
    dir: Option<PathBuf>,
) -> anyhow::Result<()> {
    let mut layers = Vec::new();
    let dir = dir.unwrap_or_else(|| PathBuf::from("/var/log/cedasync"));
    let enable_file_logging = super::config::load().logs.enable_file_logging;
    // access_layer
    'access_layer: {
        if !enable_file_logging {
            break 'access_layer;
        }
        let access_file = writer.create_file_writer(dir.join("access.log"))?;
        let access_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .with_target(false)
            .compact()
            .with_writer(access_file)
            .with_filter(filter::filter_fn(|metadata| {
                metadata.target() == "cedasync::routes"
            }));
        layers.push(access_layer.boxed());
    }
    // beacon_layer
    {
        let beacon_layer = tracing_subscriber::fmt::layer().with_ansi(false).json();
        let beacon_layer = if enable_file_logging {
            let beacon_file = writer.create_file_writer(dir.join("beacon.log"))?;
            beacon_layer
                .with_writer(beacon_file)
                .with_filter(filter::filter_fn(|metadata| {
                    metadata.target() == "cedasync::services::beacon"
                }))
                .boxed()
        } else {
            beacon_layer
                .with_filter(filter::filter_fn(|metadata| {
                    metadata.target() == "cedasync::services::beacon"
                }))
                .boxed()
        };
        layers.push(beacon_layer);
    }
    // event_layer
    {
        let event_layer = tracing_subscriber::fmt::layer().with_ansi(false);
        let event_layer = if enable_file_logging {
            let event_file = writer.create_file_writer(dir.join("event.log"))?;
            event_layer
                .with_writer(event_file)
                .with_filter(filter::filter_fn(|metadata| metadata.target() == "event"))
                .boxed()
        } else {
            event_layer
                .with_filter(filter::filter_fn(|metadata| metadata.target() == "event"))
                .boxed()
        };
        layers.push(event_layer);
    }
    // generic_layer
    {
        let generic_layer = tracing_subscriber::fmt::layer()
            .with_level(true)
            .with_target(false)
            .with_file(true)
            .with_line_number(true)
            .with_timer(ChronoLocal::new("%F %X%.3f".to_string()))
            .with_filter(filter::LevelFilter::from(level))
            .with_filter(filter::filter_fn(move |metadata| {
                &level <= metadata.level()
                    && metadata
                        .module_path()
                        .map(|it| it.starts_with("cedasync::") || it == "cedasync")
                        .unwrap_or(false)
            }));
        layers.push(generic_layer.boxed());
    }
    tracing_subscriber::registry()
        .with(layers)
        .with(tracing_error::ErrorLayer::default())
        .init();
    Ok(())
}
