// ตรวจ "รูปแบบ" ของ HR_PASSWORD_HASH เท่านั้น (ไม่แสดงค่าจริง) — ช่วยวินิจฉัยปัญหา bcrypt variant (เช่น $2y$ vs $2a$)
// ใช้: npm run check:hash
import '../server/config.js';
import { config } from '../server/config.js';
import { getHosPool } from '../server/services/hosoffice-sync.js';

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

const username = (await askHidden('ชื่อผู้ใช้ (ไม่แสดงตัวอักษร): ')).trim();
const h = config.hr;
const [rows] = await getHosPool().query(
  `SELECT LEFT(\`${h.passCol}\`, 7) AS prefix, LENGTH(\`${h.passCol}\`) AS len FROM \`${h.table}\` WHERE \`${h.userCol}\` = ? LIMIT 1`, [username]);
if (!rows[0]) console.log('❌ ไม่พบชื่อผู้ใช้นี้');
else console.log(`รูปแบบแฮช (ไม่ใช่ค่าจริง): เริ่มต้นด้วย "${rows[0].prefix}" ความยาวทั้งหมด ${rows[0].len} ตัวอักษร`);
process.exit(0);
