// วินิจฉัยการล็อกอินบนเครื่องผู้ดูแล: ถามชื่อผู้ใช้/รหัสผ่านแบบซ่อนตัวอักษร แล้วบอกสาเหตุที่เข้าไม่ได้
// (หน้าเว็บจะตอบข้อความทั่วไปเสมอ เพื่อไม่ให้คนนอกเดาได้ว่าชื่อไหนมีอยู่) — ไม่บันทึก/ไม่พิมพ์ค่าที่พิมพ์
// ใช้:  npm run check:login
import '../server/config.js';
import { pool } from '../server/db.js';
import { verifyHrLogin, hrConfigured } from '../server/services/hr-auth.js';

const askHidden = (q) => new Promise((resolve) => {
  process.stdout.write(q);
  let buf = ''; process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  const onData = (ch) => {
    for (const c of ch) {
      if (c === '\r' || c === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); return resolve(buf); }
      if (c === '\u0003') process.exit(130);
      if (c === '\u007f') buf = buf.slice(0, -1); else buf += c;
    }
  };
  process.stdin.on('data', onData);
});

if (!hrConfigured()) { console.error('❌ ยังไม่ได้ตั้งค่า HR_* ใน .env'); process.exit(1); }
if (!process.stdin.isTTY) { console.error('ต้องรันใน Terminal โดยตรง'); process.exit(1); }

const username = (await askHidden('ชื่อผู้ใช้ (ไม่แสดงตัวอักษร): ')).trim();
const password = await askHidden('รหัสผ่าน (ไม่แสดงตัวอักษร): ');
const MSG = {
  no_user: '❌ ไม่พบชื่อผู้ใช้นี้ใน hr_person — ชื่อที่พิมพ์ไม่ตรงกับ HR_USERNAME (ลองค่าที่ใช้ตอนสร้างผู้ดูแล)',
  bad_password: '❌ พบชื่อผู้ใช้ แต่รหัสผ่านไม่ตรงกับแฮช bcrypt ใน HR_PASSWORD_HASH',
  no_hash: '❌ พบชื่อผู้ใช้ แต่บัญชีนี้ยังไม่มีแฮช bcrypt (ต้องเปลี่ยนรหัสผ่านใน Hosoffice ก่อน)',
  inactive: '❌ ชื่อผู้ใช้และรหัสผ่านถูกต้อง แต่สถานะใน HR ไม่ใช่ค่าที่อนุญาต (HR_ACTIVE_VALUE)',
};
try {
  const r = await verifyHrLogin(username, password);
  if (!r.ok) console.log(MSG[r.reason] || `❌ ล้มเหลว (${r.reason})`);
  else {
    const [rows] = await pool.query('SELECT role, is_active FROM app_users WHERE hr_person_id = ?', [r.hrId]);
    if (!rows[0]) console.log('⚠️  ยืนยันตัวตนกับ HR ผ่าน แต่ยังไม่อยู่ในรายชื่อที่อนุญาต — รัน: npm run user:add -- admin');
    else if (!rows[0].is_active) console.log('⚠️  ยืนยันผ่าน แต่บัญชีในระบบคลังถูกปิดใช้งาน');
    else console.log(`✅ ล็อกอินได้ — ${r.name} (รหัสบุคลากร ${r.hrId}) สิทธิ์: ${rows[0].role}`);
  }
} catch (e) { console.error(`❌ ${e.code || ''} ${String(e.message).split('\n')[0].slice(0, 160)}`); }
await pool.end(); process.exit(0);
