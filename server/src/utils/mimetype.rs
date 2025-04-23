use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

fn byte_range_matches(buf: &[u8], lower: usize, high: usize, sig: &str) -> bool {
    if high > buf.len() {
        return false;
    }
    buf[lower..high]
        .iter()
        .map(|b| format!("{:02X}", b))
        .zip(sig.split_whitespace())
        .all(|(byte, sig_byte)| sig_byte.contains(&byte))
}

fn generic_infer(buf: &[u8]) -> Option<&'static str> {
    let kind = infer::get(buf)?;
    Some(kind.mime_type())
}

// custom example
fn is_ant_fit(buf: &[u8]) -> bool {
    if !byte_range_matches(buf, 0, 1, "0E|0C") {
        return false;
    }
    if !byte_range_matches(buf, 8, 12, "2E 46 49 54") {
        return false;
    }
    true
}

fn is_plain_text(buf: &[u8]) -> bool {
    buf.iter()
        .take(256)
        .all(|b| b.is_ascii_graphic() || b.is_ascii_whitespace())
}

fn is_utf8_text(buf: &[u8]) -> bool {
    let mut end = buf.len().min(128) - 1;
    // Find the nearest ascii character
    while end < buf.len() {
        if buf[end].is_ascii_graphic() || buf[end].is_ascii_whitespace() {
            break;
        }
        end += 1;
    }
    simdutf8::basic::from_utf8(&buf[0..end]).is_ok()
}

fn parse_mimetype_from_bytes(bytes: &[u8]) -> Option<&'static str> {
    if let Some(mime) = generic_infer(bytes) {
        return Some(mime);
    }
    if is_ant_fit(bytes) {
        return Some("application/vnd.ant.fit");
    }
    if is_plain_text(bytes) {
        return Some("text/plain");
    }
    if is_utf8_text(bytes) {
        return Some("text/plain");
    }
    None
}

fn map_extname_to_mime<'a>(extname: &str, default_mimetype: &'a str) -> &'a str {
    match extname {
        "md" if default_mimetype == "text/plain" => "text/markdown",
        _ => default_mimetype,
    }
}
pub async fn guess_mimetype_from_path(path: PathBuf, content_type: Option<&str>) -> &str {
    let extname = path
        .extension()
        .map(|it| it.to_string_lossy())
        .unwrap_or_default();
    if let Some(content_type) = content_type {
        return map_extname_to_mime(&extname, content_type);
    }
    let file = File::open(&path).await.ok().unwrap();
    guess_mimetype_from_file(file, content_type, Some(&extname)).await
}
pub async fn guess_mimetype_from_file<'a>(
    mut file: File,
    content_type: Option<&'a str>,
    extname: Option<&str>,
) -> &'a str {
    if let Some(content_type) = content_type {
        return map_extname_to_mime(extname.unwrap_or_default(), content_type);
    }
    let metadata = file.metadata().await.ok();
    let capacity = metadata.map(|it| it.len()).unwrap_or(0).min(4096) as usize;
    let mime = 'try_parse: {
        if capacity == 0 {
            break 'try_parse None;
        }
        let mut buf = vec![0; capacity];
        if file.read_exact(&mut buf).await.ok().is_none() {
            break 'try_parse None;
        };
        parse_mimetype_from_bytes(&buf)
    };
    map_extname_to_mime(extname.unwrap_or_default(), mime.unwrap_or_else(|| "application/octet-stream"))
}
pub fn guess_mimetype_from_bytes<'a>(bytes: &[u8], extname: Option<&str>) -> &'a str {
    let extname = extname.unwrap_or("");
    let mimetype = parse_mimetype_from_bytes(bytes).unwrap_or_else(|| "application/octet-stream");
    map_extname_to_mime(extname, mimetype)
}
