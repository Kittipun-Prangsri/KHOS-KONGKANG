# ระบบบัญชีรับ-จ่ายวัสดุคอมพิวเตอร์ — โรงพยาบาลคลองหาด

พัฒนาโดย **Kittipun Prangsri** · หน่วยเทคโนโลยีสารสนเทศ

ดึงรายการรับ-จ่ายจาก **Hosoffice** อัตโนมัติ (อ่านอย่างเดียว) แทนการกรอก Excel ยกยอดข้ามเดือน/ปีงบประมาณด้วย trigger ในฐานข้อมูล
แสดงผลผ่านเว็บ (Tailwind CSS) ล็อกอินด้วยบัญชีจากตาราง `hr_person` และจำกัดสิทธิ์เฉพาะรายชื่อที่ผู้ดูแลอนุญาต

## โครงสร้างโปรเจกต์
```
server/            ฝั่งเซิร์ฟเวอร์ (Express)
  index.js         จุดเริ่มต้น + ส่วนหัวความปลอดภัย
  config.js        โหลด .env + ด่านป้องกันฐานข้อมูล
  routes/          auth, stock, movements, reports(+dashboard), sync, admin, import, meta
  services/        hosoffice-sync, hr-auth, db-guard, audit
  middleware/      auth (session/สิทธิ์/CSRF), validate
client/app.css     ต้นฉบับ Tailwind v4  →  build เป็น public/assets/app.css
public/            หน้าเว็บ (login.html, index.html) + js/ (api, ui, charts, views/*)
db/                SQL ทั้งหมด (เรียงตามเลขลำดับ) + README.md ขั้นตอนติดตั้งฐานข้อมูล
scripts/           เครื่องมือครั้งเดียว: import_opening_balance, add_app_user ฯลฯ
templates/         ไฟล์ CSV ตัวอย่างสำหรับนำเข้า
legacy/            ของเดิมที่เลิกใช้ (เก็บไว้อ้างอิง)
```

## ภาพรวมการทำงาน
```
Hosoffice (hosoffice, อ่านอย่างเดียว) ──sync──▶ computer_stock.stock_movements
                                                   │ trigger คำนวณยกยอดอัตโนมัติ
                                                   ▼
                                        monthly_stock_summary ─▶ API ─▶ เว็บ
ล็อกอิน: hr_person (ตรวจรหัสผ่านจากแฮช bcrypt) + app_users (ใครมีสิทธิ์/บทบาทอะไร)
```

## สิทธิ์ผู้ใช้
| บทบาท | ทำได้ |
|---|---|
| ผู้ดูข้อมูล (viewer) | ดูทุกหน้า รายงาน พิมพ์/ส่งออก |
| เจ้าหน้าที่คลัง (staff) | + บันทึกรับ/จ่าย, ตั้งจุดสั่งซื้อ, ทดลองซิงก์ |
| ผู้ดูแลระบบ (admin) | + ซิงก์จริง, ลงนามรับรองยอด, ลบรายการที่คีย์เอง, จัดการผู้ใช้, ดูประวัติใช้งาน |

## ติดตั้งและใช้งาน
1. ฐานข้อมูล: ทำตาม [db/README.md](db/README.md)
2. `cp .env.example .env` แล้วกรอก (ดูคำอธิบายในไฟล์) — ห้าม commit `.env`
3. `npm install` → `npm run build` (สร้าง CSS + ฟอนต์; ไฟล์ที่ build แล้วถูก commit ไว้ เครื่องเซิร์ฟเวอร์ไม่ต้อง build)
4. `npm run user:add -- admin` สร้างผู้ดูแลคนแรก (ระบบถามชื่อผู้ใช้ HR แบบซ่อนตัวอักษร)
5. `npm run dev` (พัฒนา) หรือ `npm run pm2:start` / `docker compose up -d` (ใช้งานจริง) แล้วเปิด `http://<เครื่อง>:5189`

ถ้าใช้ผ่านเครือข่ายที่ไม่ใช่ LAN ภายใน ให้ครอบด้วย HTTPS (reverse proxy) แล้วตั้ง `COOKIE_SECURE=1` และ `TRUST_PROXY=1`

## ความปลอดภัยที่ทำไว้
- แอปเขียนได้เฉพาะฐาน `computer_stock`; อ่าน `hosoffice` ได้เฉพาะตารางที่ระบุ (สิทธิ์ใน DB + session READ ONLY + `db-guard`)
- รหัสผ่านไม่ถูกเก็บ/บันทึก; session เก็บแฮชโทเค็น; cookie HttpOnly + SameSite; ป้องกัน CSRF
- จำกัดการเดารหัส (5 ครั้ง/ชื่อผู้ใช้, 20 ครั้ง/IP ต่อ 15 นาที); บันทึกประวัติการใช้งานทุกการเปลี่ยนแปลง
- ไม่โหลดทรัพยากรจากอินเทอร์เน็ต (ฟอนต์/ไอคอน/กราฟอยู่ในเครื่อง) และใช้ Content-Security-Policy แบบเข้ม
