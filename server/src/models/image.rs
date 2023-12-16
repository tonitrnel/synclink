use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageMetadata {
    width: u32,
    height: u32,
}

const IMAGE_MIMES: [&str; 5] = [
    "image/jpeg",
    "image/bmp",
    "image/png",
    "image/webp",
    "image/avif",
];

pub struct Image {
    img: image::DynamicImage,
    format: image::ImageFormat,
}

impl Image {
    pub async fn new(path: PathBuf, mime_type: String) -> anyhow::Result<Self> {
        let (img, format) = tokio::task::spawn_blocking(
            move || -> anyhow::Result<(image::DynamicImage, image::ImageFormat)> {
                let file = std::fs::File::open(path)?;
                let reader = std::io::BufReader::new(file);
                let format = image::ImageFormat::from_mime_type(mime_type)
                    .with_context(|| "Invalid image mime type")?;
                Ok((image::load(reader, format)?, format))
            },
        )
        .await??;
        Ok(Self { img, format })
    }
    pub fn get_metadata(&self) -> ImageMetadata {
        ImageMetadata {
            width: self.img.width(),
            height: self.img.height(),
        }
    }
    pub async fn generate_thumbnail(
        &self,
        path: PathBuf,
        max_width: u32,
        max_height: u32,
    ) -> anyhow::Result<()> {
        let thumbnail = self.img.thumbnail(max_width, max_height);
        let mut file = tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(&path)
            .await
            .with_context(|| format!("failed to create thumbnail image file, path = {:?}", path))?;
        let mut cursor = Cursor::new(vec![]);
        thumbnail.write_to(&mut cursor, self.format)?;
        cursor.set_position(0);
        tokio::io::copy(&mut cursor, &mut file).await?;
        Ok(())
    }
    pub fn is_support(mime_type: &str) -> bool {
        IMAGE_MIMES.contains(&mime_type)
    }
}
