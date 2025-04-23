use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PaginationDto<T>
where
    T: Serialize,
{
    pub total: u32,
    pub data: Vec<T>,
}
