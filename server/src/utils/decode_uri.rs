use anyhow::Context;

pub fn decode_uri(uri: &str) -> anyhow::Result<String> {
    let mut bytes = Vec::with_capacity(uri.len());
    let chars = uri.chars().collect::<Vec<_>>();
    let len = uri.len();
    let mut idx = 0;
    while idx < len {
        match chars[idx] {
            '%' => {
                if idx + 2 > len {
                    return Err(anyhow::format_err!("malformed URI sequence"));
                }
                bytes.push(u8::from_str_radix(
                    chars[(idx + 1)..(idx + 3)]
                        .iter()
                        .collect::<String>()
                        .as_str(),
                    16,
                )?);
                idx += 2;
            }
            chr => bytes.push(chr as u8),
        }
        idx += 1;
    }
    String::from_utf8(bytes).with_context(|| "URIError")
}

#[test]
fn test() {
    assert_eq!(
        decode_uri("@%F0%9F%A4%A3$%25GA%25$#%E6%9D%A0%25%5E").unwrap(),
        "@🤣$%GA%$#杠%^"
    );
}
