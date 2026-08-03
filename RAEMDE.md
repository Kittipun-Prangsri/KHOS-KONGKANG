ระบบบัญชีรับ-จ่ายวัสดุคอมพิวเตอร์
โรงพยาบาลคลองหาด — หน่วยเทคโนโลยีสารสนเทศ
ระบบทดแทนไฟล์ Excel เดิม (3_มูลค่าวัสดุคอมคงเหลือรายเดือน ปี 2569.xlsx) ที่ใช้บันทึกรับเข้า-จ่ายออกวัสดุคอมพิวเตอร์ 51 รายการ แบบยกยอดรายเดือน (12 ชีท ต.ค.-ก.ย. ตามปีงบประมาณไทย) ให้กลายเป็นระบบฐานข้อมูล + API + Dashboard ที่คำนวณยอดคงเหลืออัตโนมัติ ลดความเสี่ยงจากการกรอก/คัดลอกสูตรผิดพลาดข้ามชีท

1.  ภาพรวมสถาปัตยกรรม
    Excel เดิม (manual) ──migrate──▶ MySQL/Postgres

                                            │

                              stock_movements (บันทึกทุกใบรับ/ใบเบิก)

                                            │

                              trigger คำนวณอัตโนมัติ (cascade ยกยอด)

                                            ▼

                              monthly_stock_summary (ยอดต่อเดือนต่อรายการ)

                                            │

                        ┌───────────────────┴───────────────────┐

                        ▼                                        ▼

             Backend API (Express หรือ                    Views: v_current_stock,

             Supabase Edge Function)                        v_annual_summary

                        │

                        ▼

             Dashboard (stock-dashboard.html)

หลักการออกแบบที่สำคัญที่สุด: ฐานข้อมูลเป็นเจ้าของ business logic การยกยอด ไม่ใช่ backend หรือ frontend — ไม่ว่าจะบันทึกรายการผ่านช่องทางไหน (ฟอร์มเว็บ, LINE LIFF, import batch จาก Excel เดิม, ต่อ HOSxP ในอนาคต) ยอดคงเหลือจะถูกต้องตรงกันเสมอ เพราะ trigger คำนวณให้อัตโนมัติทุกครั้งที่มีการเปลี่ยนแปลงใน stock_movements

2. โครงสร้างไฟล์ในโปรเจกต์นี้
   ไฟล์
   หน้าที่
   stock_computer_schema.sql
   DDL หลัก — สร้างตาราง items, item_categories, fiscal_years, fiscal_months, stock_movements, monthly_stock_summary และ view v_current_stock, v_annual_summary (รองรับทั้ง MySQL และ PostgreSQL/Supabase มีคอมเมนต์กำกับส่วนที่ต่างกัน)
   stock_triggers_procedures.sql
   Trigger + Stored Procedure สำหรับคำนวณ monthly_stock_summary อัตโนมัติเมื่อมีการ insert/update/delete บน stock_movements มี 2 เวอร์ชัน: MySQL (procedure + trigger) และ PostgreSQL/Supabase (PL/pgSQL function + trigger)
   backend-api/server.js
   Backend API ด้วย Node.js + Express + mysql2 — endpoint สำหรับบันทึกรายการ, ดึงสต๊อกปัจจุบัน, สรุปรายเดือน/รายปี, ลงนามอนุมัติ
   backend-api/supabase-edge-function.ts
   ทางเลือก serverless — Supabase Edge Function (Deno) ทำหน้าที่เดียวกับ POST /api/movements สำหรับกรณีใช้ Supabase/Postgres แทน MySQL
   stock-dashboard.html
   หน้า Dashboard (ธีม "ห้องนิรภัยบัญชี" พื้นเขียวเข้ม-ทองเหลือง) แสดงมูลค่าคงเหลือรวม, วงแหวนสุขภาพสต๊อก, รายการใกล้หมด — ปัจจุบันใช้ mock data ในตัว รอต่อสาย API จริง
   README.md
   ไฟล์นี้

3. โครงสร้างฐานข้อมูล (Database Schema)
   3.1 ตารางหลัก
   item_categories — หมวดวัสดุ (วัสดุคอมพิวเตอร์ / วัสดุสำนักงาน / วัสดุไฟฟ้าและวิทยุ)

items — รายการวัสดุ master (51 รายการเดิม)

item_code (unique) = คอลัมน์ "รหัส" เดิมในไฟล์ Excel เช่น 291, 741
reorder_point — ฟิลด์ใหม่ที่ Excel เดิมไม่มี ใช้กำหนดจุดแจ้งเตือนของใกล้หมด

fiscal_years / fiscal_months — จำลองปีงบประมาณไทย (ต.ค.-ก.ย.) แทนชื่อชีท 10,11,12,01...09 เดิม โดย fiscal_months.month_no เรียงตามปีงบ (1=ต.ค.) แต่เก็บ calendar_month/calendar_year_ad แยกไว้ด้วย เพื่อให้หาลำดับเดือนก่อน-หลังตามเวลาจริงได้ถูกต้อง (สำคัญตอนยกยอดข้ามปีงบ เช่น ก.ย. 69 → ต.ค. 69)

