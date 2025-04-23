#[macro_export]
/// 用于生成插入数据的 SQL
/// 
/// ## 示例
/// ```rust
/// let (sql, args) = build_inert_sql!(
///     "users", 
///     [
///         ("id", "445514"),
///         ("username", "hello")
///     ]
/// );
/// ```
macro_rules! build_inert_sql {
    ($table: expr, [$(($field: expr, $value: expr)), *]) => {
        {
            use sqlx::Arguments;
            let fields: &[&str] = &[$($field),*];
            let len = fields.len();
            let sql = {
                let fields = fields.join(", ");
                let placeholders = "?, ".repeat(len).trim_end_matches(", ").to_string();
                format!("INSERT INTO {} ({}) VALUES ({})", $table, fields, placeholders)
            };
            let mut args = sqlx::sqlite::SqliteArguments::default();
            $(args.add($value).map_err(|e|anyhow::format_err!("Failed to add '{}' value to args, reason: {}", $field, e))?;)*
            (sql, args)
        }
    };
}