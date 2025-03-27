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
    let dir = dir.unwrap_or_else(|| PathBuf::from("/var/log/ephemera"));
    let enable_file_logging = super::config::CONFIG.logs.enable_file_logging;
    // access_layer
    'access_layer: {
        if !enable_file_logging {
            break 'access_layer;
        }
        let access_file = writer.create_file_writer(dir.join("access.log"))?;
        let access_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .with_target(false)
            .with_timer(ChronoLocal::new("%F %X%.3f".to_string()))
            .compact()
            .with_writer(access_file)
            .with_filter(filter::filter_fn(|metadata| {
                metadata.target() == "ephemera::routes"
            }));
        layers.push(access_layer.boxed());
    }
    // event_layer
    {
        let event_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .with_timer(ChronoLocal::new("%F %X%.3f".to_string()));
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
            // .with_filter(filter::LevelFilter::from(level));
            .with_filter(filter::filter_fn(move |metadata| {
                metadata.level() <= &level
                    && metadata
                        .module_path()
                        .map(|it| it.starts_with("ephemera::") || it == "ephemera")
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
