-- =============================================================================
-- ให้ DBA ของเซิร์ฟเวอร์ Hosoffice รันครั้งเดียว
-- สิทธิ์อ่านตาราง hr_person "เฉพาะคอลัมน์ที่ใช้ล็อกอิน" (ไม่ให้ทั้งตาราง)
--
-- ใช้ HR_PASSWORD (แฮช MD5 32 ตัวอักษร ยืนยันแล้วว่าทุกบัญชีเป็นรูปแบบนี้) แทน HR_PASSWORD_HASH
-- เพราะ HR_PASSWORD_HASH (bcrypt) ไม่ถูกอัปเดตเมื่อผู้ใช้เปลี่ยนรหัสผ่านผ่านหน้า Hosoffice (ยืนยันแล้วจากการทดสอบจริง)
--   ทำให้ค้างเป็นรหัสผ่านเก่า — เป็นบั๊กฝั่ง Hosoffice ที่ควรแจ้งผู้พัฒนาให้แก้ในระยะยาว
--
-- ตั้งใจ "ไม่ให้" คอลัมน์เหล่านี้ (ข้อมูลอ่อนไหว): HR_CID, HR_SALARY, BOOK_BANK_*, HR_FINGLE*, HR_FG*,
--   LINE_*, TELEGRAM_*, MOPH_*, *_WEBHOOK_URL, OTP, TAX_* และอื่น ๆ
--
-- แก้ <APP_HOST> เป็นโฮสต์ของผู้ใช้ stock_app (เช่น 192.168.120.%)
-- =============================================================================

-- ถ้าเคยรันไฟล์เวอร์ชันก่อนหน้าไปแล้ว (ให้สิทธิ์ HR_PASSWORD_HASH ไว้) คำสั่งนี้จะ "เพิ่ม" คอลัมน์ HR_PASSWORD
-- เข้าไปในสิทธิ์เดิม (MySQL/MariaDB รวมรายการคอลัมน์ของ GRANT ซ้ำให้อัตโนมัติ ไม่ต้องลบของเดิมก่อน)
GRANT SELECT (`ID`, `HR_USERNAME`, `HR_PASSWORD`, `HR_FNAME`, `HR_LNAME`, `HR_STATUS_ID`)
  ON hosoffice.`hr_person` TO 'stock_app'@'<APP_HOST>';

-- ตรวจผล:  SHOW GRANTS FOR 'stock_app'@'<APP_HOST>';
-- ต้องเห็นบรรทัด GRANT SELECT (`ID`, `HR_USERNAME`, `HR_PASSWORD`, ...) ON `hosoffice`.`hr_person`
