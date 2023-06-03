use chrono::{LocalResult, NaiveDateTime, ParseError, TimeZone, Utc};
use serde::{Deserialize, Deserializer, Serializer};

pub fn utc_to_i64(s: &str) -> Result<i64, ParseError> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S %Z").map(|it| it.timestamp_millis())
}

pub fn i64_to_utc(t: &i64) -> Result<String, &str> {
    match Utc
        .timestamp_millis_opt(*t)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S %Z").to_string())
    {
        LocalResult::Single(utc_string) => Ok(utc_string),
        _ => Err("Incorrect timestamp"),
    }
}

pub fn deserialize_utc_to_i64<'de, D>(deserializer: D) -> Result<i64, D::Error>
where
    D: Deserializer<'de>,
{
    let s: String = Deserialize::deserialize(deserializer)?;
    utc_to_i64(&s).map_err(|err| serde::de::Error::custom(format!("Invalid Date: {}, {}", s, err)))
}

pub fn deserialize_option_utc_to_i64<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: Deserializer<'de>,
{
    let s: Option<String> = Deserialize::deserialize(deserializer)?;

    match s {
        Some(s) => utc_to_i64(&s)
            .map(Some)
            .map_err(|err| serde::de::Error::custom(format!("Invalid Date: {}, {}", s, err))),
        _ => Ok(None),
    }
}

pub fn serialize_i64_to_utc<S>(t: &i64, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match i64_to_utc(t) {
        Ok(utc_string) => serializer.serialize_str(&utc_string),
        Err(err) => Err(serde::ser::Error::custom(err)),
    }
}

pub fn serialize_option_i64_to_utc<S>(t: &Option<i64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match t {
        Some(t) => serialize_i64_to_utc(t, serializer),
        None => serializer.serialize_none(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_utc_to_i64() {
        // Test valid UTC string
        assert_eq!(utc_to_i64("2023-06-01 09:22:40 UTC"), Ok(1685611360000));

        // Test invalid UTC string
        assert!(utc_to_i64("invalid_timestamp").is_err());
    }

    #[test]
    fn test_i64_to_utc() {
        assert_eq!(
            i64_to_utc(&1685611360000),
            Ok("2023-06-01 09:22:40 UTC".to_string())
        );
    }
}
