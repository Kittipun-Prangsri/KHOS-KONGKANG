// ยืนยันตัวตนด้วยบัญชีจากตาราง hr_person ของ Hosoffice (อ่านอย่างเดียว)
// ตั้งค่าชื่อตาราง/คอลัมน์/รูปแบบรหัสผ่านผ่าน .env (HR_*) — ดู .env.example
// - ไม่เก็บ/ไม่คัดลอก/ไม่บันทึกรหัสผ่านที่ใดเลย ใช้เทียบในหน่วยความจำแล้วทิ้ง
// - ดึงเฉพาะแถวของผู้ใช้ที่ล็อกอิน (WHERE ชื่อผู้ใช้ = ?) และเฉพาะคอลัมน์ที่จำเป็น
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { getHosPool } from './hosoffice-sync.js';

const IDENT = /^[A-Za-z0-9_]+$/;
const q = (name) => {
  if (!IDENT.test(name)) throw new Error(`ชื่อคอลัมน์/ตารางไม่ถูกต้อง: ${name}`);
  return '`' + name + '`';
};

export const hrConfigured = () => {
  const h = config.hr;
  return Boolean(h.table && h.userCol && h.passCol && h.algo && h.idCol);
};

const safeEq = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

async function passwordMatches(plain, stored) {
  const algo = config.hr.algo;
  const s = String(stored ?? '');
  if (!s) return false;
  switch (algo) {
    case 'plain': return safeEq(plain, s);
    case 'md5': case 'sha1': case 'sha256':
      return safeEq(crypto.createHash(algo).update(plain, 'utf8').digest('hex'), s.toLowerCase());
    case 'bcrypt': return bcrypt.compare(plain, s.replace(/^\$2y\$/, '$2a$'));
    default: throw new Error(`HR_PASS_ALGO ไม่รองรับ: ${algo}`);
  }
}

function selectSql() {
  const h = config.hr;
  const cols = [`${q(h.idCol)} AS id`, `${q(h.userCol)} AS username`, `${q(h.passCol)} AS pw`];
  h.nameCols.forEach((c, i) => cols.push(`${q(c)} AS n${i}`));
  if (h.activeCol) cols.push(`${q(h.activeCol)} AS active`);
  return `SELECT ${cols.join(', ')} FROM ${q(h.table)} WHERE ${q(h.userCol)} = ? LIMIT 1`;
}

const displayName = (row) => {
  const parts = config.hr.nameCols.map((_, i) => String(row[`n${i}`] ?? '').trim()).filter(Boolean);
  return parts.join(' ') || row.username;
};

const isActive = (row) => !config.hr.activeCol || String(row.active) === String(config.hr.activeValue);

// ตรวจชื่อผู้ใช้+รหัสผ่าน -> { ok, hrId, username, name } (ไม่ระบุสาเหตุที่ผิด เพื่อไม่ให้เดาได้)
export async function verifyHrLogin(username, password) {
  if (!hrConfigured()) { const e = new Error('ยังไม่ได้ตั้งค่า HR_* ใน .env'); e.code = 'HR_NOT_CONFIGURED'; throw e; }
  const [rows] = await getHosPool().query(selectSql(), [username]);
  const row = rows[0];
  // ถ้าไม่พบผู้ใช้ ก็ยังรันการเทียบรหัสกับค่าหลอก เพื่อให้เวลาตอบสนองใกล้เคียงกัน
  const matched = await passwordMatches(password, row ? row.pw : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali');
  if (!row) return { ok: false, reason: 'no_user' };
  if (!String(row.pw ?? '').trim()) return { ok: false, reason: 'no_hash' };   // บัญชีที่ยังไม่มีรหัสผ่านแบบเข้ารหัส
  if (!matched) return { ok: false, reason: 'bad_password' };
  if (!isActive(row)) return { ok: false, reason: 'inactive' };
  return { ok: true, hrId: String(row.id), username: String(row.username), name: displayName(row) };
}

// ค้นชื่อ/รหัสจาก HR (ไม่ตรวจรหัสผ่าน) ใช้ตอนผู้ดูแลเพิ่มผู้ใช้
export async function lookupHrUser(username) {
  if (!hrConfigured()) return null;
  const [rows] = await getHosPool().query(selectSql(), [username]);
  const row = rows[0];
  return row ? { hrId: String(row.id), username: String(row.username), name: displayName(row), active: isActive(row) } : null;
}
