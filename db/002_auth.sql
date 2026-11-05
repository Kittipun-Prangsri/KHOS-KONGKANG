-- =============================================================================
-- Migration 002: ระบบล็อกอิน (ผู้ใช้ที่อนุญาต, session, ประวัติการเข้าสู่ระบบ, audit)
-- รันบนฐาน computer_stock ด้วยบัญชี root/DBA — ห้ามรันบน hosoffice
-- =============================================================================
USE computer_stock;

-- ผู้ใช้ที่ "ได้รับอนุญาต" ให้ใช้ระบบคลัง (ยืนยันตัวตนด้วย HR_person แต่สิทธิ์เก็บที่นี่)
-- ไม่เก็บรหัสผ่านใด ๆ ในตารางนี้
CREATE TABLE IF NOT EXISTS app_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hr_username VARCHAR(100) NOT NULL UNIQUE,   -- ชื่อผู้ใช้ใน HR_person
    hr_person_id VARCHAR(50) NULL,
    display_name VARCHAR(150) NOT NULL,
    role ENUM('admin','staff','viewer') NOT NULL DEFAULT 'viewer',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL
) ENGINE=InnoDB;

-- session เก็บเฉพาะ "แฮช" ของโทเค็น (ถ้าฐานข้อมูลรั่ว ก็เอาไปสวมรอยไม่ได้)
CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
    INDEX idx_sessions_expires (expires_at)
) ENGINE=InnoDB;

-- บันทึกความพยายามเข้าสู่ระบบ ใช้จำกัดจำนวนครั้ง (กันเดารหัส)
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    ip VARCHAR(64) NULL,
    success TINYINT(1) NOT NULL,
    reason VARCHAR(30) NULL,
    attempted_at DATETIME NOT NULL,
    INDEX idx_attempts_user (username, attempted_at),
    INDEX idx_attempts_ip (ip, attempted_at)
) ENGINE=InnoDB;

-- ประวัติการใช้งาน: ใครทำอะไรเมื่อไร (ตรวจสอบย้อนหลังได้)
CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NULL,
    entity_id VARCHAR(50) NULL,
    detail TEXT NULL,
    ip VARCHAR(64) NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_audit_time (created_at),
    INDEX idx_audit_user (user_id)
) ENGINE=InnoDB;
