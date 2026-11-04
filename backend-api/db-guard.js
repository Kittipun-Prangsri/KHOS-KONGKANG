// ด่านป้องกัน: แอปต้องเขียนลงฐานของตัวเอง (เช่น computer_stock) เท่านั้น ห้ามเขียนลงฐาน Hosoffice
// อนุญาตให้ฐานของแอปอยู่บนเซิร์ฟเวอร์เดียวกับ Hosoffice ได้ (สร้างเป็นฐานเพิ่ม)
// ด่านที่เชื่อถือได้จริงคือสิทธิ์ของผู้ใช้ในฐานข้อมูล (ดู db/provision_app_db.sql) — ไฟล์นี้กันพลาดตอนตั้งค่า .env

const norm = (v) => String(v ?? '').trim().toLowerCase();

export function guardAppDb(env = process.env) {
  const problems = [];
  const appName = norm(env.DB_NAME);
  const protectedNames = new Set(['hosoffice', norm(env.HOSOFFICE_DB_NAME)].filter(Boolean));

  if (!appName) problems.push('ยังไม่ได้ตั้ง DB_NAME');
  if (protectedNames.has(appName)) {
    problems.push(`DB_NAME="${env.DB_NAME}" เป็นฐาน Hosoffice — ห้ามใช้เป็นฐานของแอป (ให้ใช้ฐานใหม่ เช่น computer_stock)`);
  }

  if (problems.length) {
    const err = new Error('❌ หยุดเพื่อป้องกันการเขียนข้อมูลลงฐาน Hosoffice:\n  - ' + problems.join('\n  - ') +
      '\n  แก้ DB_NAME ใน .env ให้ชี้ฐานของแอป แล้วรันใหม่');
    err.code = 'APP_DB_GUARD';
    throw err;
  }
}

// ใช้ที่จุดเริ่มต้นของโปรเซส: พิมพ์ข้อความแล้วออกทันที
export function guardAppDbOrExit() {
  try { guardAppDb(); } catch (e) { console.error(e.message); process.exit(1); }
}
