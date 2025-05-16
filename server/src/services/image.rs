use crate::models::file::ImageFileMetadata;
use std::path::{Path, PathBuf};

#[derive(Debug, Copy, Clone)]
enum ImageFormat {
    Jpeg,
    Png,
    Heic,
    Webp,
    Unknown,
}

impl ImageFormat {
    fn as_mimetype(&self) -> &'static str {
        match self {
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Png => "image/png",
            ImageFormat::Heic => "image/avif",
            ImageFormat::Webp => "image/webp",
            ImageFormat::Unknown => "application/octet-stream",
        }
    }
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
    path: PathBuf,
    mimetype: String,
}

impl ImageService {
    pub fn new(path: &Path, mimetype: &str) -> anyhow::Result<Self> {
        let format = ImageFormat::from(mimetype);
        Ok(Self {
            format,
            path: path.to_path_buf(),
            mimetype: mimetype.to_string(),
        })
    }
    pub async fn generate_thumbnail(
        &self,
        thumbnail_path: &Path,
        width: u32,
        height: u32,
    ) -> anyhow::Result<ImageFileMetadata> {
        let format = self.format;
        let src_path = self.path.clone();
        let dst_path = thumbnail_path.to_path_buf();
        let metadata = tokio::task::spawn_blocking(move || {
            #[cfg(feature = "image-rs")]
            {
                imagers_impl::generate_thumbnail(&src_path, &dst_path, width, height, format)
            }
            #[cfg(feature = "image-libvips")]
            {
                libvips_impl::generate_thumbnail(&src_path, &dst_path, width, height, format)
            }
        })
        .await??;
        Ok(metadata)
    }

    pub fn is_support(mime_type: &str) -> bool {
        #[cfg(feature = "image-rs")]
        {
            imagers_impl::ALLOW_IMAGE_MIMETYPES.contains(&mime_type)
        }
        #[cfg(feature = "image-libvips")]
        {
            libvips_impl::ALLOW_IMAGE_MIMETYPES.contains(&mime_type)
        }
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
            let (width, height) = {
                #[cfg(feature = "image-rs")]
                {
                    imagers_impl::size(thumbnail_path, mimetype)?
                }
                #[cfg(feature = "image-libvips")]
                {
                    libvips_impl::size(thumbnail_path, mimetype)?
                }
            };
            metadata.thumbnail_width = Some(width);
            metadata.thumbnail_height = Some(height);
        }
        Ok(metadata)
    }
}

#[cfg(feature = "image-libvips")]
mod libvips_impl {
    use crate::models::file::ImageFileMetadata;
    use crate::services::image::ImageFormat;
    use anyhow::Context;
    use std::path::Path;
    use std::sync::{Arc, LazyLock};

    pub const ALLOW_IMAGE_MIMETYPES: [&str; 4] =
        ["image/jpeg", "image/png", "image/webp", "image/avif"];

    static APP: LazyLock<Arc<libvips::VipsApp>> = LazyLock::new(|| {
        let app = libvips::VipsApp::new("image", false).expect("Failed to initialize VipsApp");
        app.concurrency_set(
            std::thread::available_parallelism()
                .map(|it| it.get() / 2)
                .unwrap_or(1)
                .max(4) as i32,
        );
        app.cache_set_max_mem(1024 * 1024 * 2);
        app.cache_set_max(0);
        app.cache_set_max_files(0);
        Arc::new(app)
    });

