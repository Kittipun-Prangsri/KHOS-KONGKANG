-- กันพลาด: บังคับใช้ฐานของแอปเสมอ ไม่ว่าเครื่องมือจะเลือกฐานไว้ที่ไหน (ห้ามสร้างตารางใน hosoffice)
USE computer_stock;

-- =============================================================================
-- Migration 001: รองรับการ sync จาก Hosoffice (MySQL)
-- รันครั้งเดียวบนฐานของแอป (computer_stock) — ห้ามรันบนฐาน hosoffice
-- =============================================================================

-- ระบุแหล่งที่มาของแต่ละรายการ เพื่อกันนำเข้าซ้ำและให้ sync ตามแก้ไข/ยกเลิกได้
-- (NULL = คีย์มือในแอป, 'hosoffice' = sync, 'opening' = ยอดยกมาตั้งต้น)
ALTER TABLE stock_movements
    ADD COLUMN source_system VARCHAR(20) NULL AFTER note,
    ADD COLUMN source_id VARCHAR(50) NULL AFTER source_system,
    ADD UNIQUE KEY uq_movement_source (source_system, source_id);

-- ประวัติการ sync
CREATE TABLE IF NOT EXISTS sync_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    status ENUM('running','success','error','dry-run') NOT NULL,
    trigger_by VARCHAR(20) NOT NULL DEFAULT 'manual',
    inserted_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    deleted_count INT NOT NULL DEFAULT 0,
    message TEXT NULL
) ENGINE=InnoDB;
