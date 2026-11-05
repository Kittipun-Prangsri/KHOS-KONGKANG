-- =============================================================================
-- Migration 003: ไม่เก็บชื่อผู้ใช้ HR (ซึ่งเป็นเลขบัตรประชาชน) ในฐานข้อมูลของแอป
--   - app_users ระบุตัวผู้ใช้ด้วย hr_person_id (hr_person.ID) แทนชื่อผู้ใช้
--   - login_attempts เก็บ "แฮช" ของชื่อที่พิมพ์ (HMAC-SHA256) ใช้จำกัดการเดารหัสเท่านั้น
-- รันหลัง 002_auth.sql บน computer_stock ด้วยบัญชี root/DBA (ตารางต้องยังว่าง)
-- =============================================================================
USE computer_stock;

DELETE FROM app_sessions;
DELETE FROM login_attempts;
DELETE FROM app_users;

ALTER TABLE app_users
    MODIFY hr_person_id VARCHAR(50) NOT NULL,
    ADD UNIQUE KEY uq_app_users_hr_person (hr_person_id),
    DROP COLUMN hr_username;

ALTER TABLE login_attempts
    MODIFY username CHAR(64) NOT NULL;
