use colored::Color;
use std::fmt;
use std::fmt::Write;
use std::fmt::{Debug, Display};
use tracing::field::{Field, Visit};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::fmt::format::Writer;
use tracing_subscriber::fmt::{FmtContext, FormatEvent, FormatFields, FormattedFields};
use tracing_subscriber::registry::LookupSpan;

pub(super) struct Formatter {
    use_colors: bool,
}

impl Formatter {
    pub(super) fn new(use_colors: bool) -> Self {
        Self { use_colors }
    }
}

impl<S, N> FormatEvent<S, N> for Formatter
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &Event<'_>,
    ) -> fmt::Result {
        let meta = event.metadata();
        let now = chrono::Local::now();
        let mut visitor = StringVisitor::new();
        event.record(&mut visitor);
        let message = visitor.message;
        let mut fields_str = String::new();
        let mut trace_id = String::new();
        for span in ctx
            .event_scope()
            .into_iter()
            .flat_map(tracing_subscriber::registry::Scope::from_root)
        {
            let exts = span.extensions();
            let fields = if let Some(fields) = exts.get::<FormattedFields<N>>() {
                if fields.is_empty() {
                    continue;
                }
                fields
            } else {
                continue;
            };
            if fields.starts_with("trace_id=") {
                trace_id.push_str("@");
                trace_id.push_str(&fields["trace_id=".len()..]);
                continue;
            }
            if fields_str.is_empty() {
                fields_str.push_str("{");
            } else {
                fields_str.push_str(" ");
            }
            fields_str.push_str(fields);
        }
        if !fields_str.is_empty() {
            fields_str.write_str("}")?;
        }

        if self.use_colors {
            write!(
                writer,
                "[{} {}] {} {}",
                ColoredText::bright_black(now.format("%X%.3f")),
                LogLevelFormat::format_level_colored(meta.level(), true),
                ColoredText::bright_black(format!(
                    "{}{}{}:",
                    meta.target().replace("ephemera", "eph"),
                    trace_id,
                    fields_str
                )),
                message
            )?;
        } else {
            write!(
                writer,
                "{} {}{}{} {} {}",
                now.format("%F %X%.3f"),
                meta.target().replace("ephemera", "eph"),
                trace_id,
                fields_str,
                LogLevelFormat::format_level_char(meta.level()),
                message
            )?;
        }
        writeln!(writer)
    }
}

struct StringVisitor {
    message: String,
}

impl StringVisitor {
    fn new() -> Self {
        Self {
            message: String::new(),
        }
    }
}

impl Visit for StringVisitor {
    fn record_debug(&mut self, _field: &Field, value: &dyn Debug) {
        write!(self.message, "{:?} ", value).ok();
    }
}

impl Display for StringVisitor {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

struct LogLevelFormat {
    label: &'static str,
    color: Option<Color>,
}

impl LogLevelFormat {
    fn format_level_colored(level: &Level, use_colors: bool) -> Self {
        let (label, color) = match level {
            &Level::ERROR => ("ERR", Color::BrightRed),
            &Level::WARN => ("WRN", Color::BrightYellow),
            &Level::INFO => ("INF", Color::BrightBlue),
            &Level::DEBUG => ("DBG", Color::BrightMagenta),
            &Level::TRACE => ("TRC", Color::BrightWhite),
        };
        Self {
            label,
            color: if use_colors { Some(color) } else { None },
        }
    }
    fn format_level_char(level: &Level) -> Self {
        let label = match level {
            &Level::ERROR => "[E]",
            &Level::WARN => "[W]",
            &Level::INFO => "[I]",
            &Level::DEBUG => "[D]",
            &Level::TRACE => "[T]",
        };
        Self { label, color: None }
    }
}

impl Display for LogLevelFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(color) = self.color {
            write!(f, "\x1B[{}m", color.to_fg_str())?;
            write!(f, "{}", self.label)?;
            write!(f, "\x1B[0m")?;
        } else {
            write!(f, "{}", self.label)?;
        }
        Ok(())
    }
}

struct ColoredText<T> {
    content: T,
    color: Color,
}
impl<T> ColoredText<T> {
    fn bright_black(value: T) -> ColoredText<T> {
        ColoredText {
            content: value,
            color: Color::BrightBlack,
        }
    }
}
impl<T: Display> Display for ColoredText<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "\x1B[{}m", self.color.to_fg_str())?;
        write!(f, "{}", self.content)?;
        write!(f, "\x1B[0m")?;
        Ok(())
    }
}
