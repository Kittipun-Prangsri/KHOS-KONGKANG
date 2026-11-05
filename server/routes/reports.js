import { Router } from 'express';
import { param, query } from 'express-validator';
import { pool } from '../db.js';
import { validate, fail } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

const router = Router();

// ภาพรวมสำหรับหน้าแรก: ตัวเลขสรุป + รายการเบิกมากสุด + แนวโน้ม 12 เดือน
router.get('/dashboard', [query('fiscal_month_id').optional().isInt({ min: 1 }).toInt()], validate, async (req, res) => {
  try {
    const [months] = await pool.query(`
      SELECT fm.id, fm.calendar_month, fm.calendar_year_ad + 543 AS year_th, fy.start_date AS fy_start, fm.month_no
        FROM fiscal_months fm JOIN fiscal_years fy ON fy.id = fm.fiscal_year_id ORDER BY fy.start_date, fm.month_no`);
    let idx = months.findIndex((m) => m.id === req.query.fiscal_month_id);
    if (idx < 0) {
      const [[last]] = await pool.query('SELECT MAX(fiscal_month_id) id FROM monthly_stock_summary');
      idx = months.findIndex((m) => m.id === last.id);
    }
    const sel = months[idx] || null;
    const empty = { totals: { items: 0, low_stock: 0, stock_value: 0 }, month: null, top_issued: [], trend: [], low_items: [] };
    if (!sel) return res.json({ success: true, data: empty });

    const [[t]] = await pool.query(`
      SELECT COUNT(*) items, COALESCE(SUM(is_low_stock),0) low_stock, COALESCE(SUM(current_value),0) stock_value FROM v_current_stock`);
    const sums = async (fmId) => {
      const [[r]] = await pool.query(`
        SELECT COALESCE(SUM(opening_value),0) opening_value, COALESCE(SUM(received_value),0) received_value,
               COALESCE(SUM(issued_value),0) issued_value, COALESCE(SUM(closing_value),0) closing_value,
               COALESCE(SUM(received_qty),0) received_qty, COALESCE(SUM(issued_qty),0) issued_qty
          FROM monthly_stock_summary WHERE fiscal_month_id = ?`, [fmId]);
      return r;
    };
    const cur = await sums(sel.id);
    const prev = idx > 0 ? await sums(months[idx - 1].id) : null;

    const [top] = await pool.query(`
      SELECT i.item_code, i.name, i.unit, s.issued_qty, s.issued_value
        FROM monthly_stock_summary s JOIN items i ON i.id = s.item_id
       WHERE s.fiscal_month_id = ? AND s.issued_qty > 0 ORDER BY s.issued_value DESC LIMIT 5`, [sel.id]);
    const [low] = await pool.query(`
      SELECT item_code, item_name AS name, unit, current_qty, reorder_point
        FROM v_current_stock WHERE is_low_stock = 1 ORDER BY current_qty ASC LIMIT 8`);

    const from = months.slice(Math.max(0, idx - 11), idx + 1);
    const trend = [];
    for (const m of from) { const s = await sums(m.id); trend.push({ fiscal_month_id: m.id, calendar_month: m.calendar_month, year_th: m.year_th, closing_value: Number(s.closing_value), issued_value: Number(s.issued_value), received_value: Number(s.received_value) }); }

    res.json({ success: true, data: {
      totals: { items: Number(t.items), low_stock: Number(t.low_stock), stock_value: Number(t.stock_value) },
      month: { fiscal_month_id: sel.id, ...Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, Number(v)])),
               prev_closing_value: prev ? Number(prev.closing_value) : null },
      top_issued: top, low_items: low, trend } });
  } catch (e) { fail(res, e, 'dashboard'); }
});

