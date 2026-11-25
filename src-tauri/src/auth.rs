use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;

#[derive(Debug, Default)]
pub struct SessionState {
    pub is_admin: bool,
    pub is_locked: bool,
}

impl SessionState {
    pub fn require_admin(&self) -> Result<(), String> {
        if !self.is_admin {
            return Err("需要管理员权限，请先登录管理员账号".to_string());
        }
        if self.is_locked {
            return Err("应用当前处于锁屏保护状态，请先输入密码解锁".to_string());
        }
        Ok(())
    }
}

pub fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| format!("密码加密失败: {}", e))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_argon2_hash_and_verify() {
        let hash = hash_password("admin123").expect("hash failed");
        assert!(verify_password("admin123", &hash));
        assert!(!verify_password("wrong", &hash));
    }

    #[test]
    fn test_session_guard_and_lock() {
        let mut s = SessionState::default();
        assert!(s.require_admin().is_err());
        s.is_admin = true;
        assert!(s.require_admin().is_ok());
        s.is_locked = true;
        assert!(s.require_admin().is_err());
        s.is_locked = false;
        assert!(s.require_admin().is_ok());
    }
}
