mod decode_uri;
pub mod file_helper;
mod mimetype;
mod sequential_ranges_stream;
mod utc_to_i64;

pub use decode_uri::*;
pub use mimetype::*;
pub use sequential_ranges_stream::*;
pub use utc_to_i64::*;

/// read last_modified from file metadata
pub fn parse_last_modified(metadata: &std::fs::Metadata) -> Option<String> {
    let modified = metadata.modified().ok()?;
    let utc_date = chrono::DateTime::<chrono::Utc>::from(modified);
    Some(utc_date.format("%a, %d %b %Y %H:%M:%S GMT").to_string())
}

pub fn parse_ranges(range_value: &str) -> anyhow::Result<Vec<(Option<u64>, Option<u64>)>> {
    let mut is_end = false;
    let ranges = range_value.trim_start_matches("bytes=").split(',');
    let mut vec = Vec::new();
    for range_str in ranges {
        if is_end {
            return Err(anyhow::format_err!(
                "Invalid Range: range should be continuous, non-overlapping ranges, check '{}'",
                range_str
            ));
        }
        if !range_str.contains('-') {
            return Err(anyhow::format_err!(
                "Invalid Range: parse range failed, Please make sure that '{}' is correct",
                range_str
            ));
        }
        let mut parts = range_str.trim().splitn(2, '-');
        let start = parts.next().and_then(|it| it.parse::<u64>().ok());
        let end = parts.next().and_then(|it| it.parse::<u64>().ok());
        if start.is_none() && end.is_none() {
            return Err(anyhow::format_err!(
                "Invalid Range: parse range failed, Please make sure that '{}' is correct",
                range_str
            ));
        }
        if start.is_none() || end.is_none() {
            is_end = true;
        }
        vec.push((start, end))
    }
    Ok(vec)
}

#[allow(unused)]
pub fn format_ranges(ranges: &[(Option<u64>, Option<u64>)], total: u64) -> String {
    ranges
        .iter()
        .filter_map(|(start, end)| match (start, end) {
            // 指定范围的片段
            (Some(start), Some(end)) => Some(format!("{}-{}/{}", start, end.min(&total), total)),
            // 指定起始点
            (Some(start), None) => Some(format!("{}-{}/{}", start, total - 1, total)),
            // 指定末尾的直接数
            (None, Some(last)) => {
                let last = last.min(&total);
                Some(format!("{}-{}/{}", total - last, total - 1, total))
            }
            _ => None,
        })
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_last_modified() {
        let metadata = std::fs::metadata(".gitignore").unwrap();
        println!("{:?}", parse_last_modified(&metadata));
        assert!(parse_last_modified(&metadata).is_some())
    }

    #[test]
    fn test_parse_ranges() {
        // similar request all bytes of file
        assert_eq!(parse_ranges("bytes=0-").unwrap(), vec![(Some(0), None)]);
        // request from 9500 byte to the end of file
        assert_eq!(
            parse_ranges("bytes=9500-").unwrap(),
            vec![(Some(9500), None)]
        );
        assert_eq!(parse_ranges("bytes=1-").unwrap(), vec![(Some(1), None)]);
        assert!(parse_ranges("bytes=5-, 4-5").is_err());
        assert_eq!(parse_ranges("bytes=1-2").unwrap(), vec![(Some(1), Some(2))]);
        assert_eq!(parse_ranges("bytes=-2").unwrap(), vec![(None, Some(2))]);
        assert_eq!(
            parse_ranges("bytes=0-0,-1").unwrap(),
            vec![(Some(0), Some(0)), (None, Some(1))]
        );
        assert!(parse_ranges("bytes=").is_err());
        assert_eq!(
            parse_ranges("bytes=500-600,601-999").unwrap(),
            vec![(Some(500), Some(600)), (Some(601), Some(999))]
        );
        assert!(parse_ranges("bytes=ao-fg").is_err());
    }

    #[test]
    fn test_format_ranges() {
        assert_eq!(format_ranges(&[(Some(0), Some(500))], 500), "0-499/500");
        assert_eq!(format_ranges(&[(Some(0), Some(600))], 500), "0-499/500");
        assert_eq!(format_ranges(&[(Some(0), None)], 500), "0-500/500");
        assert_eq!(format_ranges(&[(None, Some(0))], 500), "499-499/500");
        assert_eq!(format_ranges(&[(None, Some(1))], 500), "499-500/500");
        assert_eq!(
            format_ranges(&[(Some(0), Some(0)), (None, Some(1))], 500),
            "0-0/500, 499-500/500"
        );
        assert_eq!(format_ranges(&[], 500), "");
        assert_eq!(format_ranges(&[(None, None)], 500), "");
        assert_eq!(
            format_ranges(&[(Some(1), None), (None, None)], 500),
            "1-*/500"
        );
        assert_eq!(
            format_ranges(&[(Some(0), Some(0)), (None, None), (None, Some(1))], 500),
            "0-0/500, 499-500/500"
        );
    }
}
