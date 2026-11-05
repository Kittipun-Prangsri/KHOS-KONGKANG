import crypto from 'crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { body } from 'express-validator';
import { pool } from '../db.js';
import { validate, fail } from '../middleware/validate.js';
import { createSession, setSessionCookie, clearSessionCookie, requireAuth } from '../middleware/auth.js';
import { verifyHrLogin } from '../services/hr-auth.js';
import { audit, clientIp } from '../services/audit.js';

const router = Router();
const SECRET = config.appSecret || crypto.randomBytes(32).toString('hex');
// ชื่อผู้ใช้ HR คือเลขบัตรประชาชน จึงไม่เก็บค่าดิบ: เก็บเฉพาะแฮชไว้นับจำนวนครั้งที่ลองผิด
const keyOf = (username) => crypto.createHmac('sha256', SECRET).update(String(username).trim().toLowerCase()).digest('hex');
const MAX_FAILS_PER_USER = 5;     // ต่อชื่อผู้ใช้ ภายใน 15 นาที
const MAX_FAILS_PER_IP = 20;      // ต่อ IP ภายใน 15 นาที

async function tooManyAttempts(username, ip) {
  const [[u]] = await pool.query(
    "SELECT COUNT(*) n FROM login_attempts WHERE username = ? AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", [username]);
  const [[i]] = await pool.query(
    "SELECT COUNT(*) n FROM login_attempts WHERE ip = ? AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)", [ip]);
  return u.n >= MAX_FAILS_PER_USER || i.n >= MAX_FAILS_PER_IP;
}
const record = (username, ip, success, reason) =>
  pool.query('INSERT INTO login_attempts (username, ip, success, reason, attempted_at) VALUES (?, ?, ?, ?, NOW())',
    [username, ip, success ? 1 : 0, reason]).catch(() => {});

router.post('/login', [
  body('username').isString().trim().isLength({ min: 1, max: 100 }),
  body('password').isString().isLength({ min: 1, max: 200 }),
], validate, async (req, res) => {
  const { password } = req.body;
  const username = req.body.username;
  const uKey = keyOf(username);
  const ip = clientIp(req);
  try {
    if (await tooManyAttempts(uKey, ip)) {
      return res.status(429).json({ success: false, message: 'ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' });
    }
    let hr;
    try { hr = await verifyHrLogin(username, password); }
    catch (e) {
      if (e.code === 'HR_NOT_CONFIGURED') return res.status(503).json({ success: false, message: 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อบัญชีบุคลากร (HR) กรุณาแจ้งผู้ดูแล' });
      throw e;
    }
    if (!hr.ok) {
      await record(uKey, ip, false, hr.reason || 'bad_credentials');
      return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }
    const [rows] = await pool.query('SELECT id, display_name, role, is_active FROM app_users WHERE hr_person_id = ?', [hr.hrId]);
    const appUser = rows[0];
    if (!appUser || !appUser.is_active) {
      await record(uKey, ip, false, 'not_authorized');
      return res.status(403).json({ success: false, message: 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบคลังวัสดุ กรุณาติดต่อผู้ดูแลระบบ' });
    }
    await record(uKey, ip, true, 'ok');
    await pool.query('UPDATE app_users SET last_login_at = NOW() WHERE id = ?', [appUser.id]);
    const token = await createSession(req, appUser.id);
    setSessionCookie(res, token);
    req.user = { id: appUser.id };
    await audit(req, 'login', 'user', appUser.id);
    res.json({ success: true, data: { name: appUser.display_name, role: appUser.role } });
  } catch (e) { fail(res, e, 'login'); }
});

router.post('/logout', async (req, res) => {
  try {
    if (req.sessionTokenHash) await pool.query('DELETE FROM app_sessions WHERE token_hash = ?', [req.sessionTokenHash]);
    await audit(req, 'logout');
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (e) { fail(res, e, 'logout'); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: {
    id: req.user.id, name: req.user.display_name, role: req.user.role,
    signature_name: req.user.signature_name, position_title: req.user.position_title,
  } });
});

// ตั้งชื่อ-ตำแหน่งสำหรับเซ็นเอกสารที่พิมพ์ (แก้ของตัวเองเท่านั้น ทุกบทบาททำได้ ไม่ใช่ข้อมูลจาก HR)
router.patch('/me', requireAuth, [
  body('signature_name').optional({ values: 'falsy' }).isString().trim().isLength({ max: 150 }),
  body('position_title').optional({ values: 'falsy' }).isString().trim().isLength({ max: 150 }),
], validate, async (req, res) => {
  try {
    await pool.query('UPDATE app_users SET signature_name = ?, position_title = ? WHERE id = ?',
      [req.body.signature_name || null, req.body.position_title || null, req.user.id]);
    res.json({ success: true, message: 'บันทึกแล้ว' });
  } catch (e) { fail(res, e, 'update me'); }
});

export default router;
