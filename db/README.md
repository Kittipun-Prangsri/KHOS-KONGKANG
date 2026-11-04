# ฐานข้อมูล — ฐานเพิ่มบนเซิร์ฟเวอร์เดิม ไม่เขียนลง hosoffice

```
 MySQL เซิร์ฟเวอร์เดิม
 ├─ hosoffice        ← แอปอ่านอย่างเดียว (SELECT 3 ตาราง)
 └─ computer_stock   ← ฐานใหม่ของแอป (อ่าน/เขียน)  ← sync เติมข้อมูลมาที่นี่
        ผู้ใช้เดียว: stock_app
```

## ลำดับติดตั้ง
1. DBA แก้ `<APP_HOST>` / `<รหัสผ่าน>` ใน `provision_app_db.sql` แล้วรันด้วย root (สร้างฐาน + ผู้ใช้ + สิทธิ์)
2. รันด้วย root ตามลำดับ (เลือกฐาน `computer_stock`):
   `stock_computer_schema.sql` → `stock_triggers_procedures.sql` → `seed_base.sql` → `001_hosoffice_sync.sql`
   (ห้ามใช้ `seed_data.sql` กับฐานจริง — เป็นข้อมูลตัวอย่าง)
3. `.env`: `DB_*` = เซิร์ฟเวอร์เดิม ฐาน `computer_stock` ผู้ใช้ `stock_app`
   และ `HOSOFFICE_DB_*` = เซิร์ฟเวอร์เดิม ฐาน `hosoffice` ผู้ใช้ `stock_app` เดียวกัน
4. `node scripts/import_opening_balance.js` (ครั้งเดียว) แล้ว `POST /api/sync/hosoffice?dry=1` ตรวจก่อน sync จริง

## ชั้นป้องกัน
- **สิทธิ์ในฐานข้อมูล (เชื่อถือได้ที่สุด):** `stock_app` มี SELECT บน hosoffice เฉพาะ 3 ตาราง ไม่มีสิทธิ์เขียน
- session ฝั่ง Hosoffice ตั้งเป็น READ ONLY ในโค้ด
- `backend-api/db-guard.js` ปฏิเสธถ้า `DB_NAME` เป็น hosoffice (กันพลาดตอนแก้ `.env`)

## ข้อควรระวังเมื่อใช้เซิร์ฟเวอร์เดียวกัน
- ใช้ทรัพยากร/พื้นที่ร่วมกับ Hosoffice: sync รันเป็นช่วง ๆ และอ่านเฉพาะช่วงตั้งแต่ `SYNC_FROM_DATE` จึงเบา แต่ไม่ควรตั้งถี่เกินไป (แนะนำ 30–60 นาที)
- การสำรองข้อมูลของเซิร์ฟเวอร์อาจไม่ครอบคลุมฐานใหม่ ให้แจ้ง DBA เพิ่ม `computer_stock` เข้าแผนสำรอง
- ข้อมูลในฐานใหม่สร้างใหม่จาก Hosoffice ได้เสมอ (ยกเว้นยอดยกมาตั้งต้นจาก Excel — เก็บไฟล์ Excel ไว้)
