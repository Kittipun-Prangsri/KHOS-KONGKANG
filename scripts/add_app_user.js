// เพิ่ม/แก้สิทธิ์ผู้ใช้ที่ได้รับอนุญาต (ใช้สร้างผู้ดูแลคนแรก หรือเมื่อเข้าหน้าเว็บไม่ได้)
// ใช้:  npm run user:add -- <ชื่อผู้ใช้ใน HR_person> <admin|staff|viewer>
import '../server/config.js';
import { pool } from '../server/db.js';
import { lookupHrUser, hrConfigured } from '../server/services/hr-auth.js';

// ใช้: npm run user:add -- <admin|staff|viewer>            (แนะนำ — ถามชื่อผู้ใช้แบบซ่อนตัวอักษร ไม่ค้างใน history)
//      npm run user:add -- <ชื่อผู้ใช้ HR> <admin|staff|viewer>
const ROLES = ['admin', 'staff', 'viewer'];
const args = process.argv.slice(2);
const askHidden = (q) => new Promise((resolve) => {
  process.stdout.write(q);
  if (!process.stdin.isTTY) { let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => resolve(d.trim())); return; }
  let buf = ''; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  const onData = (ch) => {
    for (const c of ch) {
      if (c === '\r' || c === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf.trim()); }
      if (c === '\u0003') process.exit(130);
      if (c === '\u007f') buf = buf.slice(0, -1); else buf += c;
    }
  };
  process.stdin.on('data', onData);
});

if (!hrConfigured()) {
  console.error('❌ ยังไม่ได้ตั้งค่า HR_* ใน .env — ต้องมี HR_TABLE, HR_ID_COL, HR_USER_COL, HR_PASS_COL, HR_PASS_ALGO (ดู .env.example)');
  process.exit(1);
}

let username, role;
if (args.length === 1 && ROLES.includes(args[0])) { role = args[0]; username = await askHidden('ชื่อผู้ใช้ที่ใช้ล็อกอิน Hosoffice (ไม่แสดงตัวอักษร): '); }
else { [username, role] = args; }
if (!username || !ROLES.includes(role)) {
  console.error('ใช้: npm run user:add -- <admin|staff|viewer>   แล้วพิมพ์ชื่อผู้ใช้เมื่อถูกถาม');
  process.exit(1);
}

let hr;
try { hr = await lookupHrUser(username); }
catch (e) {
  if (e.errno === 1142) console.error('❌ stock_app ยังไม่มีสิทธิ์อ่านตาราง hr_person — ให้ DBA รัน db/grant_hr_login.sql ก่อน');
  else console.error(`❌ เชื่อมต่อ/ค้นหา HR ไม่สำเร็จ: ${e.code || ''} ${e.message}`.slice(0, 300));
  process.exit(1);
}
if (!hr) { console.error(`❌ ไม่พบ "${username}" ใน HR_person`); process.exit(1); }
if (!hr.active) { console.error('❌ บัญชีนี้ถูกปิดใช้งานใน HR'); process.exit(1); }

await pool.query(
  `INSERT INTO app_users (hr_person_id, display_name, role) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE role = VALUES(role), is_active = 1, display_name = VALUES(display_name)`,
  [hr.hrId, hr.name, role]);
console.log(`✅ ${hr.name} (รหัสบุคลากร ${hr.hrId}) → ${role}`);   // ไม่แสดง/ไม่เก็บชื่อผู้ใช้ (เลขบัตร)
await pool.end();
process.exit(0);
