// ตรวจการเชื่อมต่อฐานข้อมูลตาม .env (อ่านอย่างเดียว) — พิมพ์เฉพาะ ผ่าน/ไม่ผ่าน ไม่แสดงรหัสผ่านหรือข้อมูลบุคคล
// ใช้:  npm run check:db
import '../server/config.js';
import mysql from 'mysql2/promise';

const e = process.env;
async function probe(label, cfg, sql) {
  try {
    const c = await mysql.createConnection({ ...cfg, connectTimeout: 8000 });
    const [rows] = await c.query(sql);
    const [[u]] = await c.query('SELECT CURRENT_USER() AS u');
    await c.end();
    console.log(`✅ ${label} — เชื่อมต่อได้ (บัญชี ${u.u}) ${JSON.stringify(rows[0] ?? {})}`);
    return true;
  } catch (x) {
    const hint = x.errno === 1045 ? ' → รหัสผ่านใน .env ไม่ตรงกับในฐานข้อมูล' : x.errno === 1142 ? ' → ยังไม่ได้ให้สิทธิ์อ่านตารางนี้' : '';
    console.log(`❌ ${label} — ${x.code || ''} ${String(x.message).split('\n')[0].slice(0, 120)}${hint}`);
    return false;
  }
}
const app = { host: e.DB_HOST, port: Number(e.DB_PORT) || 3306, user: e.DB_USER, password: e.DB_PASSWORD, database: e.DB_NAME };
const hos = { host: e.HOSOFFICE_DB_HOST, port: Number(e.HOSOFFICE_DB_PORT) || 3306, user: e.HOSOFFICE_DB_USER, password: e.HOSOFFICE_DB_PASSWORD, database: e.HOSOFFICE_DB_NAME };
console.log(`ฐานแอป: ${app.user}@${app.host}/${app.database}   Hosoffice: ${hos.user}@${hos.host}/${hos.database}`);
const a = await probe('ฐานของแอป (computer_stock)', app, 'SELECT COUNT(*) AS fiscal_months FROM fiscal_months');
const b = hos.host ? await probe('Hosoffice (ใบรับ sup_stock_card)', hos, "SELECT COUNT(*) AS rows_inven2 FROM sup_stock_card WHERE INVEN_ID = '2'") : false;
const c = hos.host ? await probe('Hosoffice (hr_person: คอลัมน์ล็อกอิน)', hos, 'SELECT COUNT(`ID`) AS persons FROM hr_person') : false;
process.exit(a && b && c ? 0 : 1);
