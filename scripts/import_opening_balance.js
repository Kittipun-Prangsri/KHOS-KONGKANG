// นำเข้ายอดยกมาตั้งต้น (ต.ค. 2568) จาก Excel เดิมครั้งเดียว เข้า MySQL
// หลังจากนี้ไม่ต้องใช้ Excel อีก — รับ/จ่ายมาจาก Hosoffice sync
// ใช้:  node scripts/import_opening_balance.js [ไฟล์.xlsx]   (ค่าเริ่มต้น downloaded_stock_file2.xlsx)
// รันซ้ำได้ปลอดภัย (อัปเดตแถวเดิม ไม่เพิ่มซ้ำ)
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';
import { guardAppDbOrExit } from '../server/services/db-guard.js';

dotenv.config();
guardAppDbOrExit();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(__dirname, '../downloaded_stock_file2.xlsx');
const OPENING_DATE = '2025-10-01';

const wb = XLSX.readFile(file);
const rows = XLSX.utils.sheet_to_json(wb.Sheets['10'], { header: 1 });

const db = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
  charset: 'utf8mb4',  // บังคับชุดอักขระ กันชื่อวัสดุภาษาไทยเพี้ยนตอนเขียน
});

const [[fm]] = await db.query('SELECT id FROM fiscal_months WHERE ? BETWEEN start_date AND end_date LIMIT 1', [OPENING_DATE]);
if (!fm) { console.error('❌ ไม่พบเดือนงบ ต.ค. 2025 — รัน db/seed_data.sql (ปีงบ 2569) ก่อน'); process.exit(1); }

let n = 0, skipped = 0;
await db.beginTransaction();
try {
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[11] || isNaN(r[11])) continue;
    const code = String(r[26] || '').trim();
    const name = String(r[12] || '').trim();
    const unit = String(r[21] || 'ชิ้น').trim();
    const qty = parseInt(r[16]) || 0;
    const value = parseFloat(r[22]) || 0;
    if (!code || !name) continue;

    const price = qty > 0 ? Math.round((value / qty) * 100) / 100 : 0;
    await db.query(
      `INSERT INTO items (category_id, item_code, name, unit, unit_price, reorder_point)
       VALUES (1, ?, ?, ?, ?, 10)
       ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit)`, [code, name, unit, price]);
    if (qty <= 0) { skipped++; continue; }

    const [[item]] = await db.query('SELECT id FROM items WHERE item_code = ?', [code]);
    await db.query(
      `INSERT INTO stock_movements
         (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, source_system, source_id)
       VALUES (?, ?, 'receive', ?, ?, ?, 'ยอดยกมา', 'ยอดยกมาตั้งต้นจาก Excel ปีงบ 2569', 'opening', ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price)`,
      [item.id, fm.id, qty, price, OPENING_DATE, `OPENING:${code}`]);
    n++;
  }
  await db.commit();
} catch (e) {
  await db.rollback();
  throw e;
} finally {
  await db.end();
}
console.log(`✅ นำเข้ายอดยกมา ${n} รายการ (ข้ามที่ยอด 0: ${skipped})`);
