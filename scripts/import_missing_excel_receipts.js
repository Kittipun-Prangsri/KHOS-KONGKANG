// นำเข้าใบรับที่มีใน Excel เดิมแต่ไม่มีใน Hosoffice (ตรวจสอบรายตัวแล้วก่อนหน้านี้)
// รันครั้งเดียว ปลอดภัยรันซ้ำได้ (upsert ตาม source_system+source_id)
// ที่มา: 3_มูลค่าวัสดุคอมคงเหลือรายเดือน ปี 2569.xlsx — เทียบกับ hosoffice.sup_stock_card แล้วพบว่าไม่มีใบรับ
import mysql from 'mysql2/promise';
import { guardAppDbOrExit } from '../server/services/db-guard.js';
import '../server/config.js';

guardAppDbOrExit();

// [รหัส, ชื่อ, หน่วย, จำนวน, มูลค่ารวม, วันที่ (วันที่แน่นอนไม่ปรากฏในชีทสรุป ใช้วันที่ 15 ของเดือนแทน)]
const ROWS = [
  // พ.ย. 2568 — ขาดเฉพาะรายการนี้ (อีก 5 รายการของใบ RE-25681201001 มีใน Hosoffice แล้ว)
  ['1834', 'Plug Boots CAT5', 'ซอง', 5, 150.00, '2025-11-25', 'เดิม: ใบรับ RE-25681201001'],
  // พ.ค. 2569 — ทั้งชุดนี้ไม่มีใบรับใน Hosoffice เลย
  ['748', 'สาย Lan  CAT 6', 'กล่อง', 1, 5505.15, '2026-05-15', null],
  ['753', 'ตลับหมึก canon810', 'ตลับ', 7, 5215.00, '2026-05-15', null],
  ['754', 'ตลับหมึก canon811สี', 'ตลับ', 7, 6650.00, '2026-05-15', null],
  ['1640', 'หมึก เติม canon injek 500 ml สีดำ', 'ขวด', 7, 1575.00, '2026-05-15', null],
  ['1641', 'หมึก เติม canon injek 500 ml สีเหลือง', 'ขวด', 2, 450.00, '2026-05-15', null],
  ['1642', 'หมึก เติม canon injek 500 ml สีแดง', 'ขวด', 3, 675.00, '2026-05-15', null],
  ['1643', 'หมึก เติม canon injek 500 ml สีน้ำเงิน', 'ขวด', 5, 1125.00, '2026-05-15', null],
  // มิ.ย. 2569 — ไม่มีใบรับใน Hosoffice เลย
  ['744', 'หมึก Epson LQ300+', 'กล่อง', 6, 420.00, '2026-06-15', null],
  ['1633', 'SSD 2.5 นิ้ว SATA 256Gb', 'ตัว', 5, 6750.00, '2026-06-15', null],
  // ส.ค. 2569 — ตรวจพบรอบสอง (หลังอัปเดตไฟล์ Excel ให้ครบ ก.ค.-ก.ย. 69) ไม่มีใบรับใน Hosoffice เลยทั้งชุด
  // รวม 154 หน่วย / 152,802.10 บาท ตรงกับยอดรวมในชีท "สรุปรับใหม่ยอดรายปี 69" คอลัมน์ ส.ค. 69
  ['291', 'หมึก Laser canon 325', 'ตลับ', 90, 40500.00, '2026-08-15', null],
  ['746', 'Mouse', 'อัน', 10, 1926.00, '2026-08-15', null],
  ['747', 'Keyboard', 'อัน', 10, 2129.30, '2026-08-15', null],
  ['756', 'แผ่นรองเม้าท์', 'แผ่น', 20, 321.00, '2026-08-15', null],
  ['758', 'ตลับหมึก P285', 'ตลับ', 4, 3000.00, '2026-08-15', null],
  ['1119', 'ตลับหมึก HP 107A', 'ตลับ', 2, 1200.00, '2026-08-15', null],
  ['1620', 'RAM SERVER 32Gb', 'ตัว', 6, 52644.00, '2026-08-15', null],
  ['1621', 'SSD 2.5 นิ้ว SATA 128Gb', 'ตัว', 5, 5082.50, '2026-08-15', null],
  ['1625', 'SAS HHD SERVER 900Gb', 'ลูก', 6, 38520.00, '2026-08-15', null],
  ['2049', 'SSD M.2', 'ชุด', 1, 7479.30, '2026-08-15', null],
];

const db = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, port: Number(process.env.DB_PORT) || 3306,
});
await db.query('SET NAMES utf8mb4');

let created = 0, inserted = 0, updated = 0;
await db.beginTransaction();
try {
  for (const [code, name, unit, qty, value, date, refNote] of ROWS) {
    const price = Math.round((value / qty) * 100) / 100;

    // สร้างวัสดุถ้ายังไม่มี (ไม่แตะชื่อ/ราคาถ้ามีอยู่แล้ว เพื่อไม่ทับข้อมูลจาก Hosoffice sync)
    const [r] = await db.query(
      `INSERT INTO items (category_id, item_code, name, unit, unit_price, reorder_point) VALUES (1, ?, ?, ?, ?, 10)
       ON DUPLICATE KEY UPDATE id = id`, [code, name, unit, price]);
    if (r.affectedRows === 1) created++;

    const [[item]] = await db.query('SELECT id FROM items WHERE item_code = ?', [code]);
    const [[fm]] = await db.query('SELECT id FROM fiscal_months WHERE ? BETWEEN start_date AND end_date', [date]);
    if (!fm) { console.error(`❌ ไม่พบเดือนงบของวันที่ ${date} (รหัส ${code}) — ข้าม`); continue; }

    const note = `นำเข้าจาก Excel เดิม (ไม่พบใบรับใน Hosoffice)${refNote ? ' — ' + refNote : ''}`;
    const [mv] = await db.query(
      `INSERT INTO stock_movements
         (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, source_system, source_id)
       VALUES (?, ?, 'receive', ?, ?, ?, 'EXCEL-BACKFILL', ?, 'excel_manual', ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), unit_price = VALUES(unit_price)`,
      [item.id, fm.id, qty, price, date, note, `EXCELFIX:${code}:${date}`]);
    if (mv.affectedRows === 1) inserted++; else if (mv.affectedRows === 2) updated++;
  }
  await db.commit();
} catch (e) {
  await db.rollback();
  throw e;
} finally {
  await db.end();
}
console.log(`✅ เสร็จแล้ว — สร้างวัสดุใหม่ ${created} รายการ, เพิ่มใบรับ ${inserted}, อัปเดต ${updated} (รวม ${ROWS.length} รายการ)`);
