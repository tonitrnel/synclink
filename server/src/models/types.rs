use crate::common::AppError;
use crate::utils::base64_url;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::sqlite::{SqliteArgumentValue, SqliteArguments, SqliteTypeInfo};
use sqlx::{Arguments, Database, Decode, Encode, Sqlite, Type};
use std::borrow::Cow;
use std::fmt::Display;
use std::fmt::Write;
use uuid::Uuid;

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
/// 游标
///
/// 基于 uuid v4/v7 + created_at 的游标
///
/// ## 实现规则:
/// - 在 id 是 uuid v4 下，将会存储 created_at 作为主排序
/// - 在 id 是 uuid v7 下，不会存储 created_at，因为 uuid v7 本身是有序的
#[derive(Debug, Clone)]
pub struct Cursor {
    pub(crate) id: Uuid,
    pub(crate) created_at: Option<i64>,
}

impl Cursor {
    pub(crate) fn new(id: Uuid, created_at: i64) -> Self {
        // uuid v7 is sortable
        if id.get_version_num() == 7 {
            Self {
                id,
                created_at: None,
            }
        } else {
            Self {
                id,
                created_at: Some(created_at),
            }
        }
    }

    /// 写入 where 语句（不带 AND 和 WHERE 关键词）
    pub(crate) fn write_where_cause(
        &self,
        writer: &mut String,
        args: &mut SqliteArguments,
        is_asc: bool,
        table: &str,
    ) -> anyhow::Result<(), AppError> {
        let direction = if is_asc { ">" } else { "<" };
        if let Some(created_at) = self.created_at.as_ref() {
            args.add(*created_at).map_err(|e| sqlx::Error::Encode(e))?;
            args.add(self.id).map_err(|e| sqlx::Error::Encode(e))?;
            write!(
                writer,
                "{table}.created_at {direction} ?{} AND {table}.id <> ?{} ",
                args.len() - 1,
                args.len()
            )?;
        } else {
            args.add(self.id).map_err(|e| sqlx::Error::Encode(e))?;
            write!(writer, "{table}.id {direction} ${} ", args.len())?;
        }
        Ok(())
    }
    pub(crate) fn order_cause(is_complex: bool, is_asc: bool, table: &str) -> String {
        match (is_complex, is_asc) {
            (true, true) => format!("{table}.created_at, {table}.id"),
            (true, false) => format!("{table}.created_at DESC, {table}.id DESC"),
            (false, true) => format!("{table}.id"),
            (false, false) => format!("{table}.id DESC"),
        }
    }
    /// 写入 order by 语句（不带 ORDER BY 关键词）
    pub(crate) fn write_order_cause(
        &self,
        writer: &mut String,
        is_asc: bool,
        table: &str,
    ) -> anyhow::Result<(), AppError> {
        let cause = Self::order_cause(self.created_at.is_some(), is_asc, table);
        write!(writer, "{cause} ")?;
        Ok(())
    }
}
impl Serialize for Cursor {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if let Some(created_at) = self.created_at.as_ref() {
            let mut buffer = [0u8; 24];
            buffer[..16].copy_from_slice(self.id.as_bytes());
            buffer[16..24].copy_from_slice(created_at.to_be_bytes().as_ref());
            serializer.serialize_str(&base64_url::encode(&buffer))
        } else {
            serializer.serialize_str(&base64_url::encode(self.id.as_bytes()))
        }
    }
}
impl<'de> Deserialize<'de> for Cursor {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let base64_str = <&'de str>::deserialize(deserializer)?;
        let buffer = base64_url::decode(base64_str).map_err(serde::de::Error::custom)?;
        if buffer.len() != 24 && buffer.len() != 16 {
            return Err(serde::de::Error::invalid_length(buffer.len(), &"24"));
        }
        let id = Uuid::from_slice(&buffer[..16]).map_err(serde::de::Error::custom)?;
        let created_at = if buffer.len() == 24 {
            let mut timestamp_bytes = [0u8; 8];
            timestamp_bytes.copy_from_slice(&buffer[16..24]);
            Some(i64::from_be_bytes(timestamp_bytes))
        } else {
            None
        };
        Ok(Self { id, created_at })
    }
}

