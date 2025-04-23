use chrono::{DateTime, Utc};
use serde::{Serialize, Serializer};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::sqlite::{SqliteArgumentValue, SqliteTypeInfo};
use sqlx::{Database, Decode, Encode, Sqlite, Type};
use std::borrow::Cow;
use std::fmt::Display;

#[derive(Debug, Copy, Clone, Eq, PartialEq, sqlx::Type)]
#[sqlx(transparent)]
pub struct Timestamp(i64);
impl From<i64> for Timestamp {
    fn from(value: i64) -> Self {
        Self(value)
    }
}
impl From<Timestamp> for i64 {
    fn from(value: Timestamp) -> Self {
        value.0
    }
}
impl Serialize for Timestamp {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let dt = DateTime::<Utc>::from_timestamp(self.0, 0).unwrap();
        serializer.serialize_str(&dt.to_rfc3339())
    }
}
impl Display for Timestamp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Display::fmt(&self.0, f)
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[repr(transparent)]
pub struct Ulid(ulid::Ulid);

impl From<ulid::Ulid> for Ulid {
    fn from(ulid: ulid::Ulid) -> Self {
        Self(ulid)
    }
}

impl Into<ulid::Ulid> for Ulid {
    fn into(self) -> ulid::Ulid {
        self.0
    }
}

impl Type<Sqlite> for Ulid {
    fn type_info() -> SqliteTypeInfo {
        <[u8] as Type<Sqlite>>::type_info()
    }
    fn compatible(ty: &SqliteTypeInfo) -> bool {
        <[u8] as Type<Sqlite>>::compatible(ty)
    }
}
impl<'q> Encode<'q, Sqlite> for Ulid {
    fn encode_by_ref(
        &self,
        buf: &mut <Sqlite as Database>::ArgumentBuffer<'q>,
    ) -> Result<IsNull, BoxDynError> {
        buf.push(SqliteArgumentValue::Blob(Cow::Owned(
            self.0.to_bytes().to_vec(),
        )));
        Ok(IsNull::No)
    }
}
impl Decode<'_, Sqlite> for Ulid {
    fn decode(value: <Sqlite as Database>::ValueRef<'_>) -> Result<Self, BoxDynError> {
        let bytes = <&[u8] as Decode<Sqlite>>::decode(value)?;
        Ok(Self(ulid::Ulid::from_bytes(bytes.try_into()?)))
    }
}
