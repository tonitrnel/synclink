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
    let kind = infer::get(&buf)?;
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

async fn parse_from_file_magic(path: &PathBuf) -> Option<String> {
    let mut file = File::open(path).await.ok()?;
    let capacity = file.metadata().await.ok()?.len().min(8192) as usize;
    let mut buf = vec![0; capacity];
    file.read_exact(&mut buf).await.ok()?;
    if let Some(mime) = generic_infer(&buf) {
        return Some(mime);
    }
    if is_ant_fit(&buf) {
        return Some("application/vnd.ant.fit".to_string());
    }
    if is_plain_text(&buf) {
        return Some("text/plain".to_string());
    }
    if is_utf8_text(&buf) {
        return Some("text/plain".to_string());
    }
    None
}

pub async fn mimetype_infer(path: PathBuf, content_type: Option<String>) -> String {
    if let Some(content_type) = content_type {
        return content_type;
    }
    if let Some(mime) = parse_from_file_magic(&path).await {
        let ext = path.extension().and_then(|it| it.to_str()).unwrap_or("");
        if mime == "text/plain" {
            return match ext {
                "md" => "text/markdown".to_string(),
                _ => mime,
            };
        }
        return mime;
    }
    String::from("application/octet-stream")
}
