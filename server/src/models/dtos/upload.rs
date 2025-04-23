use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct UploadQueryDto{
    pub tags: Option<String>,
    pub caption: Option<String>,
    pub hash: Option<String>,
    pub filename: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct UploadHeaderDto {
    pub content_type: Option<String>,
    pub content_length: u64,
    // pub user_agent: String,
}

#[derive(Debug, Deserialize)]
pub struct StartSessionQueryDto {
    pub hash: Option<String>,
    pub size: u64,
}

#[derive(Debug, Deserialize)]
pub struct AppendPartQueryDto {
    pub start: u64
}

#[derive(Debug, Deserialize)]
pub struct FinalizeQueryDto {
    pub tags: Option<String>,
    pub caption: Option<String>,
    pub filename: Option<String>,
    pub mimetype: Option<String>
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct FinalizeHeaderDto{
    // pub user_agent: String
}

#[derive(Debug, Deserialize)]
pub struct PreflightQueryDto{
    pub size: u64,
    pub hash: Option<String>,
}