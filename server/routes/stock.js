import { Router } from 'express';
import { body, param } from 'express-validator';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';
import { pool } from '../db.js';
import { validate, fail } from '../middleware/validate.js';

const router = Router();

router.get('/items', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.id, i.item_code, i.name, i.unit, i.unit_price, i.reorder_point, ic.name AS category_name
        FROM items i LEFT JOIN item_categories ic ON i.category_id = ic.id
       WHERE i.status = 'active' ORDER BY i.item_code ASC`);
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'items'); }
});

// ตั้งจุดสั่งซื้อ (เตือนเมื่อคงเหลือ <= ค่านี้) ต่อรายการ
router.patch('/items/:id', requireRole('staff'), [
  param('id').isInt({ min: 1 }).toInt(),
  body('reorder_point').isInt({ min: 0, max: 100000 }).toInt(),
], validate, async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE items SET reorder_point = ? WHERE id = ?', [req.body.reorder_point, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบรายการวัสดุ' });
    await audit(req, 'item.reorder_point', 'item', req.params.id, { reorder_point: req.body.reorder_point });
    res.json({ success: true, message: 'บันทึกจุดสั่งซื้อแล้ว' });
  } catch (e) { fail(res, e, 'item update'); }
});

router.get('/stock/current', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_current_stock ORDER BY item_code ASC');
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'stock/current'); }
});

router.get('/stock/low', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_current_stock WHERE is_low_stock = 1 ORDER BY current_qty ASC');
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'stock/low'); }
});

// บัญชีคุมของ 1 รายการ: รับ/จ่ายทุกใบ พร้อมยอดคงเหลือสะสม
router.get('/stock/:itemId/ledger', [param('itemId').isInt({ min: 1 }).toInt()], validate, async (req, res) => {
  try {
    const [[item]] = await pool.query('SELECT id, item_code, name, unit FROM items WHERE id = ?', [req.params.itemId]);
    if (!item) return res.status(404).json({ success: false, message: 'ไม่พบรายการวัสดุ' });
    const [rows] = await pool.query(`
      SELECT id, movement_date, movement_type, quantity, unit_price, total_value, reference_no, note, source_system,
             SUM(CASE WHEN movement_type = 'receive' THEN quantity ELSE -quantity END)
               OVER (ORDER BY movement_date, id) AS balance_qty
        FROM stock_movements WHERE item_id = ? ORDER BY movement_date, id`, [req.params.itemId]);
    res.json({ success: true, data: { item, rows } });
  } catch (e) { fail(res, e, 'ledger'); }
});

export default router;
