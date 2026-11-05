import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { pool } from '../db.js';
import { validate, fail } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// รายการรับ-จ่าย (กรองตามเดือนงบ/รายการ/ประเภท)
router.get('/', [
  query('fiscal_month_id').optional().isInt({ min: 1 }).toInt(),
  query('item_id').optional().isInt({ min: 1 }).toInt(),
  query('type').optional().isIn(['receive', 'issue']),
  query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
], validate, async (req, res) => {
  try {
    const where = []; const args = [];
    if (req.query.fiscal_month_id) { where.push('m.fiscal_month_id = ?'); args.push(req.query.fiscal_month_id); }
    if (req.query.item_id) { where.push('m.item_id = ?'); args.push(req.query.item_id); }
    if (req.query.type) { where.push('m.movement_type = ?'); args.push(req.query.type); }
    const [rows] = await pool.query(`
      SELECT m.id, m.movement_date, m.movement_type, m.quantity, m.unit_price, m.total_value, m.reference_no, m.note,
             m.source_system, i.item_code, i.name AS item_name, i.unit
        FROM stock_movements m JOIN items i ON i.id = m.item_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY m.movement_date DESC, m.id DESC LIMIT ?`, [...args, req.query.limit || 200]);
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'movements list'); }
});

// บันทึกรับ/จ่าย 1 รายการ (เจ้าหน้าที่ขึ้นไป) — ยอดคงเหลือคำนวณโดย trigger ในฐานข้อมูล
router.post('/', requireRole('staff'), [
  body('item_id').isInt({ min: 1 }).toInt(),
  body('fiscal_month_id').isInt({ min: 1 }).toInt(),
  body('movement_type').isIn(['receive', 'issue']),
  body('quantity').isInt({ min: 1 }).toInt(),
  body('unit_price').isFloat({ min: 0 }).toFloat(),
  body('movement_date').isDate(),
  body('reference_no').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('note').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
], validate, async (req, res) => {
  const { item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note } = req.body;
  try {
    const [[fm]] = await pool.query('SELECT start_date, end_date FROM fiscal_months WHERE id = ?', [fiscal_month_id]);
    if (!fm) return res.status(400).json({ success: false, message: 'ไม่พบเดือนงบประมาณที่เลือก' });
    if (movement_date < fm.start_date || movement_date > fm.end_date) {
      return res.status(400).json({ success: false, message: `วันที่ต้องอยู่ในช่วงเดือนที่เลือก (${fm.start_date} ถึง ${fm.end_date})` });
    }
    if (movement_type === 'issue') {
      const [[bal]] = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN movement_type='receive' THEN quantity ELSE -quantity END), 0) AS qty
           FROM stock_movements WHERE item_id = ?`, [item_id]);
      if (Number(bal.qty) < quantity) {
        return res.status(400).json({ success: false, message: `จำนวนคงเหลือไม่พอสำหรับเบิกจ่าย (คงเหลือ ${bal.qty} หน่วย)` });
      }
    }
    const [r] = await pool.query(
      `INSERT INTO stock_movements (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no || null, note || null, req.user.id]);
    await audit(req, 'movement.create', 'stock_movement', r.insertId, { item_id, movement_type, quantity, movement_date });
    res.status(201).json({ success: true, message: 'บันทึกรายการเรียบร้อยแล้ว', movement_id: r.insertId });
  } catch (e) { fail(res, e, 'movement create'); }
});

// ลบรายการที่คีย์เองในแอป (ผู้ดูแลเท่านั้น) — รายการที่มาจาก Hosoffice แก้ที่ต้นทาง
router.delete('/:id', requireRole('admin'), [param('id').isInt({ min: 1 }).toInt()], validate, async (req, res) => {
  try {
    const [[m]] = await pool.query('SELECT id, source_system, item_id, quantity, movement_type FROM stock_movements WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ success: false, message: 'ไม่พบรายการ' });
    if (m.source_system) return res.status(409).json({ success: false, message: 'รายการนี้มาจากระบบอื่น ไม่สามารถลบในแอป (แก้ที่ต้นทางแล้วซิงก์ใหม่)' });
    await pool.query('DELETE FROM stock_movements WHERE id = ?', [m.id]);
    await audit(req, 'movement.delete', 'stock_movement', m.id, { item_id: m.item_id, movement_type: m.movement_type, quantity: m.quantity });
    res.json({ success: true, message: 'ลบรายการแล้ว' });
  } catch (e) { fail(res, e, 'movement delete'); }
});

export default router;
