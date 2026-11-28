use std::io::{Read, Write};

use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use ring::aead::{self, Aad, LessSafeKey, Nonce, UnboundKey};
use ring::digest;
use ring::rand::{SecureRandom, SystemRandom};

const ENVELOPE_MAGIC: &[u8; 8] = b"ILENC01\0";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const SALT_LEN: usize = 16;
const VERIFIER_AAD: &[u8] = b"instrument-ledger-e2ee-verifier";
const VERIFIER_PLAINTEXT: &[u8] = b"InstrumentLedger-E2EE-Verify-v1";

pub const E2EE_ALGORITHM: &str = "argon2id-aes256gcm-v1";

pub fn sha256_hex(data: &[u8]) -> String {
    let d = digest::digest(&digest::SHA256, data);
    hex::encode(d.as_ref())
}

pub fn generate_random_salt() -> Result<Vec<u8>, String> {
    let rng = SystemRandom::new();
    let mut salt = vec![0u8; SALT_LEN];
    rng.fill(&mut salt)
        .map_err(|_| "生成随机加密盐值失败".to_string())?;
    Ok(salt)
}

pub fn salt_id_from_bytes(salt: &[u8]) -> String {
    let hash = sha256_hex(salt);
    hash.chars().take(12).collect()
}

pub fn encode_b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn decode_b64(encoded: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| format!("Base64 解码失败: {}", e))
}

/// Derives a 256-bit AES-GCM key from user passphrase + repository salt using Argon2id.
/// Parameters: 32 MiB RAM, 3 iterations, 1 lane — strong offline brute-force resistance
/// while remaining responsive (~30ms release) on standard office desktops.
pub fn derive_e2ee_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    if passphrase.is_empty() {
        return Err("加密口令不能为空".to_string());
    }
    if salt.len() < 8 {
        return Err("无效的加密盐值".to_string());
    }
    let params = Params::new(32 * 1024, 3, 1, Some(32))
        .map_err(|e| format!("初始化密钥派生参数失败: {}", e))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("派生端到端加密密钥失败: {}", e))?;
    Ok(key)
}

pub fn encrypt_bytes(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let rng = SystemRandom::new();
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill(&mut nonce_bytes)
        .map_err(|_| "生成加密随机数失败".to_string())?;

    let unbound = UnboundKey::new(&aead::AES_256_GCM, key)
        .map_err(|_| "初始化 AES-256-GCM 密钥失败".to_string())?;
    let cipher = LessSafeKey::new(unbound);

    let mut buffer = plaintext.to_vec();
    cipher
        .seal_in_place_append_tag(
            Nonce::assume_unique_for_key(nonce_bytes),
            Aad::from(aad),
            &mut buffer,
        )
        .map_err(|_| "数据加密失败".to_string())?;

    let mut out = Vec::with_capacity(ENVELOPE_MAGIC.len() + NONCE_LEN + buffer.len());
    out.extend_from_slice(ENVELOPE_MAGIC);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&buffer);
    Ok(out)
}

pub fn decrypt_bytes(key: &[u8; 32], aad: &[u8], payload: &[u8]) -> Result<Vec<u8>, String> {
    let min_len = ENVELOPE_MAGIC.len() + NONCE_LEN + TAG_LEN;
    if payload.len() < min_len || &payload[..ENVELOPE_MAGIC.len()] != ENVELOPE_MAGIC {
        return Err("加密数据格式无效或已损坏".to_string());
    }

    let nonce_start = ENVELOPE_MAGIC.len();
    let nonce_end = nonce_start + NONCE_LEN;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    nonce_bytes.copy_from_slice(&payload[nonce_start..nonce_end]);

    let unbound = UnboundKey::new(&aead::AES_256_GCM, key)
        .map_err(|_| "初始化 AES-256-GCM 密钥失败".to_string())?;
    let cipher = LessSafeKey::new(unbound);

    let mut ciphertext = payload[nonce_end..].to_vec();
    let plaintext = cipher
        .open_in_place(
            Nonce::assume_unique_for_key(nonce_bytes),
            Aad::from(aad),
            &mut ciphertext,
        )
        .map_err(|_| "解密失败：加密口令不正确或云端数据已损坏".to_string())?;

    Ok(plaintext.to_vec())
}

pub fn create_key_verifier(key: &[u8; 32]) -> Result<String, String> {
    let encrypted = encrypt_bytes(key, VERIFIER_AAD, VERIFIER_PLAINTEXT)?;
    Ok(encode_b64(&encrypted))
}

pub fn verify_key_with_verifier(key: &[u8; 32], verifier_b64: &str) -> bool {
    let Ok(raw) = decode_b64(verifier_b64) else {
        return false;
    };
    match decrypt_bytes(key, VERIFIER_AAD, &raw) {
        Ok(pt) => pt.as_slice() == VERIFIER_PLAINTEXT,
        Err(_) => false,
    }
}

pub fn gzip_compress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(data)
        .map_err(|e| format!("压缩同步快照失败: {}", e))?;
    encoder
        .finish()
        .map_err(|e| format!("完成快照压缩失败: {}", e))
}

pub fn gzip_decompress(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|e| format!("解压云端快照失败: {}", e))?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_e2ee_roundtrip_and_aad_binding() {
        let salt = generate_random_salt().unwrap();
        let key = derive_e2ee_key("MyStrongPass#2026", &salt).unwrap();
        let verifier = create_key_verifier(&key).unwrap();
        assert!(verify_key_with_verifier(&key, &verifier));

        let wrong_key = derive_e2ee_key("WrongPass#2026", &salt).unwrap();
        assert!(!verify_key_with_verifier(&wrong_key, &verifier));

        let plaintext = b"JSSK-MPR-170 sensitive calibration report bytes";
        let enc = encrypt_bytes(&key, b"blob:abc123", plaintext).unwrap();
        assert_ne!(&enc[..], plaintext);

        let dec = decrypt_bytes(&key, b"blob:abc123", &enc).unwrap();
        assert_eq!(dec, plaintext);

        // Wrong AAD must reject tampering / blob swapping
        assert!(decrypt_bytes(&key, b"blob:other", &enc).is_err());
        // Wrong key must fail authentication tag
        assert!(decrypt_bytes(&wrong_key, b"blob:abc123", &enc).is_err());
    }

    #[test]
    fn test_gzip_roundtrip() {
        let data = b"InstrumentLedger SQLite payload ".repeat(200);
        let compressed = gzip_compress(&data).unwrap();
        assert!(compressed.len() < data.len());
        let restored = gzip_decompress(&compressed).unwrap();
        assert_eq!(restored, data);
    }
}
