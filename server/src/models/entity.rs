use crate::models::image::ImageMetadata;
use crate::{config, utils};
use serde::{Deserialize, Serialize};
use std::fmt::Write;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum EntityMetadata {
    Image(ImageMetadata),
}

impl EntityMetadata {
    pub fn try_into_image(self) -> Option<ImageMetadata> {
        match self {
            EntityMetadata::Image(metadata) => Some(metadata),
        }
    }
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
    pub(super) ip: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(super) caption: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(super) tags: Vec<String>,
    #[serde(skip_serializing, default)]
    pub(super) metadata: Option<EntityMetadata>,
}

impl Entity {
    #[inline]
    pub fn get_uid(&self) -> &Uuid {
        &self.uid
    }
    #[inline]
    pub fn get_filename(&self) -> String {
        if self.content_type == "text/plain" && self.ext.is_none() {
            format!("{}.txt", self.name)
        } else {
            self.name.to_string()
        }
    }
    #[inline]
    pub fn get_resource(&self) -> String {
        match &self.ext {
            Some(ext) => format!("{}.{}", self.uid, ext),
            None => self.uid.to_string(),
        }
    }
    #[inline]
    pub fn get_hash(&self) -> &str {
        &self.hash
    }
    #[inline]
    pub fn get_name(&self) -> &str {
        &self.name
    }
    #[inline]
    pub fn get_size(&self) -> &u64 {
        &self.size
    }
    #[inline]
    pub fn get_tags(&self) -> &[String] {
        &self.tags
    }
    #[inline]
    pub fn get_caption(&self) -> &str {
        &self.caption
    }
    #[inline]
    pub fn get_content_type(&self) -> &str {
        &self.content_type
    }
    #[inline]
    pub fn get_created(&self) -> &i64 {
        &self.created
    }
    #[inline]
    pub fn get_modified(&self) -> &Option<i64> {
        &self.modified
    }
    #[inline]
    pub fn get_created_date(&self) -> String {
        utils::i64_to_utc(&self.created).unwrap()
    }
    #[inline]
    pub fn get_modified_date(&self) -> Option<String> {
        self.modified.map(|t| utils::i64_to_utc(&t).unwrap())
    }
    #[inline]
    pub fn get_extension(&self) -> &Option<String> {
        &self.ext
    }
    #[inline]
    pub fn get_ip(&self) -> &Option<String> {
        &self.ip
    }
    #[inline]
    pub fn get_ip_alias(&self) -> Option<&String> {
        let device_ip_tags = &config::CONFIG.device_ip_tags;
        self.ip
            .as_ref()
            .zip(device_ip_tags.as_ref())
            .and_then(|(ip, tags)| tags.get(ip))
    }
    #[inline]
    pub fn get_metadata(&self) -> &Option<EntityMetadata> {
        &self.metadata
    }
    pub fn serialize_and_write(&self, writer: &mut String, key: &str) -> anyhow::Result<()> {
        writeln!(writer, "[[{}]]", key)?;
        write!(writer, "{}", toml::to_string(&self)?)?;
        if let Some(metadata) = &self.metadata {
            let s = toml::to_string(metadata)?;
            #[allow(clippy::write_literal)]
            writeln!(
                writer,
                "metadata = {prefix}{value}{suffix}",
                prefix = "{ ",
                suffix = " }",
                value = s.trim_end().replace('\n', ", ")
            )?;
        }
        writeln!(writer)?;
        Ok(())
    }
}

impl PartialEq for Entity {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}
