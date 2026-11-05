import crypto from 'crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { clientIp } from '../services/audit.js';

export const COOKIE = 'kk_session';
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, token) {
  const maxAge = config.sessionHours * 3600;
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.cookieSecure ? '; Secure' : ''}`);
}

export async function createSession(req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO app_sessions (token_hash, user_id, created_at, expires_at, ip, user_agent)
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR), ?, ?)`,
    [hashToken(token), userId, config.sessionHours, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 255)]);
  return token;
}

// อ่าน session จาก cookie -> req.user (ถ้าไม่มี/หมดอายุ/ถูกปิดสิทธิ์ = ไม่ตั้งค่า)
export async function loadSession(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      const [rows] = await pool.query(
        `SELECT u.id, u.hr_person_id, u.display_name, u.role, u.signature_name, u.position_title
           FROM app_sessions s JOIN app_users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.is_active = 1`, [hashToken(token)]);
      if (rows[0]) { req.user = rows[0]; req.sessionTokenHash = hashToken(token); }
    }
    next();
  } catch (e) { next(e); }
}

export const requireAuth = (req, res, next) => {
  if (req.user) return next();
  res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
};

const RANK = { viewer: 1, staff: 2, admin: 3 };
// ต้องมีบทบาท "อย่างน้อย" ระดับที่กำหนด (admin > staff > viewer)
export const requireRole = (min) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  if ((RANK[req.user.role] || 0) >= RANK[min]) return next();
  res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ทำรายการนี้' });
};

// ป้องกัน CSRF: คำขอที่เปลี่ยนข้อมูลต้องมีหัว X-Requested-With (เว็บภายนอกส่งแบบข้ามไซต์ไม่ได้)
export const csrfGuard = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] === 'kk') return next();
  res.status(403).json({ success: false, message: 'คำขอไม่ถูกต้อง' });
};
