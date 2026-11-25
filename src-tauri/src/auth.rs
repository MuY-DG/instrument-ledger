use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Utc};
use rand_core::OsRng;

#[derive(Debug, Default)]
pub struct SessionState {
    pub is_admin: bool,
    pub is_locked: bool,
    pub admin_expires_at: Option<DateTime<Utc>>,
}

impl SessionState {
    /// Checks whether a persisted admin session has expired.
    /// Returns `true` if the session was active and just expired.
    pub fn check_and_expire(&mut self) -> bool {
        if self.is_admin {
            if let Some(exp) = self.admin_expires_at {
                if Utc::now() >= exp {
                    self.is_admin = false;
                    self.admin_expires_at = None;
                    return true;
                }
            }
        }
        false
    }

    pub fn require_admin(&self) -> Result<(), String> {
        if !self.is_admin {
            return Err("需要管理员权限，请先登录管理员账号".to_string());
        }
        if let Some(exp) = self.admin_expires_at {
            if Utc::now() >= exp {
                return Err("管理员登录已过期，请重新登录".to_string());
            }
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

pub fn validate_pin(pin: &str) -> Result<usize, String> {
    if !(4..=6).contains(&pin.len()) || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("应用锁 PIN 码必须为 4 到 6 位纯数字".to_string());
    }
    Ok(pin.len())
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
    fn test_validate_pin() {
        assert_eq!(validate_pin("1234").unwrap(), 4);
        assert_eq!(validate_pin("01234").unwrap(), 5);
        assert_eq!(validate_pin("987654").unwrap(), 6);
        assert!(validate_pin("123").is_err());
        assert!(validate_pin("1234567").is_err());
        assert!(validate_pin("12a4").is_err());
        assert!(validate_pin(" 1234").is_err());
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

    #[test]
    fn test_session_expiration() {
        use chrono::Duration;
        let mut s = SessionState {
            is_admin: true,
            is_locked: false,
            admin_expires_at: Some(Utc::now() + Duration::days(7)),
        };
        assert!(!s.check_and_expire());
        assert!(s.require_admin().is_ok());

        s.admin_expires_at = Some(Utc::now() - Duration::seconds(5));
        assert!(s.require_admin().is_err());
        assert!(s.check_and_expire());
        assert!(!s.is_admin);
        assert!(s.admin_expires_at.is_none());
    }
}
