// โหลด .env แล้วตรวจด่านป้องกันฐานข้อมูลก่อนทุกอย่าง (ต้อง import ไฟล์นี้เป็นอันดับแรกเสมอ)
import dotenv from 'dotenv';
import { guardAppDbOrExit } from './services/db-guard.js';

dotenv.config();
guardAppDbOrExit();

const num = (v, d) => (Number(v) > 0 ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 5189),
  host: process.env.HOST || '0.0.0.0',
  isProd: process.env.NODE_ENV === 'production',
  cookieSecure: process.env.COOKIE_SECURE === '1',        // ตั้ง 1 เมื่อใช้ HTTPS
  sessionHours: num(process.env.SESSION_HOURS, 8),
  // ความลับสำหรับแฮชชื่อที่พิมพ์ตอนล็อกอิน (ไม่เก็บเลขบัตรดิบ) ถ้าไม่ตั้งจะสุ่มใหม่ทุกครั้งที่เปิดเซิร์ฟเวอร์
  appSecret: process.env.APP_SECRET || '',
  // ทางเข้าฉุกเฉิน: ใช้ได้เฉพาะจากเครื่องที่รันเซิร์ฟเวอร์เอง (localhost) ไว้กู้สถานการณ์เมื่อยืนยันตัวตนกับ HR ยังใช้ไม่ได้
  emergencyAdmin: {
    enabled: process.env.EMERGENCY_ADMIN_ENABLED === '1',
    password: process.env.EMERGENCY_ADMIN_PASSWORD || '',
  },
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  hr: {
    table: process.env.HR_TABLE || '',
    idCol: process.env.HR_ID_COL || '',
    userCol: process.env.HR_USER_COL || '',
    passCol: process.env.HR_PASS_COL || '',
    algo: (process.env.HR_PASS_ALGO || '').toLowerCase(),  // plain|md5|sha1|sha256|bcrypt
    nameCols: (process.env.HR_NAME_COLS || '').split(',').map((s) => s.trim()).filter(Boolean),
    activeCol: process.env.HR_ACTIVE_COL || '',
    activeValue: process.env.HR_ACTIVE_VALUE ?? '1',
  },
};
