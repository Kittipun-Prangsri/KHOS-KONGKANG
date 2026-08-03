import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbHost = process.env.SUPABASE_DB_HOST || 'db.hxejooyqjjrdycxzgdkp.supabase.co';
const dbPort = Number(process.env.SUPABASE_DB_PORT) || 5432;
const dbUser = process.env.SUPABASE_DB_USER || 'postgres';
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;
const dbName = process.env.SUPABASE_DB_NAME || 'postgres';

if (!dbPassword) {
  console.log('------------------------------------------------------------------');
  console.log('📌 คำแนะนำการติดตั้งฐานข้อมูลบน Supabase Dashboard (SQL Editor):');
  console.log('------------------------------------------------------------------');
  console.log('เนื่องจากไม่ได้ระบุ SUPABASE_DB_PASSWORD ในไฟล์ .env คุณสามารถคัดลอก SQL ไปรันบนเว็บได้ตามขั้นตอนดังนี้:\n');
  console.log('1. เปิด Supabase SQL Editor: https://supabase.com/dashboard/project/hxejooyqjjrdycxzgdkp/sql/new');
  console.log('2. คัดลอกและรันไฟล์: stock_computer_schema_pg.sql');
  console.log('3. คัดลอกและรันส่วนที่ 2 ในไฟล์: stock_triggers_procedures.sql');
  console.log('4. คัดลอกและรันไฟล์: seed_data.sql');
  console.log('------------------------------------------------------------------\n');
  process.exit(0);
}

const client = new pg.Client({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  ssl: { rejectUnauthorized: false }
});

async function runSetup() {
  try {
    console.log('🔌 กำลังเชื่อมต่อกับ Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ เชื่อมต่อฐานข้อมูล Supabase สำเร็จ!');

    const schemaSql = fs.readFileSync(path.join(__dirname, '../stock_computer_schema_pg.sql'), 'utf8');
    const triggersSql = fs.readFileSync(path.join(__dirname, '../stock_triggers_procedures.sql'), 'utf8');
    const seedSql = fs.readFileSync(path.join(__dirname, '../seed_data.sql'), 'utf8');

    // Extract PostgreSQL Trigger section
    const pgTriggerIndex = triggersSql.indexOf('-- ส่วนที่ 2: สำหรับ PostgreSQL');
    const pgTriggerSql = pgTriggerIndex !== -1 ? triggersSql.substring(pgTriggerIndex) : triggersSql;

    console.log('⏳ กำลังสร้าง DDL Schema...');
    await client.query(schemaSql);

    console.log('⏳ กำลังสร้าง Triggers & PL/pgSQL Stored Procedures...');
    await client.query(pgTriggerSql);

    console.log('⏳ กำลังลงข้อมูลเริ่มต้น (Seed Data)...');
    await client.query(seedSql);

    console.log('🎉 ติดตั้งฐานข้อมูลบน Supabase เรียบร้อยแล้ว!');
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดในการติดตั้ง Supabase DB:', err.message);
  } finally {
    await client.end();
  }
}

runSetup();
