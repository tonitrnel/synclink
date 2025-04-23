use anyhow::Context;
use std::path::Path;
use std::sync::{Arc, LazyLock};
use crate::models::file::ImageFileMetadata;

const ALLOW_IMAGE_MIMETYPES: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "image/avif"];

static APP: LazyLock<Arc<libvips::VipsApp>> = LazyLock::new(||{
    let app = libvips::VipsApp::new("image", false).expect("Failed to initialize VipsApp");
    app.concurrency_set(std::thread::available_parallelism().map(|it|it.get() / 2).unwrap_or(1).max(4) as i32);
    app.cache_set_max_mem(1024 * 1024 * 2);
    app.cache_set_max(0);
    app.cache_set_max_files(0);
    Arc::new(app)
});

enum ImageFormat {
    Jpeg,
    Png,
    Heic,
    Webp,
    Unknown,
}

impl From<&str> for ImageFormat {
    fn from(value: &str) -> Self {
        match value {
            "image/jpeg" => ImageFormat::Jpeg,
            "image/png" => ImageFormat::Png,
            "image/webp" => ImageFormat::Webp,
            "image/avif" => ImageFormat::Heic,
            // "image/gif" => ImageFormat::Gif,
            _ => ImageFormat::Unknown,
        }
    }
}

pub struct ImageService {
    format: ImageFormat,
    path: String,
}

impl ImageService {
    pub fn new(path: &Path, mimetype: &str) -> anyhow::Result<Self> {
        let format = ImageFormat::from(mimetype);
        Ok(Self {
            format,
            path: path.display().to_string(),
        })
    }
    pub async fn generate_thumbnail(
        &self,
        thumbnail_path: &Path,
        width: u32,
        height: u32,
    ) -> anyhow::Result<ImageFileMetadata> {
        let app = APP.clone();
        let image = libvips::VipsImage::new_from_file(&self.path).with_context(|| {
            format!("libvips error: {}", app.error_buffer().unwrap_or_default())
        })?;
        if (image.get_width() as u32) < width && (image.get_height() as u32) < height {
            return Ok(ImageFileMetadata {
                width: image.get_width() as u32,
                height: image.get_height() as u32,
                thumbnail_width: None,
                thumbnail_height: None,
            });
        }
        let options = libvips::ops::ThumbnailImageOptions {
            height: height as i32,
            import_profile: String::from("sRGB"),
            export_profile: String::from("sRGB"),
            ..libvips::ops::ThumbnailImageOptions::default()
        };
        let thumbnail = libvips::ops::thumbnail_image_with_opts(&image, width as i32, &options)
            .with_context(|| {
                format!("libvips error: {}", app.error_buffer().unwrap_or_default())
            })?;
        let thumbnail_path = thumbnail_path.display().to_string();
        match &self.format {
            ImageFormat::Jpeg => {
                let options = libvips::ops::JpegsaveOptions {
                    keep: libvips::ops::ForeignKeep::None,
                    background: vec![255.0],
                    optimize_coding: true,
                    optimize_scans: true,
                    interlace: true,
                    ..libvips::ops::JpegsaveOptions::default()
                };
                libvips::ops::jpegsave_with_opts(&thumbnail, &thumbnail_path, &options)
            }
            ImageFormat::Png => {
                let options = libvips::ops::PngsaveOptions {
                    keep: libvips::ops::ForeignKeep::None,
                    bitdepth: 8,
                    ..libvips::ops::PngsaveOptions::default()
                };
                libvips::ops::pngsave_with_opts(&thumbnail, &thumbnail_path, &options)
            }
            ImageFormat::Webp => {
                let options = libvips::ops::WebpsaveOptions {
                    keep: libvips::ops::ForeignKeep::None,
                    effort: 2,
                    ..libvips::ops::WebpsaveOptions::default()
                };
                libvips::ops::webpsave_with_opts(&thumbnail, &thumbnail_path, &options)
            }
            ImageFormat::Heic => {
                let options = libvips::ops::HeifsaveOptions {
                    compression: libvips::ops::ForeignHeifCompression::Av1,
                    keep: libvips::ops::ForeignKeep::None,
                    ..libvips::ops::HeifsaveOptions::default()
                };
                libvips::ops::heifsave_with_opts(&thumbnail, &thumbnail_path, &options)
            }
            ImageFormat::Unknown => libvips::ops::vipssave(&thumbnail, &thumbnail_path),
        }
            .with_context(|| {
                format!(
                    "Failed write thumbnail image file to {}, libvips error: {}",
                    thumbnail_path,
                    app.error_buffer().unwrap_or_default()
                )
            })?;
        let metadata = ImageFileMetadata {
            width: image.get_width() as u32,
            height: image.get_height() as u32,
            thumbnail_width: Some(thumbnail.get_width() as u32),
            thumbnail_height: Some(thumbnail.get_height() as u32),
        };
        Ok(metadata)
    }
    pub fn is_support(mime_type: &str) -> bool {
        ALLOW_IMAGE_MIMETYPES.contains(&mime_type)
    }
    pub async fn ensure_thumbnail(
        source_path: &Path,
        thumbnail_path: &Path,
        mimetype: &str,
        metadata: Option<ImageFileMetadata>,
    ) -> anyhow::Result<ImageFileMetadata> {
        let mut metadata = match metadata {
            Some(metadata) => metadata,
            // 重新生成缩略图
            _ => {
                let image = Self::new(source_path, mimetype)?;
                let metadata = image.generate_thumbnail(thumbnail_path, 500, 280).await?;
                return Ok(metadata);
            }
        };
        // 没有缩略图尺寸信息，读取获取
        if metadata.thumbnail_height.is_none() && thumbnail_path.exists() {
            let app = APP.clone();
            let thumbnail_path = thumbnail_path.display().to_string();
            let format = ImageFormat::from(mimetype);
            let image = match format {
                ImageFormat::Png => libvips::ops::pngload(&thumbnail_path),
                ImageFormat::Webp => libvips::ops::webpload(&thumbnail_path),
                ImageFormat::Jpeg => libvips::ops::jpegload(&thumbnail_path),
                ImageFormat::Heic => libvips::ops::heifload(&thumbnail_path),
                // ImageFormat::Gif => libvips::ops::gifload(&thumbnail_path),
                ImageFormat::Unknown => return Ok(metadata),
            }
                .with_context(|| {
                    format!(
                        "Unable to read thumbnail image file. path: {}, libvips error: {}",
                        thumbnail_path,
                        app.error_buffer().unwrap_or_default()
                    )
                })?;
            metadata.thumbnail_width = Some(image.get_width() as u32);
            metadata.thumbnail_height = Some(image.get_height() as u32);
        }
        Ok(metadata)
    }
}