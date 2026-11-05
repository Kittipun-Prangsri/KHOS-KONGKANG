import { Router } from 'express';
import { pool } from '../db.js';
import { fail } from '../middleware/validate.js';

const router = Router();
const SHORT = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// รายการเดือนงบประมาณ (ให้ UI เลือกเป็น "ม.ค. 2569" แทนเลข id)
router.get('/fiscal-months', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT fm.id, fm.fiscal_year_id, fy.year_name AS fiscal_year, fm.month_no, fm.month_name, fm.calendar_month,
             fm.calendar_year_ad + 543 AS year_th, fm.start_date, fm.end_date,
             EXISTS (SELECT 1 FROM monthly_stock_summary s WHERE s.fiscal_month_id = fm.id) AS has_data
        FROM fiscal_months fm JOIN fiscal_years fy ON fy.id = fm.fiscal_year_id
       ORDER BY fy.start_date, fm.month_no`);
    const today = new Date().toISOString().slice(0, 10);
    let current = rows.find((r) => r.start_date <= today && today <= r.end_date);
    if (!current) current = [...rows].reverse().find((r) => r.has_data) || rows[rows.length - 1];
    const data = rows.map((r) => ({ ...r, has_data: !!r.has_data, label: `${SHORT[r.calendar_month]} ${r.year_th}` }));
    res.json({ success: true, data, current_id: current ? current.id : null });
  } catch (e) { fail(res, e, 'fiscal-months'); }
});

export default router;
