-- =============================================================================
-- สร้างฐาน computer_stock "เพิ่ม" บนเซิร์ฟเวอร์ MySQL เดิม (เซิร์ฟเวอร์เดียวกับ Hosoffice)
-- รันครั้งเดียวด้วยบัญชีผู้ดูแล (root/DBA) — ฐาน hosoffice ไม่ถูกแก้ไขใด ๆ
-- ก่อนรัน แก้ 2 อย่าง (อย่า commit รหัสผ่านจริง):
--   <APP_HOST>  = IP ของเครื่องที่รัน Node (ถ้า Node อยู่เครื่องเดียวกับ MySQL ใช้ 'localhost')
--   <รหัสผ่าน>   = รหัสผ่านใหม่ยาว ๆ ที่ไม่ซ้ำกับระบบอื่น
-- =============================================================================

CREATE DATABASE IF NOT EXISTS computer_stock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ผู้ใช้เดียวของแอป
CREATE USER IF NOT EXISTS 'stock_app'@'<APP_HOST>' IDENTIFIED BY '<รหัสผ่าน>';

-- 1) ฐานของแอป: อ่าน/เขียนข้อมูลได้ แต่แก้โครงสร้างไม่ได้
GRANT SELECT, INSERT, UPDATE, DELETE ON computer_stock.* TO 'stock_app'@'<APP_HOST>';

-- 2) Hosoffice: SELECT อย่างเดียว เฉพาะ 3 ตารางที่ sync ใช้ (ไม่ให้ทั้งฐาน)
--    จงใจไม่ให้ sup_inven เพราะมีคอลัมน์ token/secret key ของคลัง
GRANT SELECT ON hosoffice.sup_stock_card        TO 'stock_app'@'<APP_HOST>';
GRANT SELECT ON hosoffice.sup_open_inven        TO 'stock_app'@'<APP_HOST>';
GRANT SELECT ON hosoffice.sup_open_inven_detail TO 'stock_app'@'<APP_HOST>';

-- ตรวจผล (ต้องไม่เห็นสิทธิ์เขียนบน hosoffice เลย):
--   SHOW GRANTS FOR 'stock_app'@'<APP_HOST>';

-- -----------------------------------------------------------------------------
-- ติดตั้งโครงสร้าง (ด้วย root) ตามลำดับ — ต้อง USE computer_stock ก่อน:
--   stock_computer_schema.sql -> stock_triggers_procedures.sql -> seed_base.sql -> 001_hosoffice_sync.sql
-- เซิร์ฟเวอร์จริงเป็น MariaDB 11.8 และเปิด binary log: การสร้าง trigger ต้องใช้บัญชีที่มีสิทธิ์ SUPER (เช่น root/DBA)
-- ถ้าบัญชีที่ใช้ไม่มี SUPER จะขึ้น error 1419 ("You do not have the SUPER privilege and binary logging is enabled")
-- ทางแก้: ใช้บัญชี SUPER รันไฟล์ trigger  (อย่าเปลี่ยนค่าระดับเซิร์ฟเวอร์ถ้าไม่จำเป็น)
-- -----------------------------------------------------------------------------