pub struct CursorPager {
    pub first: Option<u32>,
    pub last: Option<u32>,
    pub after: Option<Cursor>,
    pub before: Option<Cursor>,
}
impl CursorPager {
    pub(crate) fn validate(&self) -> anyhow::Result<(), AppError> {
        match (
            (self.first.is_some(), self.after.is_some()),
            (self.last.is_some(), self.before.is_some()),
        ) {
            ((true, _), (true, _)) => Err(AppError::BadRequest(anyhow::format_err!(
                "Cannot use both 'first' and 'last'",
            ))),
            ((_, true), (_, true)) => Err(AppError::BadRequest(anyhow::format_err!(
                "Cannot use both 'after' and 'before'",
            ))),
            ((true, _), (_, true)) => Err(AppError::BadRequest(anyhow::format_err!(
                "'first' cannot be used with 'before'",
            ))),
            ((_, true), (true, _)) => Err(AppError::BadRequest(anyhow::format_err!(
                "'last' cannot be used with 'after'",
            ))),
            _ => Ok(()),
        }
    }
    pub(crate) fn limit(&self) -> u32 {
        self.first.or(self.last).unwrap_or(10)
    }
    pub(crate) fn has_prev(&self, len: u32) -> bool {
        self.last.as_ref().map(|it| &len > it).unwrap_or(false)
    }
    pub(crate) fn has_next(&self, len: u32) -> bool {
        self.first.as_ref().map(|it| &len > it).unwrap_or(false)
    }

    /// 修剪多余的内容
    ///
    /// ## 返回
    /// `(vec，has_prev, has_next)`
    pub(crate) fn prune<T>(&self, vec: Vec<T>) -> (Vec<T>, bool, bool) {
        if vec.is_empty() {
            return (Vec::new(), false, false);
        }
        let len = vec.len() as u32;
        let limit = self.limit();
        let take_len = u32::min(len, limit);
        let skip_len = u32::max(0, take_len.saturating_sub(limit));
        let has_prev = self.has_prev(len);
        let has_next = self.has_next(len);

        (
            vec.into_iter()
                .take(take_len as usize)
                .skip(skip_len as usize)
                .collect::<Vec<_>>(),
            has_prev,
            has_next,
        )
    }

    /// 写入 where 语句（不带 AND 和 WHERE 关键词）
    pub(crate) fn write_where_cause(
        &self,
        writer: &mut String,
        args: &mut SqliteArguments,
        table: &str,
    ) -> Result<(), AppError> {
        if let Some(after) = self.after.as_ref() {
            after.write_where_cause(writer, args, true, table)?;
        } else if let Some(before) = self.before.as_ref() {
            before.write_where_cause(writer, args, false, table)?;
        }
        Ok(())
    }

    /// 写入 order by 语句（不带 ORDER BY 关键词）
    ///
    /// 此调用应该在 ORDER BY 范围内最后写入
    pub(crate) fn write_order_cause(&self, writer: &mut String, table: &str) -> Result<(), AppError> {
        if let Some(after) = self.after.as_ref() {
            after.write_order_cause(writer, true, table)?;
        } else if let Some(before) = self.before.as_ref() {
            before.write_order_cause(writer, false, table)?;
        } else if self.last.is_some() {
            write!(writer, "{} ", Cursor::order_cause(true, false, table))?;
        } else {
            write!(writer, "{} ", Cursor::order_cause(true, true, table))?;
        }
        Ok(())
    }

    /// 写入 limit 语句
    pub(crate) fn write_limit_cause(
        &self,
        writer: &mut String,
        args: &mut SqliteArguments,
    ) -> Result<(), AppError> {
        args.add(self.limit() + 1)
            .map_err(|e| sqlx::Error::Encode(e))?;
        write!(writer, "LIMIT ?{}", args.len())?;
        Ok(())
    }
}
