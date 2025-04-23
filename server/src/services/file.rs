use crate::common::AppError;
use crate::models::dtos::file::{ArchiveEntryResponseDto, FileQueryDto};
use crate::models::file::*;
use crate::models::{Timestamp, Ulid};
use crate::services::legacy::FileIndexingService;
use crate::services::notify::NotifyService;
use crate::utils::{
    Boundaries, SparseStreamReader, format_last_modified_from_metadata,
    format_last_modified_from_u64, format_ranges, parse_range_from_str,
};
use crate::{build_inert_sql, config};
use anyhow::Context;
use axum::body::Body;
use axum::http::{Method, header};
use axum::response::IntoResponse;
use dashmap::DashMap;
use futures::{StreamExt, TryStreamExt};
use sqlx::{Arguments, Row, SqlitePool};
use std::collections::{HashMap, HashSet};
use std::fmt::Write;
use std::hash::Hash;
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncSeek};
use tokio_util::io::ReaderStream;
use uuid::Uuid;

#[derive(Clone, Debug, PartialEq, Eq)]
enum UsedSpaceCacheKey {
    UserId(Uuid),
    Public,
}
impl Hash for UsedSpaceCacheKey {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        match self {
            UsedSpaceCacheKey::UserId(id) => id.hash(state),
            UsedSpaceCacheKey::Public => "public_zone".hash(state),
        }
    }
}
impl From<Option<Uuid>> for UsedSpaceCacheKey {
    fn from(uuid: Option<Uuid>) -> Self {
        match uuid {
            Some(uuid) => Self::UserId(uuid),
            None => Self::Public,
        }
    }
}

pub struct FileService {
    pool: SqlitePool,
    dir: PathBuf,
    notify_service: Arc<NotifyService>,
    // actual，temp
    storage_cache: Arc<DashMap<UsedSpaceCacheKey, (u64, u64)>>,
}

pub struct GetContentArgs {
    /// header range
    pub(crate) r: Option<String>,
    /// http method
    pub(crate) m: Method,
    /// query params
    pub(crate) q: FileQueryDto,
}

pub struct GetArchiveEntryArgs {
    /// entry path or hash
    pub(crate) ph: String,
    /// range
    pub(crate) r: Option<String>,
    /// query params
    pub(crate) q: FileQueryDto,
    /// method
    pub(crate) m: Method,
}

pub struct ListArgs<'a> {
    /// offset
    pub(crate) offset: u32,
    /// limit
    pub(crate) limit: u32,
    /// after
    pub(crate) after: Option<i64>,
    /// before
    pub(crate) before: Option<i64>,
    /// group
    pub(crate) group: &'a [&'a str],
}
pub struct TotalArgs<'a> {
    /// after
    pub(crate) after: Option<i64>,
    /// before
    pub(crate) before: Option<i64>,
    /// group
    pub(crate) group: &'a [&'a str],
}

pub struct AppendArgs<'a> {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub device_id: Option<Ulid>,
    pub basename: String,
    pub hash: String,
    pub size: u64,
    pub mimetype: &'a str,
    pub extname: Option<&'a str>,
    pub ipaddr: Option<String>,
    pub caption: String,
    pub tags: String,
    pub metadata: FileMetadata,
}

impl FileService {
    pub fn new(
        path: PathBuf,
        pool: SqlitePool,
        notify_service: Arc<NotifyService>,
    ) -> anyhow::Result<Self> {
        if !&path.is_dir() {
            anyhow::bail!("Error: Path '{:?}' is not a directory", path.as_os_str())
        }
        Ok(FileService {
            pool,
            dir: path,
            notify_service,
            storage_cache: Default::default(),
        })
    }

