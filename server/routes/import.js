// นำเข้าไฟล์ Excel/CSV แบบกลุ่ม (ผู้ดูแลเท่านั้น) — ใช้เมื่อไม่มีข้อมูลใน Hosoffice
import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { pool } from '../db.js';
import { fail } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(requireRole('admin'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/items', async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'ข้อมูลรายการวัสดุไม่ถูกต้องหรือว่างเปล่า' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let ins = 0, upd = 0;
    for (const it of items) {
      const code = String(it.item_code || '').trim(); const name = String(it.name || '').trim();
      if (!code || !name) continue;
      const [r] = await conn.query(
        `INSERT INTO items (category_id, item_code, name, unit, unit_price, reorder_point) VALUES (1, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), unit_price = VALUES(unit_price), reorder_point = VALUES(reorder_point)`,
        [code, name, String(it.unit || 'ชิ้น').trim(), parseFloat(it.unit_price) || 0, parseInt(it.reorder_point) || 10]);
      if (r.affectedRows === 1) ins++; else if (r.affectedRows === 2) upd++;
    }
    await conn.commit();
    await audit(req, 'import.items', 'items', null, { inserted: ins, updated: upd });
    res.json({ success: true, message: `นำเข้าวัสดุสำเร็จ (เพิ่มใหม่ ${ins}, อัปเดต ${upd})` });
  } catch (e) { await conn.rollback().catch(() => {}); fail(res, e, 'import items'); } finally { conn.release(); }
});

router.post('/movements', async (req, res) => {
  const { movements } = req.body;
  if (!Array.isArray(movements) || !movements.length) return res.status(400).json({ success: false, message: 'ข้อมูลรายการรับ-จ่ายไม่ถูกต้องหรือว่างเปล่า' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();   // ทั้งไฟล์สำเร็จพร้อมกัน หรือไม่เข้าเลย
    let ok = 0; const errors = [];
    for (const [n, m] of movements.entries()) {
      const code = String(m.item_code || '').trim();
      const type = String(m.movement_type || '').toLowerCase().trim();
      const qty = parseInt(m.quantity) || 0; const date = String(m.movement_date || '').slice(0, 10);
      if (!code || qty <= 0 || !['receive', 'issue'].includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`แถว ${n + 1}: ข้อมูลไม่ครบหรือไม่ถูกต้อง`); continue; }
      const [[item]] = await conn.query('SELECT id FROM items WHERE item_code = ?', [code]);
      if (!item) { errors.push(`แถว ${n + 1}: ไม่พบรหัสวัสดุ ${code}`); continue; }
      const [[fm]] = await conn.query('SELECT id FROM fiscal_months WHERE ? BETWEEN start_date AND end_date', [date]);
      if (!fm) { errors.push(`แถว ${n + 1}: ไม่พบเดือนงบประมาณของวันที่ ${date}`); continue; }
      await conn.query(
        `INSERT INTO stock_movements (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, fm.id, type, qty, parseFloat(m.unit_price) || 0, date, m.reference_no || null, m.note || null, req.user.id]);
      ok++;
    }
    if (errors.length) { await conn.rollback(); return res.status(400).json({ success: false, message: 'ไม่นำเข้าเลย เพราะมีแถวที่ไม่ถูกต้อง กรุณาแก้ไขแล้วลองใหม่', errors: errors.slice(0, 20) }); }
    await conn.commit();
    await audit(req, 'import.movements', 'stock_movements', null, { count: ok });
    res.json({ success: true, message: `นำเข้ารายการรับ-จ่ายสำเร็จ ${ok} รายการ` });
  } catch (e) { await conn.rollback().catch(() => {}); fail(res, e, 'import movements'); } finally { conn.release(); }
});

router.post('/parse', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ Excel หรือ CSV' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    if (!rows.length) return res.status(400).json({ success: false, message: 'ไฟล์ไม่มีข้อมูล' });
    res.json({ success: true, filename: req.file.originalname, total_rows: rows.length, data: rows.slice(0, 5000) });
  } catch (e) { fail(res, e, 'parse file'); }
});

export default router;
