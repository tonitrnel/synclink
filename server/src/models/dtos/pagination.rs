use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PaginationDto<T>
where
    T: Serialize,
{
    pub has_prev: bool,
    pub data: Vec<T>,
    pub has_next: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,
}