stock_movements — บันทึกทุกใบรับ/ใบเบิกจริง (source of truth) มี movement_type เป็น receive/issue, เก็บราคาต่อหน่วย ณ เวลานั้น และคำนวณ total_value เป็น generated column

monthly_stock_summary — สรุปยอดต่อรายการต่อเดือน (ตรงกับตาราง "แบบสรุป" ฝั่งขวาของชีทเดิม) เก็บ opening_qty/value, received_qty/value, issued_qty/value และคำนวณ closing_qty/value เป็น generated column จากสูตร opening + received - issued
3.2 Views สำหรับ Dashboard
v_current_stock — ยอดคงเหลือล่าสุดของทุกรายการ พร้อม flag is_low_stock
v_annual_summary — ยอดรวมทั้งปีงบต่อรายการ (แทน 2 ชีทสรุปรายปีเดิม)
3.3 การติดตั้ง

# MySQL

mysql -u root -p your_db_name < stock_computer_schema.sql

mysql -u root -p your_db_name < stock_triggers_procedures.sql # ใช้เฉพาะส่วนที่ 1 (MySQL)

# PostgreSQL / Supabase

psql -h db.xxxx.supabase.co -U postgres -d postgres -f stock_computer_schema.sql

psql -h db.xxxx.supabase.co -U postgres -d postgres -f stock_triggers_procedures.sql # ใช้เฉพาะส่วนที่ 2 (Postgres)

หมายเหตุ: ไฟล์ stock_triggers_procedures.sql มีทั้งสองเวอร์ชันในไฟล์เดียวกัน (คั่นด้วยคอมเมนต์ ส่วนที่ 1 / ส่วนที่ 2) — รันเฉพาะส่วนที่ตรงกับฐานข้อมูลที่ใช้จริง อย่ารันทั้งไฟล์รวดเดียว

4. Trigger / Cascade Recalculation — ทำงานอย่างไร
   ปัญหาของสต๊อกแบบยกยอด (running balance) คือ ถ้าแก้ไขรายการย้อนหลัง (เช่นแก้จำนวนที่รับเข้าเดือน ธ.ค. 68) ยอดคงเหลือของทุกเดือนถัดไป (ม.ค., ก.พ., ... จนถึงเดือนปัจจุบัน) ต้องคำนวณใหม่ตามไปด้วย

ขั้นตอนการทำงาน:

เมื่อมี insert/update/delete บน stock_movements → trigger ยิงไปที่ sp_recalc_cascade (MySQL) หรือ recalc_cascade() (Postgres)
ฟังก์ชันนี้คำนวณยอดของเดือนที่แก้ไขก่อน (opening มาจาก closing ของเดือนก่อนหน้าตามปฏิทินจริง, received/issued มาจาก SUM(stock_movements) ของเดือนนั้น)
จากนั้นไล่คำนวณ "เดือนถัดไป" ต่อเนื่องไปเรื่อย ๆ เฉพาะเดือนที่มีข้อมูลอยู่แล้วใน monthly_stock_summary (กันไม่ให้สร้างแถวเดือนอนาคตที่ยังไม่ถึงเวลาโดยไม่ตั้งใจ)
หยุดเมื่อไม่มีเดือนถัดไปที่มีข้อมูล

ผลคือ backend/frontend ไม่ต้องรู้และไม่ต้องคำนวณสูตรยกยอดเลย แค่ insert แถวลง stock_movements ยอดคงเหลือทุกเดือนจะถูกต้องเสมอ

ข้อควรระวังบน MySQL: ถ้าเซิร์ฟเวอร์เปิด binary logging (มักเปิดในเซิร์ฟเวอร์ HOSxP) ต้องตั้ง log_bin_trust_function_creators = 1 ก่อนสร้าง trigger/procedure มิฉะนั้นจะสร้างไม่ได้

5. Backend API
   5.1 ทางเลือกที่ 1 — Node.js + Express (backend-api/server.js)
   ติดตั้ง:

npm install express mysql2 dotenv cors express-validator

ตัวแปรแวดล้อม (.env):

DB_HOST=localhost

DB_USER=stock_app

DB_PASSWORD=xxxxx

DB_NAME=computer_stock

PORT=4000

รัน:

node server.js

Endpoints:

Method
Path
หน้าที่
GET
/api/items
รายการวัสดุทั้งหมด (สำหรับ dropdown ในฟอร์ม)
GET
/api/stock/current
สต๊อกคงเหลือล่าสุดทุกรายการ (จาก v_current_stock)
GET
/api/stock/low
เฉพาะรายการที่ใกล้หมด (สำหรับแจ้งเตือน LINE/Telegram)
GET
/api/summary/:fiscalMonthId
สรุปยอดทุกรายการของเดือนที่ระบุ
GET
/api/summary/annual/:fiscalYearId
สรุปยอดรวมรายปี
POST
/api/movements
บันทึกรับเข้า/จ่ายออก 1 รายการ (มีเช็คกันจ่ายออกเกินสต๊อก)
PATCH
/api/summary/:id/sign
ลงนามอนุมัติยอดเดือนของ 1 รายการ

