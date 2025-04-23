use base64::{engine::general_purpose::URL_SAFE_NO_PAD, DecodeError, Engine as _};

pub fn encode(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}
pub fn decode(s: &str) -> Result<Vec<u8>, DecodeError> {
    URL_SAFE_NO_PAD.decode(s)
}