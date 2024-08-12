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

fn generic_infer(buf: &[u8]) -> Option<String> {
    let kind = infer::get(buf)?;
    Some(String::from(kind.mime_type()))
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

fn parse_mimetype_from_bytes(bytes: &[u8]) -> Option<String> {
    if let Some(mime) = generic_infer(bytes) {
        return Some(mime);
    }
    if is_ant_fit(bytes) {
        return Some("application/vnd.ant.fit".to_string());
    }
    if is_plain_text(bytes) {
        return Some("text/plain".to_string());
    }
    if is_utf8_text(bytes) {
        return Some("text/plain".to_string());
    }
    None
}

fn map_extname_to_mime(ext: &str, default_mime: String) -> String {
    match ext {
        "md" if default_mime == "text/plain" => "text/markdown".to_string(),
        _ => default_mime,
    }
}
pub async fn guess_mimetype_from_path(path: PathBuf, content_type: Option<String>) -> String {
    let ext = path.extension().and_then(|it| it.to_str()).unwrap_or("");
    if let Some(content_type) = content_type {
        return map_extname_to_mime(ext, content_type);
    }
    let mut file = File::open(&path).await.ok().unwrap();
    let capacity = file
        .metadata()
        .await
        .ok()
        .map(|it| it.len())
        .unwrap_or(0)
        .min(4096) as usize;
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
    map_extname_to_mime(
        ext,
        mime.unwrap_or_else(|| String::from("application/octet-stream")),
    )
}
pub fn guess_mimetype_from_bytes(bytes: &[u8], ext: Option<&str>) -> String {
    let ext = ext.unwrap_or("");
    let mime = parse_mimetype_from_bytes(bytes);
    map_extname_to_mime(
        ext,
        mime.unwrap_or_else(|| String::from("application/octet-stream")),
    )
}
