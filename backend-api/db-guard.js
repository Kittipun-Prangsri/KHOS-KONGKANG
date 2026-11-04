// ด่านป้องกัน: ฐานของแอป (DB_*) ต้องไม่ใช่ฐาน/เซิร์ฟเวอร์ Hosoffice ตัวจริง
// เพื่อไม่ให้ schema, trigger, sync หรือสคริปต์ใด ๆ เขียนข้อมูลลงเซิร์ฟเวอร์หลักโดยไม่ตั้งใจ
// ยกเว้นเฉพาะกรณีตั้ง ALLOW_APP_DB_ON_HOSOFFICE_SERVER=1 โดยตั้งใจ (ไม่แนะนำ)

const norm = (v) => String(v ?? '').trim().toLowerCase();

export function guardAppDb(env = process.env) {
  const problems = [];
  const appName = norm(env.DB_NAME);
  const hosName = norm(env.HOSOFFICE_DB_NAME || 'hosoffice');

  if (!appName) problems.push('ยังไม่ได้ตั้ง DB_NAME');
  if (appName === 'hosoffice' || appName === hosName) {
    problems.push(`DB_NAME="${env.DB_NAME}" เป็นชื่อฐาน Hosoffice — ห้ามใช้เป็นฐานของแอป`);
  }

  if (env.HOSOFFICE_DB_HOST) {
    const sameServer = norm(env.DB_HOST || 'localhost') === norm(env.HOSOFFICE_DB_HOST) &&
      String(env.DB_PORT || 3306) === String(env.HOSOFFICE_DB_PORT || 3306);
    if (sameServer && env.ALLOW_APP_DB_ON_HOSOFFICE_SERVER !== '1') {
      problems.push(`DB_HOST (${env.DB_HOST}) เป็นเซิร์ฟเวอร์เดียวกับ HOSOFFICE_DB_HOST — ให้ใช้ฐานบนเครื่อง/เซิร์ฟเวอร์ทดสอบแยกต่างหาก`);
    }
  }

  if (problems.length) {
    const msg = '❌ หยุดเพื่อป้องกันการเขียนข้อมูลลงเซิร์ฟเวอร์หลัก:\n  - ' + problems.join('\n  - ') +
      '\n  แก้ DB_* ใน .env ให้ชี้ฐานของแอป (เช่น computer_stock) แล้วรันใหม่';
    const err = new Error(msg);
    err.code = 'APP_DB_GUARD';
    throw err;
  }
}

// ใช้ที่จุดเริ่มต้นของโปรเซส: พิมพ์ข้อความแล้วออกทันที
export function guardAppDbOrExit() {
  try { guardAppDb(); } catch (e) { console.error(e.message); process.exit(1); }
}
