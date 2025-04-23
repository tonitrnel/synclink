use crate::logging::format::Formatter;
pub use log_writer::LogWriter;
use std::path::PathBuf;
use tracing::Level;
use tracing_subscriber::Layer;
use tracing_subscriber::{filter, layer::SubscriberExt, util::SubscriberInitExt};

mod format;
mod log_writer;

pub fn registry_logs(
    writer: &mut LogWriter,
    level: Level,
    dir: Option<PathBuf>,
) -> anyhow::Result<()> {
    let mut layers = Vec::new();
    let dir = dir.unwrap_or_else(|| PathBuf::from("/var/log/ephemera"));
    let enable_file_logging = super::config::CONFIG.logs.enable_file_logging;
    'file_layer: {
        if !enable_file_logging {
            break 'file_layer;
        }
        let level = level.clone();
        let formatter = Formatter::new(false);
        let access_file = writer.create_file_writer(dir.join("ephemera.log"))?;
        let file_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .event_format(formatter)
            .with_writer(access_file)
            .with_filter(filter::filter_fn(move |metadata| {
                metadata
                    .module_path()
                    .map(|it| it.starts_with("ephemera::") && metadata.level() <= &level)
                    .unwrap_or(false)
            }));
        layers.push(file_layer.boxed());
    }
    'stdio_layer: {
        if enable_file_logging {
            break 'stdio_layer;
        }
        let formatter = Formatter::new(true);
        let stdio_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .event_format(formatter)
            .with_filter(filter::filter_fn(move |metadata| {
                metadata
                    .module_path()
                    .map(|it| it.starts_with("ephemera::") && metadata.level() <= &level)
                    .unwrap_or(false)
            }));
        layers.push(stdio_layer.boxed());
    }
    // general_layer
    {
        let formatter = Formatter::new(true);
        let general_layer = tracing_subscriber::fmt::layer()
            .with_ansi(false)
            .event_format(formatter)
            .with_filter(filter::filter_fn(move |metadata| {
                metadata
                    .module_path()
                    .map(|it| it == "ephemera")
                    .unwrap_or(false)
            }));
        layers.push(general_layer.boxed());
    }
    tracing_subscriber::registry()
        .with(layers)
        .with(tracing_error::ErrorLayer::default())
        .init();
    Ok(())
}
