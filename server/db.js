import mysql from 'mysql2/promise';
import './config.js';

// ฐานของแอป (computer_stock) — อ่าน/เขียน
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'computer_stock',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,   // DATE/DATETIME เป็นสตริง ไม่เพี้ยนเพราะ timezone
  charset: 'utf8mb4',  // บังคับชุดอักขระ กันข้อความไทยเพี้ยนตอนเขียน/อ่าน
});
// กันพลาด: option charset ด้านบนอาจไม่ถูกตีความตามที่ต้องการในบางเวอร์ชันของไดรเวอร์
// บังคับซ้ำด้วย SET NAMES ทุกครั้งที่เปิด connection ใหม่ในพูล (ทางที่แน่นอนที่สุด)
pool.pool.on('connection', (c) => c.query("SET NAMES utf8mb4"));
