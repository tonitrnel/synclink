extern crate wasm_bindgen;

use sha2::{Digest, Sha256};
use wasm_bindgen::prelude::*;

type Hasher = sha2::digest::core_api::CoreWrapper<
    sha2::digest::core_api::CtVariableCoreWrapper<
        sha2::Sha256VarCore,
        sha2::digest::consts::U32,
        sha2::OidSha256,
    >,
>;

#[wasm_bindgen]
pub struct Sha256Binding {
    hasher: Hasher,
}

#[wasm_bindgen]
impl Sha256Binding {
    pub fn create() -> Self {
        let hasher = Sha256::new();
        Sha256Binding { hasher }
    }
    pub fn update(&mut self, bytes: Vec<u8>) {
        self.hasher.update(bytes)
    }
    pub fn finalize(self) -> Vec<u8> {
        self.hasher.finalize().to_vec()
    }
    pub fn digest(bytes: Vec<u8>) -> Vec<u8> {
        Sha256::digest(bytes).to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_hex(bytes: Vec<u8>) -> String {
        bytes
            .iter()
            .map(|it| format!("{:02x}", it))
            .collect::<String>()
    }

    #[test]
    fn test_partial_bytes_update_digest() {
        let str = "That perches in the soul";
        let bytes = str.as_bytes();
        let mut hasher = Sha256Binding::create();
        hasher.update(bytes[0..8].to_vec());
        hasher.update(bytes[8..].to_vec());
        assert_eq!(
            to_hex(hasher.finalize()),
            "a3ad9aac74e36b60c75c02151ca1de92f217b0d9a14c7130a40d396731bee2d7"
        )
    }

    #[test]
    fn test_direct_digest() {
        let str = "That perches in the soul";
        let bytes = str.as_bytes();
        assert_eq!(
            to_hex(Sha256Binding::digest(bytes.to_vec())),
            "a3ad9aac74e36b60c75c02151ca1de92f217b0d9a14c7130a40d396731bee2d7"
        )
    }
}