// สรุปมูลค่าคงคลังรายเดือนทั้งปีในตารางเดียว (ยกมา/รับ/จ่าย/คงเหลือ) — รวมทุกรายการ
// หมายเหตุสำคัญ: วัสดุที่ไม่มีการเคลื่อนไหวในเดือนใด ๆ จะไม่มีแถวใน monthly_stock_summary ของเดือนนั้นเลย
// (ตามการออกแบบ trigger ที่คำนวณเฉพาะเดือนที่ "ถูกแตะ") ถ้ารวมยอดแบบ SUM ตรง ๆ ต่อเดือน มูลค่าของวัสดุเหล่านั้น
// จะหายไปจากผลรวม จึงต้องหา "แถวล่าสุดของแต่ละวัสดุ ณ ก่อน/ถึงเดือนนั้น" มารวมแทน (เหมือนตรรกะเดียวกับที่ trigger
// ใช้ยกยอดรายตัว แต่ทำระดับรวมทุกรายการสำหรับรายงานนี้โดยเฉพาะ)
router.get('/summary/monthly-value/:fiscalYearId', [param('fiscalYearId').isInt().toInt()], validate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      WITH target AS (
        SELECT fm.id, fm.month_no, fm.month_name, fm.calendar_month, fm.calendar_year_ad + 543 AS year_th, fy.start_date AS fy_start
        FROM fiscal_months fm JOIN fiscal_years fy ON fy.id = fm.fiscal_year_id
        WHERE fm.fiscal_year_id = ?
      ),
      hist AS (
        SELECT s.item_id, s.closing_value, fy.start_date AS fy_start, fm.month_no
        FROM monthly_stock_summary s
        JOIN fiscal_months fm ON fm.id = s.fiscal_month_id
        JOIN fiscal_years fy ON fy.id = fm.fiscal_year_id
      ),
      opening_calc AS (
        SELECT t.id AS fiscal_month_id, h.closing_value,
               ROW_NUMBER() OVER (PARTITION BY t.id, h.item_id ORDER BY h.fy_start DESC, h.month_no DESC) rn
        FROM target t JOIN hist h ON (h.fy_start < t.fy_start) OR (h.fy_start = t.fy_start AND h.month_no < t.month_no)
      ),
      closing_calc AS (
        SELECT t.id AS fiscal_month_id, h.closing_value,
               ROW_NUMBER() OVER (PARTITION BY t.id, h.item_id ORDER BY h.fy_start DESC, h.month_no DESC) rn
        FROM target t JOIN hist h ON (h.fy_start < t.fy_start) OR (h.fy_start = t.fy_start AND h.month_no <= t.month_no)
      )
      SELECT t.id AS fiscal_month_id, t.month_no, t.month_name, t.calendar_month, t.year_th,
        COALESCE((SELECT SUM(closing_value) FROM opening_calc WHERE fiscal_month_id = t.id AND rn = 1), 0) AS opening_value,
        COALESCE((SELECT SUM(s.received_value) FROM monthly_stock_summary s WHERE s.fiscal_month_id = t.id), 0) AS received_value,
        COALESCE((SELECT SUM(s.issued_value) FROM monthly_stock_summary s WHERE s.fiscal_month_id = t.id), 0) AS issued_value,
        COALESCE((SELECT SUM(closing_value) FROM closing_calc WHERE fiscal_month_id = t.id AND rn = 1), 0) AS closing_value
      FROM target t
      ORDER BY t.month_no`, [req.params.fiscalYearId]);
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'monthly value summary'); }
});

router.get('/summary/annual/:fiscalYearId', [param('fiscalYearId').isInt().toInt()], validate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_annual_summary WHERE fiscal_year_id = ? ORDER BY item_code ASC', [req.params.fiscalYearId]);
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'annual summary'); }
});

router.get('/summary/:fiscalMonthId', [param('fiscalMonthId').isInt().toInt()], validate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.*, i.item_code, i.name AS item_name, i.unit, ic.name AS category_name
        FROM monthly_stock_summary s
        JOIN items i ON s.item_id = i.id
        LEFT JOIN item_categories ic ON i.category_id = ic.id
       WHERE s.fiscal_month_id = ? ORDER BY i.item_code ASC`, [req.params.fiscalMonthId]);
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'monthly summary'); }
});

// ลงนามรับรองยอดทั้งเดือนในครั้งเดียว (ผู้ดูแล)
router.patch('/summary/month/:fiscalMonthId/sign', requireRole('admin'), [param('fiscalMonthId').isInt().toInt()], validate, async (req, res) => {
  try {
    const [r] = await pool.query(
      'UPDATE monthly_stock_summary SET is_signed = 1, signed_by = ?, signed_at = NOW() WHERE fiscal_month_id = ? AND is_signed = 0',
      [req.user.id, req.params.fiscalMonthId]);
    await audit(req, 'summary.sign_month', 'fiscal_month', req.params.fiscalMonthId, { rows: r.affectedRows });
    res.json({ success: true, message: `ลงนามรับรองยอดแล้ว ${r.affectedRows} รายการ`, signed: r.affectedRows });
  } catch (e) { fail(res, e, 'sign month'); }
});

// ลงนามรับรองยอดประจำเดือน (ผู้ดูแล) — ผู้ลงนามคือผู้ที่ล็อกอินอยู่ ไม่รับค่าจากไคลเอนต์
router.patch('/summary/:id/sign', requireRole('admin'), [param('id').isInt().toInt()], validate, async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE monthly_stock_summary SET is_signed = 1, signed_by = ?, signed_at = NOW() WHERE id = ?', [req.user.id, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบรายการสรุปประจำเดือน' });
    await audit(req, 'summary.sign', 'monthly_stock_summary', req.params.id);
    res.json({ success: true, message: 'ลงนามรับรองยอดเรียบร้อยแล้ว' });
  } catch (e) { fail(res, e, 'sign'); }
});

export default router;