    pub fn generate_thumbnail(
        src_path: &Path,
        dst_path: &Path,
        max_width: u32,
        max_height: u32,
        format: ImageFormat,
    ) -> anyhow::Result<ImageFileMetadata> {
        let app = APP.clone();
        let image = libvips::VipsImage::new_from_file(&src_path.to_string_lossy()).with_context(|| {
            format!(
                "libvips error: {}, path: {src_path:?}",
                app.error_buffer().unwrap_or_default()
            )
        })?;
        if (image.get_width() as u32) < max_width && (image.get_height() as u32) < max_height {
            return Ok(ImageFileMetadata {
                width: image.get_width() as u32,
                height: image.get_height() as u32,
                thumbnail_width: None,
                thumbnail_height: None,
            });
        }
        let options = libvips::ops::ThumbnailImageOptions {
            height: max_height as i32,
            import_profile: String::from("sRGB"),
            export_profile: String::from("sRGB"),
            ..libvips::ops::ThumbnailImageOptions::default()
        };
        let thumbnail = libvips::ops::thumbnail_image_with_opts(&image, max_width as i32, &options)
            .with_context(|| {
                format!("libvips error: {}", app.error_buffer().unwrap_or_default())
            })?;
        let thumbnail_path = dst_path.display().to_string();
        match &format {
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
    pub fn size(path: &Path, mimetype: &str) -> anyhow::Result<(u32, u32)> {
        let app = APP.clone();
        let thumbnail_path = path.display().to_string();
        let format = ImageFormat::from(mimetype);
        let image = match format {
            ImageFormat::Png => libvips::ops::pngload(&thumbnail_path),
            ImageFormat::Webp => libvips::ops::webpload(&thumbnail_path),
            ImageFormat::Jpeg => libvips::ops::jpegload(&thumbnail_path),
            ImageFormat::Heic => libvips::ops::heifload(&thumbnail_path),
            // ImageFormat::Gif => libvips::ops::gifload(&thumbnail_path),
            ImageFormat::Unknown => libvips::ops::vipsload(&thumbnail_path),
        }
        .with_context(|| {
            format!(
                "Unable to read thumbnail image file. path: {}, libvips error: {}",
                thumbnail_path,
                app.error_buffer().unwrap_or_default()
            )
        })?;
        Ok((image.get_width() as u32, image.get_height() as u32))
    }
}

#[cfg(feature = "image-rs")]
mod imagers_impl {
    use crate::models::file::ImageFileMetadata;
    use crate::services::image::ImageFormat;
    use anyhow::Context;
    use std::path::Path;

    pub const ALLOW_IMAGE_MIMETYPES: [&str; 4] =
        ["image/jpeg", "image/png", "image/webp", "image/avif"];

    pub fn generate_thumbnail(
        src_path: &Path,
        dst_path: &Path,
        max_width: u32,
        max_height: u32,
        format: ImageFormat,
    ) -> anyhow::Result<ImageFileMetadata> {
        let file = std::fs::File::open(src_path)
            .with_context(|| format!("Failed to open {}", src_path.display()))?;
        let reader = std::io::BufReader::new(file);
        let format = image::ImageFormat::from_mime_type(format.as_mimetype())
            .with_context(|| "Invalid image mime type")?;
        let img = image::load(reader, format)?;
        let width = img.width();
        let height = img.height();
        if width <= max_width && height <= max_height {
            let metadata = ImageFileMetadata {
                width,
                height,
                thumbnail_width: None,
                thumbnail_height: None,
            };
            return Ok(metadata);
        }
        let thumbnail = img.thumbnail(max_width, max_height);
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .open(dst_path)
            .with_context(|| {
                format!(
                    "Failed to create thumbnail image file, path = {:?}",
                    dst_path
                )
            })?;
        let metadata = ImageFileMetadata {
            width,
            height,
            thumbnail_width: Some(thumbnail.width()),
            thumbnail_height: Some(thumbnail.height()),
        };
        thumbnail.write_to(&mut file, format)?;

        Ok(metadata)
    }

    pub fn size(path: &Path, mimetype: &str) -> anyhow::Result<(u32, u32)> {
        let file = std::fs::File::open(path)
            .with_context(|| format!("Failed to open {}", path.display()))?;
        let reader = std::io::BufReader::new(file);
        let format = image::ImageFormat::from_mime_type(mimetype)
            .with_context(|| format!("Invalid image mime type: {}", mimetype))?;
        let img = image::load(reader, format)?;
        let width = img.width();
        let height = img.height();
        Ok((width, height))
    }
}
