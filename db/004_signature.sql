-- =============================================================================
-- Migration 004: ชื่อ-ตำแหน่งสำหรับเซ็นเอกสารที่พิมพ์ (ผู้ใช้ตั้งเอง ไม่ดึงจาก HR)
-- รันบน computer_stock ด้วยบัญชี root/DBA
-- =============================================================================
USE computer_stock;

ALTER TABLE app_users
    ADD COLUMN signature_name VARCHAR(150) NULL AFTER display_name,
    ADD COLUMN position_title VARCHAR(150) NULL AFTER signature_name;
