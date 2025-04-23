use chrono::{DateTime, Utc};

pub fn serialize_rfc3339<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_str(&dt.to_rfc3339())
}

pub fn option_serialize_rfc3339<S>(
    dt: &Option<DateTime<Utc>>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    match dt {
        Some(dt) => serialize_rfc3339(dt, serializer),
        None => serializer.serialize_none(),
    }
}