ตัวอย่าง request บันทึกรายการ:

POST /api/movements

{

"item_id": 1,

"fiscal_month_id": 9,

"movement_type": "issue",

"quantity": 2,

"unit_price": 450,

"movement_date": "2026-06-15",

"reference_no": "บช.69-045",

"note": "เบิกให้แผนกผู้ป่วยนอก"

}
5.2 ทางเลือกที่ 2 — Supabase Edge Function (backend-api/supabase-edge-function.ts)
สำหรับกรณีใช้ Supabase/Postgres และต้องการ backend แบบ serverless ไม่ต้องมีเซิร์ฟเวอร์ Node รันตลอดเวลา

Deploy:

supabase functions deploy record-movement

ตัวแปรแวดล้อม (ตั้งใน Supabase Dashboard → Edge Functions → Secrets):

SUPABASE_URL=https://xxxx.supabase.co

SUPABASE_SERVICE_ROLE_KEY=xxxxx

เรียกใช้จาก client:

const res = await fetch(`${SUPABASE_URL}/functions/v1/record-movement`, {

method: 'POST',

headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_ANON_KEY}` },

body: JSON.stringify({

    item_id: 12, fiscal_month_id: 4, movement_type: 'issue',

    quantity: 2, unit_price: 450, movement_date: '2026-01-15'

})

});

ทั้งสองทางเลือกทำหน้าที่แค่ insert ลง stock_movements — ตัวคำนวณยอดคงเหลือทั้งหมดอยู่ที่ trigger ในฐานข้อมูล (ข้อ 4) ไม่ใช่ที่ backend

6. Dashboard (stock-dashboard.html)
   หน้าจอเดี่ยว (HTML/CSS/JS ในไฟล์เดียว เปิดในเบราว์เซอร์ได้ทันที ไม่ต้อง build)

องค์ประกอบ:

วงแหวน "สุขภาพสต๊อก" — สัดส่วนรายการที่ยังอยู่เหนือจุดสั่งซื้อซ้ำ
มูลค่าคงเหลือรวมทั้งคลัง + เปอร์เซ็นต์เปลี่ยนแปลงจากเดือนก่อน
แถบสรุป 3 ช่อง: รับเข้าเดือนนี้ / จ่ายออกเดือนนี้ / รายการใกล้หมด
บัญชีคุมสต๊อกแบบ ledger กรองตามหมวด หรือกรองเฉพาะรายการใกล้หมด

สถานะปัจจุบัน: ใช้ mock data ฝังในไฟล์ (ตัวแปร items ใน <script>) ยังไม่ได้ต่อกับ API จริง

ขั้นตอนต่อสาย API จริง (แนะนำ):

แทนที่ array items ด้วย fetch('/api/stock/current') ตอนโหลดหน้า
แถบ "รับเข้า/จ่ายออกเดือนนี้" ดึงจาก GET /api/summary/:fiscalMonthId แล้ว sum ฝั่ง client หรือเพิ่ม endpoint สรุปยอดรวมเดือนแยกต่างหาก
วงแหวนสุขภาพสต๊อกคำนวณจาก (รายการทั้งหมด - จำนวนที่ is_low_stock) / รายการทั้งหมด
ถ้าจะโยกไปเป็น React component ในระบบใหญ่ ให้แยก state เป็น useState + useEffect ดึงข้อมูลแทนตัวแปร global ปัจจุบัน

7. Roadmap / สิ่งที่ยังไม่ได้ทำ
   สคริปต์ migrate ข้อมูลจาก Excel เดิม (51 รายการ x 12 เดือน) เข้า items + stock_movements
   ระบบ authentication สำหรับ created_by/signed_by (ปัจจุบัน API รับ user id ตรง ๆ ยังไม่ผูก JWT/session)
   แจ้งเตือน LINE Messaging API เมื่อของใกล้หมด (ตามแพทเทิร์นที่เคยใช้ในระบบ HI/CI mosquito surveillance)
   ต่อสาย stock-dashboard.html เข้ากับ API จริงแทน mock data
   หน้าฟอร์มบันทึกรับเข้า/จ่ายออกแบบ interactive (ต้นแบบ mockup ทำไว้แล้วในบทสนทนาก่อนหน้า)
   Export รายงานสรุปรายปี/รายเดือนเป็น PDF หรือ Excel สำหรับส่งตรวจสอบ

8. บริบทของโปรเจกต์
   ระบบนี้พัฒนาแทนที่ไฟล์ 3_มูลค่าวัสดุคอมคงเหลือรายเดือน ปี 2569.xlsx ซึ่งเดิมมี 14 ชีท (2 ชีทสรุปรายปี + 12 ชีทรายเดือน) แต่ละชีทรายเดือนมีตารางบันทึกประจำเดือนและตารางแบบสรุป/บัญชีคุมสต๊อกในหน้าเดียวกัน ยอดคงเหลือปิดเดือนก่อนถูก copy ด้วยมือมาเป็นยอดยกมาของเดือนถัดไป — เป็นจุดเสี่ยง human error หลักที่ระบบนี้ออกแบบมาเพื่อกำจัด
