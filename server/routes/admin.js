import { Router } from 'express';
import { body, param } from 'express-validator';
import { pool } from '../db.js';
import { validate, fail } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { lookupHrUser, hrConfigured } from '../services/hr-auth.js';
import { audit } from '../services/audit.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/users', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, hr_person_id, display_name, role, is_active, created_at, last_login_at FROM app_users ORDER BY is_active DESC, role, display_name');
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'users list'); }
});

// เพิ่มผู้ใช้ที่ได้รับอนุญาต: ต้องมีชื่อผู้ใช้อยู่จริงใน hr_person (ดึงชื่อจริงจาก HR ให้)
router.post('/users', [
  body('hr_username').isString().trim().isLength({ min: 1, max: 100 }),
  body('role').isIn(['admin', 'staff', 'viewer']),
], validate, async (req, res) => {
  try {
    if (!hrConfigured()) return res.status(503).json({ success: false, message: 'ยังไม่ได้ตั้งค่า HR_* ใน .env' });
    const hr = await lookupHrUser(req.body.hr_username);
    if (!hr) return res.status(404).json({ success: false, message: 'ไม่พบชื่อผู้ใช้นี้ในระบบบุคลากร (HR)' });
    if (!hr.active) return res.status(409).json({ success: false, message: 'บัญชีนี้ถูกปิดการใช้งานในระบบบุคลากร' });
    const [r] = await pool.query(
      'INSERT INTO app_users (hr_person_id, display_name, role) VALUES (?, ?, ?)',
      [hr.hrId, hr.name, req.body.role]);
    await audit(req, 'user.add', 'app_user', r.insertId, { hr_person_id: hr.hrId, role: req.body.role });   // ไม่บันทึกชื่อผู้ใช้ (เลขบัตร)
    res.status(201).json({ success: true, message: `เพิ่ม ${hr.name} แล้ว`, id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'ผู้ใช้นี้ถูกเพิ่มไว้แล้ว' });
    fail(res, e, 'user add');
  }
});

router.patch('/users/:id', [
  param('id').isInt({ min: 1 }).toInt(),
  body('role').optional().isIn(['admin', 'staff', 'viewer']),
  body('is_active').optional().isBoolean().toBoolean(),
], validate, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(409).json({ success: false, message: 'ไม่สามารถเปลี่ยนสิทธิ์หรือปิดบัญชีของตัวเองได้ (กันล็อกตัวเองออก)' });
    }
    const sets = []; const args = [];
    if (req.body.role !== undefined) { sets.push('role = ?'); args.push(req.body.role); }
    if (req.body.is_active !== undefined) { sets.push('is_active = ?'); args.push(req.body.is_active ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่จะแก้ไข' });
    const [r] = await pool.query(`UPDATE app_users SET ${sets.join(', ')} WHERE id = ?`, [...args, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    if (req.body.is_active === false) await pool.query('DELETE FROM app_sessions WHERE user_id = ?', [req.params.id]);
    await audit(req, 'user.update', 'app_user', req.params.id, req.body);
    res.json({ success: true, message: 'บันทึกแล้ว' });
  } catch (e) { fail(res, e, 'user update'); }
});

router.get('/audit', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.created_at, a.action, a.entity, a.entity_id, a.detail, u.display_name AS user_name
        FROM audit_log a LEFT JOIN app_users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`);
    res.json({ success: true, data: rows });
  } catch (e) { fail(res, e, 'audit list'); }
});

export default router;
