use crate::models::image::ImageMetadata;
use crate::{config, utils};
use serde::{Deserialize, Serialize};
use std::fmt::Write;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum EntityMetadata {
    Image(ImageMetadata),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Entity {
    /// assigned uid
    pub(super) uid: Uuid,
    /// created date of the content
    #[serde(
        serialize_with = "utils::serialize_i64_to_utc",
        deserialize_with = "utils::deserialize_utc_to_i64"
    )]
    pub(super) created: i64,
    /// modified date of the content
    #[serde(
        serialize_with = "utils::serialize_option_i64_to_utc",
        deserialize_with = "utils::deserialize_option_utc_to_i64",
        skip_serializing_if = "Option::is_none",
        default
    )]
    pub(super) modified: Option<i64>,
    /// original file name of the content
    pub(super) name: String,
    /// hash of the content
    pub(super) hash: String,
    /// length of content
    pub(super) size: u64,
    /// mime type of the content
    #[serde(rename = "type")]
    pub(super) content_type: String,
    /// original file extension of the content
    pub(super) ext: Option<String>,
    pub(super) host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) metadata: Option<EntityMetadata>,
}

#[allow(unused)]
impl Entity {
    pub fn get_uid(&self) -> &Uuid {
        &self.uid
    }
    pub fn get_filename(&self) -> String {
        if self.content_type == "text/plain" && self.ext.is_none() {
            format!("{}.txt", self.name)
        } else {
            self.name.to_string()
        }
    }
    pub fn get_resource(&self) -> String {
        match &self.ext {
            Some(ext) => format!("{}.{}", self.uid, ext),
            None => self.uid.to_string(),
        }
    }
    pub fn get_hash(&self) -> &str {
        &self.hash
    }
    pub fn get_name(&self) -> &str {
        &self.name
    }
    pub fn get_size(&self) -> &u64 {
        &self.size
    }
    pub fn get_content_type(&self) -> &str {
        &self.content_type
    }
    pub fn get_created(&self) -> &i64 {
        &self.created
    }
    pub fn get_modified(&self) -> &Option<i64> {
        &self.modified
    }
    pub fn get_created_date(&self) -> String {
        utils::i64_to_utc(&self.created).unwrap()
    }
    pub fn get_modified_date(&self) -> Option<String> {
        self.modified.map(|t| utils::i64_to_utc(&t).unwrap())
    }
    pub fn get_extension(&self) -> &Option<String> {
        &self.ext
    }
    pub fn get_host(&self) -> &Option<String> {
        &self.host
    }
    pub fn get_host_alias(&self) -> Option<&String> {
        let device_host_tags = &config::load().device_host_tags;
        self.host
            .as_ref()
            .zip(device_host_tags.as_ref())
            .and_then(|(host, tags)| tags.get(host))
    }
    pub fn get_metadata(&self) -> &Option<EntityMetadata> {
        &self.metadata
    }

    pub fn serialize_and_write(&self, writer: &mut String, key: &str) -> anyhow::Result<()> {
        write!(writer, "\n[[{}]]\n", key);
        let s = toml::to_string(&self)?.replacen("[metadata]", &format!("[{}.metadata]", key), 1);
        write!(writer, "{s}");
        Ok(())
    }
}

impl PartialEq for Entity {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}