    pub fn if_thumbnail(&self, prefer: bool, id: &Uuid, extname: Option<&str>) -> Option<PathBuf> {
        if !prefer {
            return None;
        }
        let path = self.dir.join(build_thumbnail_filename(id, extname));
        if path.exists() && path.is_file() {
            Some(path)
        } else {
            None
        }
    }
    pub async fn list(
        &self,
        user_id: Option<Uuid>,
        args: ListArgs<'_>,
    ) -> anyhow::Result<Vec<FileEntity>, AppError> {
        let ListArgs {
            offset,
            limit,
            after,
            before,
            group: _group,
        } = args;
        let mut sql = String::from(
            r#"SELECT 
                    id, name, hash, size, mimetype, extname,
                    ipaddr, metadata, is_encrypted,
                    is_pined, created_at, updated_at
                  FROM files
                "#,
        );
        let mut args = sqlx::sqlite::SqliteArguments::default();
        let mut where_cause = String::new();
        if let Some(user_id) = user_id {
            args.add(user_id).map_err(|e| sqlx::Error::Encode(e))?;
            let ix = args.len();
            if where_cause.is_empty() {
                write!(where_cause, " AND")?;
            }
            write!(where_cause, " user_id == ${}", ix)?;
        }
        if let Some(after) = after {
            args.add(after).map_err(|e| sqlx::Error::Encode(e))?;
            let ix = args.len();
            if where_cause.is_empty() {
                write!(where_cause, " AND")?;
            }
            write!(where_cause, " created_at > ${}", ix)?;
        }
        if let Some(before) = before {
            args.add(before).map_err(|e| sqlx::Error::Encode(e))?;
            let ix = args.len();
            if where_cause.is_empty() {
                write!(where_cause, " AND")?;
            }
            write!(where_cause, " created_at < ${}", ix)?;
        }
        if !where_cause.is_empty() {
            write!(sql, " WHERE {}", where_cause)?;
        }
        args.add(limit).map_err(|e| sqlx::Error::Encode(e))?;
        args.add(offset).map_err(|e| sqlx::Error::Encode(e))?;
        write!(
            sql,
            " ORDER BY created_at DESC LIMIT ${} OFFSET ${}",
            args.len() - 1,
            args.len()
        )?;
        let rows = sqlx::query_with(&sql, args)
            .fetch_all(&self.pool)
            .await
            .with_context(|| sql)?;
        let mut records = Vec::new();
        for row in rows {
            records.push(FileEntity {
                id: row.try_get_unchecked::<Uuid, _>("id")?,
                name: row.try_get_unchecked::<String, _>("name")?,
                hash: row.try_get_unchecked::<String, _>("hash")?,
                size: row.try_get_unchecked::<i64, _>("size")?,
                mimetype: row.try_get_unchecked::<String, _>("mimetype")?,
                extname: row.try_get_unchecked::<Option<String>, _>("extname")?,
                ipaddr: row.try_get_unchecked::<Option<String>, _>("ipaddr")?,
                metadata: row
                    .try_get_unchecked::<Option<String>, _>("metadata")?
                    .into(),
                is_encrypted: row.try_get_unchecked::<bool, _>("is_encrypted")?,
                is_pined: row.try_get_unchecked::<bool, _>("is_pined")?,
                created_at: row.try_get_unchecked::<i64, _>("created_at")?.into(),
                updated_at: row.try_get_unchecked::<i64, _>("updated_at")?.into(),
            })
        }
        Ok(records)
    }
    pub async fn total(
        &self,
        user_id: Option<Uuid>,
        args: TotalArgs<'_>,
    ) -> anyhow::Result<u32, AppError> {
        let TotalArgs {
            after,
            before,
            group: _group,
        } = args;
        let mut sql = String::from("SELECT COUNT(id) as total FROM files");
        let mut args = sqlx::sqlite::SqliteArguments::default();
        let mut where_cause = String::new();
        if let Some(user_id) = user_id {
            args.add(user_id).map_err(|e| sqlx::Error::Encode(e))?;
            if !where_cause.is_empty() {
                write!(where_cause, " AND")?;
            }
            write!(where_cause, " user_id = ${}", args.len())?;
        }
        if let Some(after) = after {
            args.add(after).map_err(|e| sqlx::Error::Encode(e))?;
            if !where_cause.is_empty() {
                write!(where_cause, " AND")?;
            }
            write!(where_cause, " created > ${}", args.len())?;
        }
        if let Some(before) = before {
            args.add(before).map_err(|e| sqlx::Error::Encode(e))?;
            if !where_cause.is_empty() {
                write!(where_cause, " AND")?;
            }
            write!(where_cause, " created < ${}", args.len())?;
        }
        if !where_cause.is_empty() {
            write!(sql, " WHERE {}", where_cause)?;
        }
        let row = sqlx::query_with(&sql, args).fetch_one(&self.pool).await?;
        let total = row.try_get_unchecked::<i64, _>("total")? as u32;
        Ok(total)
    }
    pub async fn get_by_id(&self, id: Uuid) -> anyhow::Result<FileEntity, AppError> {
        let record = sqlx::query_as!(
            FileEntity,
            r#"
            SELECT id as "id: Uuid", name, hash, size, mimetype, extname,
                ipaddr, metadata as "metadata: FileMetadata", is_encrypted,
                is_pined, created_at, updated_at
            FROM files
            WHERE id = ?
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;
        let record = check_record_exists(record)?;
        Ok(record)
    }
    pub async fn get_content_by_id(
        &self,
        id: Uuid,
        args: GetContentArgs,
    ) -> anyhow::Result<impl IntoResponse, AppError> {
        let record = sqlx::query!(
            r#"SELECT
                id as "id: uuid::Uuid", name, hash, size, mimetype,
                extname
            FROM files WHERE id == ?"#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;
        let record = check_record_exists(record)?;

        let mut filepath = self
            .dir
            .join(build_filename(&id, record.extname.as_deref()));

        if let Some(thumbnail_path) =
            self.if_thumbnail(args.q.thumbnail_prefer, &id, record.extname.as_deref())
        {
            filepath = thumbnail_path
        };

        let file = tokio::fs::File::open(&filepath).await?;

        let metadata = file.metadata().await?;

        let mut response_headers = vec![
            (header::CONTENT_TYPE, {
                let file_type = record.mimetype;
                if file_type.starts_with("text/") {
                    format!("{}; charset=utf-8", file_type)
                } else {
                    file_type.to_string()
                }
            }),
            (header::ACCEPT_RANGES, "bytes".to_string()),
            (header::ETAG, format!("\"{}\"", record.hash)),
            (header::CONNECTION, "keep-alive".to_string()),
            (
                header::HeaderName::from_static("keep-alive"),
                "timeout=15".to_string(),
            ),
        ];
        if args.q.raw {
            response_headers.push((
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", record.name),
            ))
        }
        if let Some(last_modified) = format_last_modified_from_metadata(&metadata) {
            response_headers.push((header::LAST_MODIFIED, last_modified))
        }
        let total = metadata.len();
        build_response(BuildResponseArgs {
            only_head: args.m == Method::HEAD,
            range: args.r,
            headers: response_headers,
            reader: file,
            total,
        })
    }

    pub async fn get_text_collection(
        &self,
        uuids: Vec<Uuid>,
    ) -> anyhow::Result<impl IntoResponse, AppError> {
        let uuid_set = uuids.iter().collect::<HashSet<_>>();
        if uuids.len() != uuid_set.len() {
            return Err(AppError::BadRequest(anyhow::format_err!(
                "Cannot build collection when duplicates are detected"
            )));
        }
        let mut args = sqlx::sqlite::SqliteArguments::default();
        for uuid in &uuids {
            args.add(uuid).map_err(|e| sqlx::Error::Encode(e))?;
        }
        let placeholders = "?, ".repeat(args.len());
        #[derive(Debug, Clone)]
        struct Record {
            // id: Uuid,
            size: i64,
            extname: Option<String>,
        }
        let sql = format!(
            "SELECT id, size, extname FROM files WHERE id IN ({}) AND mimetype LIKE 'text/%'",
            placeholders.trim_end_matches(", ")
        );
        let rows = sqlx::query_with(&sql, args).fetch_all(&self.pool).await?;
        let mut map = HashMap::new();
        for row in rows {
            let id = row.try_get_unchecked::<Uuid, _>("id")?;
            map.insert(
                id,
                Record {
                    // id,
                    size: row.try_get_unchecked::<i64, _>("size")?,
                    extname: row.try_get_unchecked::<Option<String>, _>("extname")?,
                },
            );
        }
        if map.len() != uuids.len() {
            let target_id = uuids.iter().find(|id| !map.contains_key(id)).unwrap();
            return Err(AppError::BadRequest(anyhow::format_err!(
                "The resource id {} could not be found",
                target_id
            )));
        }
        let mut collections = Vec::with_capacity(uuids.len());
        let mut total = 0;
        let mut lengths = Vec::with_capacity(uuids.len());
        for uuid in uuids {
            let record = map.get(&uuid).unwrap();
            total += record.size;
            lengths.push(record.size.to_string());
            let filepath = self
                .dir
                .join(build_filename(&uuid, record.extname.as_deref()));
            collections.push((filepath, record.clone()));
        }
        let lengths = lengths.join(",");
        let response_headers = vec![
            (
                header::HeaderName::from_static("x-collection-lengths"),
                lengths,
            ),
            (header::CONTENT_LENGTH, total.to_string()),
            (
                header::CONTENT_TYPE,
                "text/plain; charset=utf-8".to_string(),
            ),
        ];
        let stream = futures::stream::iter(collections)
            .filter_map(|(path, ..)| async move { Some(tokio::fs::read(path).await) })
            .into_stream();
        let response = (
            axum::response::AppendHeaders(response_headers),
            Body::from_stream(stream),
        )
            .into_response();
        Ok(response)
    }
    pub async fn get_archive_entries(
        &self,
        id: Uuid,
    ) -> anyhow::Result<Vec<ArchiveEntryResponseDto>, AppError> {
        let record = sqlx::query!(
            r#"
            SELECT 
                id, mimetype, extname 
            FROM files 
            WHERE id = ? AND mimetype == 'application/x-tar'
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;
        let record = check_record_exists(record)?;
        let filepath = self
            .dir
            .join(build_filename(&id, record.extname.as_deref()));
        let data = archive::parse_entries(&filepath).await?;
        Ok(data.into_iter().map(Into::into).collect())
    }
    pub async fn get_archive_entry(
        &self,
        id: Uuid,
        args: GetArchiveEntryArgs,
    ) -> anyhow::Result<impl IntoResponse, AppError> {
        let record = sqlx::query!(
            r#"
            SELECT 
                id, mimetype, extname 
            FROM files 
            WHERE id = ? AND mimetype == 'application/x-tar'
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;
        let record = check_record_exists(record)?;
        let filepath = self
            .dir
            .join(build_filename(&id, record.extname.as_deref()));
        let entries = archive::parse_entries(&filepath).await?;
        let entry = entries
            .into_iter()
            .find(|it| {
                it.path == args.ph || it.hash.as_deref().map(|h| h == args.ph).unwrap_or_default()
            })
            .ok_or_else(|| AppError::NotFound)?;

        if !tar::EntryType::new(entry.entry_type).is_file() {
            return Err(AppError::BadRequest(anyhow::format_err!(
                "Cannot open non-file entry"
            )));
        }
        let file = tokio::fs::File::open(&filepath).await?;
        let reader = archive::ArchiveFileReader::new(file, entry.file_position, entry.size).await?;

        let mut response_headers = vec![
            (header::CONTENT_TYPE, entry.mimetype.unwrap()),
            (header::ACCEPT_RANGES, "bytes".to_string()),
            (header::ETAG, format!("\"{}\"", entry.hash.unwrap())),
            (header::CONNECTION, "keep-alive".to_string()),
            (
                header::HeaderName::from_static("keep-alive"),
                "timeout=15".to_string(),
            ),
        ];
        if args.q.raw {
            response_headers.push((
                header::CONTENT_DISPOSITION,
                format!(
                    "attachment; filename=\"{}\"",
                    archive::parse_filename_from_path(&entry.path)
                ),
            ))
        }
        if let Some(last_modified) = format_last_modified_from_u64(entry.mtime) {
            response_headers.push((header::LAST_MODIFIED, last_modified));
        }
        let total = entry.size;
        build_response(BuildResponseArgs {
            only_head: args.m == Method::HEAD,
            range: args.r,
            headers: response_headers,
            reader,
            total,
        })
    }

    pub async fn delete_by_id(&self, id: Uuid) -> anyhow::Result<bool, AppError> {
        let record = sqlx::query!(
            r#"DELETE FROM files WHERE id = ? RETURNING user_id as "user_id?: Uuid", size"#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;
        let record = match record {
            Some(record) => record,
            None => return Ok(false),
        };

        let key = UsedSpaceCacheKey::from(record.user_id);

        if self.storage_cache.contains_key(&key) {
            let mut entry = self.storage_cache.get_mut(&key).unwrap();
            let value = entry.value_mut();
            *(&mut value.0) -= record.size as u64
        }

        if let Err(err) = self.notify_service.send(IndexChange::Removed(id).into()) {
            tracing::warn!("Broadcast {} failed: {}", id, err);
        }
        Ok(true)
    }

    pub async fn append<'a>(&self, args: AppendArgs<'a>) -> anyhow::Result<(), AppError> {
        let (sql, sql_args) = build_inert_sql!(
            "files",
            [
                ("id", args.id),
                ("user_id", &args.user_id),
                ("device_id", &args.device_id),
                ("name", args.basename),
                ("hash", args.hash),
                ("size", args.size as i64),
                ("mimetype", args.mimetype),
                ("extname", args.extname),
                ("ipaddr", args.ipaddr),
                ("caption", args.caption),
                ("tags", args.tags),
                ("metadata", args.metadata)
            ]
        );
        sqlx::query_with(&sql, sql_args).execute(&self.pool).await?;
        let key = UsedSpaceCacheKey::from(args.user_id);

        if self.storage_cache.contains_key(&key) {
            let mut entry = self.storage_cache.get_mut(&key).unwrap();
            let value = entry.value_mut();
            *(&mut value.0) += args.size;
        }
        if let Err(err) = self.notify_service.send(IndexChange::Added(args.id).into()) {
            tracing::warn!("Broadcast {} failed: {}", args.id, err);
        }
        Ok(())
    }

    pub async fn exists(&self, hash: &str) -> anyhow::Result<Option<Uuid>, AppError> {
        let record = sqlx::query!(r#"SELECT id as "id: Uuid" FROM files WHERE hash = ?"#, hash)
            .fetch_optional(&self.pool)
            .await?;
        Ok(record.map(|it| it.id))
    }

    pub async fn get_used_space(&self, user_id: Option<Uuid>) -> anyhow::Result<u64, AppError> {
        let key = UsedSpaceCacheKey::from(user_id);
        if let Some(value) = self.storage_cache.get(&key) {
            return Ok(value.0 + value.1);
        }
        let used = match &key {
            UsedSpaceCacheKey::Public => {
                sqlx::query!("SELECT sum(size) as used FROM files WHERE user_id IS NULL")
                    .fetch_one(&self.pool)
                    .await?
                    .used
            }
            UsedSpaceCacheKey::UserId(id) => {
                sqlx::query!("SELECT sum(size) as used FROM files WHERE user_id = ?", id)
                    .fetch_one(&self.pool)
                    .await?
                    .used
            }
        }
        .unwrap_or_default() as u64;

        self.storage_cache.insert(key, (used, 0));

        Ok(used)
    }

    /// 确保添加新文件后不超出用户的存储配额
    pub async fn ensure_quota(
        &self,
        user_id: Option<Uuid>,
        additional_bytes: u64,
    ) -> anyhow::Result<(), AppError> {
        let storage_cfg = &config::CONFIG.file_storage;
        let reserved_bytes = storage_cfg.get_default_reserved();
        let max_quota = (storage_cfg.get_quota() - reserved_bytes) as u64;
        let current_usage = self.get_used_space(user_id).await?;

        if current_usage + additional_bytes <= max_quota {
            Ok(())
        } else {
            Err(AppError::UserQuotaExceeded(
                current_usage,
                additional_bytes,
                max_quota,
            ))
        }
    }

    pub fn reserve_quota(
        &self,
        user_id: Option<Uuid>,
        additional_bytes: u64,
    ) -> QuotaReservationGuard {
        let user_key = UsedSpaceCacheKey::from(user_id);
        QuotaReservationGuard::new(self.storage_cache.clone(), user_key, additional_bytes).unwrap()
    }

    pub async fn migrate_from_indexing(
        &self,
        indexing: &FileIndexingService,
    ) -> anyhow::Result<()> {
        let row = sqlx::query("SELECT id FROM files LIMIT 1")
            .fetch_optional(&self.pool)
            .await?;
        if row.is_some() {
            return Ok(());
        }

        let items = indexing.map_clone(|items| items.clone());

        let mut tx = self.pool.begin().await?;

        for item in items {
            let (sql, args) = build_inert_sql!(
                "files",
                [
                    ("id", item.get_uid()),
                    ("name", item.get_name()),
                    ("hash", item.get_hash()),
                    ("size", *item.get_size() as u32),
                    ("mimetype", item.get_content_type()),
                    ("extname", item.get_extension()),
                    ("ipaddr", item.get_ip()),
                    ("caption", item.get_caption()),
                    ("tags", item.get_tags().join(",")),
                    (
                        "metadata",
                        item.get_metadata()
                            .clone()
                            .map(|it| serde_json::to_string(&it).unwrap())
                    ),
                    ("created_at", Timestamp::from(*item.get_created()))
                ]
            );
            sqlx::query_with(&sql, args).execute(&mut *tx).await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub fn get_storage_dir(&self) -> &Path {
        self.dir.as_path()
    }
}

struct BuildResponseArgs<R>
where
    R: AsyncRead + AsyncSeek,
{
    only_head: bool,
    range: Option<String>,
    headers: Vec<(header::HeaderName, String)>,
    reader: R,
    total: u64,
}

fn build_response<R>(mut args: BuildResponseArgs<R>) -> anyhow::Result<impl IntoResponse, AppError>
where
    R: AsyncRead + AsyncSeek + Unpin + Send + 'static,
{
    let mut status_code = axum::http::StatusCode::OK;
    let mut body: Option<Body> = None;
    if let Some((ranges, raw_ranges)) = args
        .range
        .as_ref()
        .map(|range| parse_range(range, args.total))
        .and_then(|result| match result {
            Ok(r) => Some(r),
            Err(err) => {
                tracing::warn!(reason = ?err, "Unable to perform range reads");
                None
            }
        })
    {
        let mut content_length = ranges.iter().fold(0, |a, b| a + b.len());
        if !args.only_head {
            let boundaries = Boundaries::from_ranges(
                &ranges,
                args.total,
                &mut content_length,
                &mut args.headers[0].1,
            );
            let stream = SparseStreamReader::new(args.reader, ranges, boundaries).into_stream();
            body = Some(Body::from_stream(stream));
        }
        args.headers
            .push((header::CONTENT_LENGTH, content_length.to_string()));
        args.headers.push((
            header::CONTENT_RANGE,
            format!("bytes {}", format_ranges(&raw_ranges, args.total)),
        ));
        status_code = axum::http::StatusCode::PARTIAL_CONTENT;
    } else {
        args.headers
            .push((header::CONTENT_LENGTH, args.total.to_string()));
        args.headers.push((
            header::CACHE_CONTROL,
            "public, max-age=604800".to_string(), // 7 d
        ));
        if !args.only_head {
            body = Some(Body::from_stream(ReaderStream::new(args.reader)));
        }
    }
    let response = if let Some(body) = body {
        (
            status_code,
            axum::response::AppendHeaders(args.headers),
            body,
        )
            .into_response()
    } else {
        (status_code, axum::response::AppendHeaders(args.headers)).into_response()
    };
    Ok(response)
}

pub struct QuotaReservationGuard {
    cache: Arc<DashMap<UsedSpaceCacheKey, (u64, u64)>>,
    reservation_size: u64,
    user_key: UsedSpaceCacheKey,
}
impl QuotaReservationGuard {
    fn new(
        cache: Arc<DashMap<UsedSpaceCacheKey, (u64, u64)>>,
        user_key: UsedSpaceCacheKey,
        reservation_size: u64,
    ) -> anyhow::Result<QuotaReservationGuard> {
        let mut entry = cache.get_mut(&user_key).ok_or(anyhow::format_err!(
            "Failed to reserve {} bytes for user key {:?} in quota cache",
            reservation_size,
            user_key
        ))?;
        entry.value_mut().1 += reservation_size;
        drop(entry);
        Ok(Self {
            cache,
            user_key,
            reservation_size,
        })
    }
}
impl Drop for QuotaReservationGuard {
    fn drop(&mut self) {
        if let Some(mut entry) = self.cache.get_mut(&self.user_key) {
            entry.value_mut().1 -= self.reservation_size
        }
    }
}

type RawRanges = Vec<(Option<u64>, Option<u64>)>;
type ParsedRanges = Vec<Range<usize>>;
fn parse_range(range: &str, total: u64) -> Result<(ParsedRanges, RawRanges), AppError> {
    let raw_ranges =
        parse_range_from_str(range).map_err(|e| AppError::InvalidRange(e.to_string()))?;
    let mut parsed_ranges = Vec::with_capacity(raw_ranges.capacity());
    for range in raw_ranges.iter() {
        let (start, end) = match range {
            (Some(start), Some(end)) => (*start, *end + 1),
            (Some(start), None) => (*start, total),
            (None, Some(last)) => (total - (*last).min(total), total),
            _ => return Err(AppError::RangeNotSupported),
        };
        if start > total {
            return Err(AppError::RangeTooLarge);
        }
        // 如果指定了 range-end 则取部分值
        let end = end.min(total);
        if end <= start {
            return Err(AppError::RangeNotSatisfiable);
        }
        parsed_ranges.push(Range {
            start: start as usize,
            end: end as usize,
        });
    }
    Ok((parsed_ranges, raw_ranges))
}

fn check_record_exists<T>(record: Option<T>) -> anyhow::Result<T, AppError> {
    match record {
        Some(r) => Ok(r),
        None => Err(AppError::NotFound),
    }
}

pub fn build_filename(id: &Uuid, extname: Option<&str>) -> String {
    match extname {
        Some(ext) => format!("{}.{}", id, ext),
        None => id.to_string(),
    }
}
pub fn build_thumbnail_filename(id: &Uuid, extname: Option<&str>) -> String {
    format!("{}.thumbnail", build_filename(id, extname))
}

mod archive {
    use crate::common::InternalError;
    use crate::models::file::ArchiveEntry;
    use crate::utils::guess_mimetype_from_bytes;
    use anyhow::Context;
    use std::io;
    use std::io::SeekFrom;
    use std::path::PathBuf;
    use std::pin::Pin;
    use std::task::Poll;
    use tar::Archive;
    use tokio::fs::File;
    use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeek, AsyncSeekExt, AsyncWriteExt, ReadBuf};

    fn add_extension(path: &PathBuf, extension: impl AsRef<std::path::Path>) -> PathBuf {
        let mut path = PathBuf::from(path);
        match path.extension() {
            Some(ext) => {
                let mut ext = ext.to_os_string();
                ext.push(".");
                ext.push(extension.as_ref());
                path.set_extension(ext)
            }
            None => path.set_extension(extension.as_ref()),
        };
        path
    }
    pub(crate) async fn parse_entries(path: &PathBuf) -> anyhow::Result<Vec<ArchiveEntry>> {
        use sha2::{Digest, Sha256};
        use std::io::Read;

        let mut data = Vec::new();
        let idx_path = add_extension(path, "idx");
        'try_read_cache: {
            if idx_path.exists() {
                let mut file = if let Ok(file) = File::open(&idx_path).await {
                    file
                } else {
                    break 'try_read_cache;
                };
                let mut str = String::new();
                if let Err(_e) = file.read_to_string(&mut str).await {
                    break 'try_read_cache;
                };
                if let Ok(mut d) = serde_json::from_str::<Vec<ArchiveEntry>>(&str) {
                    data.append(&mut d);
                    return Ok(data);
                };
            }
        }
        let file = File::open(&path)
            .await
            .with_context(|| InternalError::AccessFileError {
                path: path.to_owned(),
            })?;
        let file = file.into_std().await;
        let mut archive = Archive::new(file);
        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?.to_string_lossy().to_string();
            let cap = entry.size().min(4096) as usize;
            let (mimetype, buf) = if cap > 0 {
                let mut guess_buf: Vec<u8> = vec![0; cap];
                entry.read_exact(&mut guess_buf)?;
                assert!(!guess_buf.is_empty());
                let mimetype =
                    guess_mimetype_from_bytes(&guess_buf, Some(&parse_extname_from_path(&path)));
                (Some(mimetype), Some(guess_buf))
            } else {
                (None, None)
            };
            let hash = if entry.header().entry_type().is_file() && buf.is_some() {
                let mut hasher = Sha256::new();
                let mut buf = buf.unwrap();
                hasher.update(&buf[0..buf.len()]);
                loop {
                    let n = entry.read(&mut buf)?;
                    if n == 0 {
                        break;
                    }
                    hasher.update(&buf[..n]);
                }
                let hash = format!("{:x}", hasher.finalize());
                Some(hash)
            } else {
                None
            };

            data.push(ArchiveEntry {
                path,
                mtime: entry.header().mtime()?,
                size: entry.size(),
                mimetype: mimetype.map(|it| it.to_string()),
                hash,
                entry_type: entry.header().entry_type().as_byte(),
                header_position: entry.raw_header_position(),
                file_position: entry.raw_file_position(),
            })
        }
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .create(true)
            .open(&idx_path)
            .await?;
        file.write_all(serde_json::to_string(&data)?.as_bytes())
            .await?;
        Ok(data)
    }
    pub(crate) fn parse_filename_from_path(path: &str) -> String {
        path.rsplit_once('/')
            .map(|(_, it)| it.to_string())
            .unwrap_or_default()
    }
    fn parse_extname_from_path(path: &str) -> String {
        path.rsplit_once('.')
            .map(|(_, it)| it.to_string())
            .unwrap_or_default()
    }

    pub struct ArchiveFileReader {
        inner: File,
        start: usize,
        end: usize,
        pos: usize,
    }
    impl ArchiveFileReader {
        pub async fn new(mut file: File, start: u64, size: u64) -> io::Result<Self> {
            file.seek(SeekFrom::Start(start)).await?;
            Ok(Self {
                inner: file,
                start: start as usize,
                end: (start + size) as usize,
                pos: start as usize,
            })
        }
    }

    impl AsyncSeek for ArchiveFileReader {
        fn start_seek(self: Pin<&mut Self>, pos: SeekFrom) -> io::Result<()> {
            let this = self.get_mut();
            let pos = match pos {
                SeekFrom::Start(offset) => this.start + offset as usize,
                SeekFrom::Current(offset) => (this.pos as i64 + offset) as usize,
                SeekFrom::End(offset) => (this.end as i64 + offset) as usize,
            };
            if pos < this.start || pos > this.end {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Seek out of range",
                ));
            }
            this.pos = pos;
            AsyncSeek::start_seek(Pin::new(&mut this.inner), SeekFrom::Start(pos as u64))?;
            Ok(())
        }

        fn poll_complete(
            self: Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> Poll<io::Result<u64>> {
            let this = self.get_mut();
            AsyncSeek::poll_complete(Pin::new(&mut this.inner), cx)
        }
    }
    impl AsyncRead for ArchiveFileReader {
        fn poll_read(
            self: Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
            dst: &mut ReadBuf<'_>,
        ) -> Poll<io::Result<()>> {
            let this = self.get_mut();
            let max_read_length = this.end - this.pos;
            if max_read_length == 0 {
                return Poll::Ready(Ok(()));
            }
            // 已填冲长度
            let previous_filled_len = dst.filled().len();
            // 剩余长度
            let remaining_len = dst.remaining().min(max_read_length);
            // println!("max_read_length: {max_read_length}, remaining_len: {remaining_len}");
            // 创建一个指定长度的切片
            let temporary_slice = dst.initialize_unfilled_to(remaining_len);
            let mut n_dst = ReadBuf::new(temporary_slice);
            let result = AsyncRead::poll_read(Pin::new(&mut this.inner), cx, &mut n_dst);
            if let Poll::Ready(Ok(())) = &result {
                let current_filled_len = n_dst.filled().len();
                let filled_len = current_filled_len - previous_filled_len;
                // println!("filled_len: {filled_len}, previous_filled_len: {previous_filled_len}, current_filled_len: {current_filled_len}");
                this.pos += filled_len;
                // 更新 filled 长度
                dst.advance(filled_len);
            }
            result
        }
    }
}

#[derive(Debug, Clone)]
pub enum IndexChange {
    Added(Uuid),
    Removed(Uuid),
}
impl IndexChange {
    pub fn to_json(&self) -> String {
        let (action, uid) = match self {
            IndexChange::Added(uid) => ("RECORD_ADDED", uid),
            IndexChange::Removed(uid) => ("RECORD_REMOVED", uid),
        };
        serde_json::json!({
            "type": action,
            "payload": uid
        })
        .to_string()
    }
}
