import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import { body, param, validationResult } from 'express-validator';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5189;

// -----------------------------------------------------------------------------
// Security: Basic Auth + CORS allow-list + static whitelist
// -----------------------------------------------------------------------------
const AUTH_USER = process.env.AUTH_USER;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
if (!AUTH_USER || !AUTH_PASSWORD) {
  console.error('❌ ต้องตั้ง AUTH_USER และ AUTH_PASSWORD ใน .env ก่อนเริ่มเซิร์ฟเวอร์ (ระบบไม่เปิดโดยไม่มีรหัสผ่าน)');
  process.exit(1);
}

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

const basicAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    // ตรวจทั้งสองค่าเสมอ เพื่อไม่ให้เวลาตอบสนองเผยว่าผิดที่ช่องไหน
    const okUser = safeEqual(user, AUTH_USER);
    const okPass = safeEqual(pass, AUTH_PASSWORD);
    if (idx >= 0 && okUser && okPass) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="KONGKANG Stock", charset="UTF-8"');
  res.status(401).json({ success: false, message: 'ต้องเข้าสู่ระบบ' });
};

// CORS: ปิดโดยค่าเริ่มต้น (dashboard เรียก API origin เดียวกัน) เปิดเฉพาะ origin ที่ระบุใน CORS_ORIGINS
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins, credentials: true }));
}

app.use(basicAuth);
app.use(express.json({ limit: '10mb' }));

// Multer in-memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// เสิร์ฟเฉพาะไฟล์ที่จำเป็น (ห้าม express.static ทั้งโฟลเดอร์โปรเจกต์ เพราะจะเปิดเผย .sql/.xlsx/scripts)
const publicFile = (name) => (req, res) => res.sendFile(path.join(__dirname, '..', name));
app.get('/', publicFile('stock-dashboard.html'));
app.get('/dashboard', publicFile('stock-dashboard.html'));
app.get('/sample_items.csv', publicFile('sample_items.csv'));
app.get('/sample_movements.csv', publicFile('sample_movements.csv'));

// Database Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'computer_stock',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Middleware for validation errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// -----------------------------------------------------------------------------
// Core API Endpoints
// -----------------------------------------------------------------------------

// 1. GET /api/items - ดึงรายการวัสดุทั้งหมด (สำหรับ Dropdown ในฟอร์ม)
app.get('/api/items', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.id, i.item_code, i.name, i.unit, i.unit_price, i.reorder_point, ic.name AS category_name
      FROM items i
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      WHERE i.status = 'active'
      ORDER BY i.item_code ASC
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 2. GET /api/stock/current - ดึงสต๊อกคงเหลือล่าสุดทุกรายการ (จาก v_current_stock)
app.get('/api/stock/current', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM v_current_stock ORDER BY item_code ASC`);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching current stock:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 3. GET /api/stock/low - ดึงเฉพาะรายการที่ใกล้หมด (สำหรับแจ้งเตือน)
app.get('/api/stock/low', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM v_current_stock WHERE is_low_stock = 1 ORDER BY current_qty ASC`);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching low stock:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 4. GET /api/summary/:fiscalMonthId - สรุปยอดทุกรายการของเดือนที่ระบุ
app.get('/api/summary/:fiscalMonthId', [
  param('fiscalMonthId').isInt().toInt()
], validate, async (req, res) => {
  try {
    const { fiscalMonthId } = req.params;
    const [rows] = await pool.query(`
      SELECT 
        mss.*,
        i.item_code,
        i.name AS item_name,
        i.unit,
        ic.name AS category_name,
        fm.month_name,
        fm.calendar_year_ad + 543 AS calendar_year_th
      FROM monthly_stock_summary mss
      JOIN items i ON mss.item_id = i.id
      LEFT JOIN item_categories ic ON i.category_id = ic.id
      JOIN fiscal_months fm ON mss.fiscal_month_id = fm.id
      WHERE mss.fiscal_month_id = ?
      ORDER BY i.item_code ASC
    `, [fiscalMonthId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching monthly summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 5. GET /api/summary/annual/:fiscalYearId - สรุปยอดรวมรายปี
app.get('/api/summary/annual/:fiscalYearId', [
  param('fiscalYearId').isInt().toInt()
], validate, async (req, res) => {
  try {
    const { fiscalYearId } = req.params;
    const [rows] = await pool.query(`
      SELECT * FROM v_annual_summary 
      WHERE fiscal_year_id = ?
      ORDER BY item_code ASC
    `, [fiscalYearId]);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching annual summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 6. POST /api/movements - บันทึกรับเข้า/จ่ายออก 1 รายการ
app.post('/api/movements', [
  body('item_id').isInt({ min: 1 }),
  body('fiscal_month_id').isInt({ min: 1 }),
  body('movement_type').isIn(['receive', 'issue']),
  body('quantity').isInt({ min: 1 }),
  body('unit_price').isFloat({ min: 0 }),
  body('movement_date').isDate(),
  body('reference_no').optional().isString(),
  body('note').optional().isString(),
  body('created_by').optional().isInt()
], validate, async (req, res) => {
  const { item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, created_by } = req.body;

  try {
    if (movement_type === 'issue') {
      const [stockRows] = await pool.query(`
        SELECT COALESCE(curr.closing_qty, 0) AS current_qty
        FROM items i
        LEFT JOIN (
          SELECT mss1.*
          FROM monthly_stock_summary mss1
          INNER JOIN (
            SELECT item_id, MAX(fiscal_month_id) AS max_month_id
            FROM monthly_stock_summary
            GROUP BY item_id
          ) mss2 ON mss1.item_id = mss2.item_id AND mss1.fiscal_month_id = mss2.max_month_id
        ) curr ON i.id = curr.item_id
        WHERE i.id = ?
      `, [item_id]);

      const currentQty = stockRows[0]?.current_qty || 0;
      if (currentQty < quantity) {
        return res.status(400).json({
          success: false,
          message: `จำนวนคงเหลือไม่พอสำหรับเบิกออก (คงเหลือปัจจุบัน: ${currentQty} ${movement_type})`
        });
      }
    }

    const [result] = await pool.query(`
      INSERT INTO stock_movements 
      (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no || null, note || null, created_by || null]);

    res.status(201).json({
      success: true,
      message: 'บันทึกรายการเคลื่อนไหววัสดุเรียบร้อยแล้ว',
      movement_id: result.insertId
    });
  } catch (error) {
    console.error('Error inserting stock movement:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 7. PATCH /api/summary/:id/sign - ลงนามอนุมัติยอดเดือนของ 1 รายการ
app.patch('/api/summary/:id/sign', [
  param('id').isInt().toInt(),
  body('signed_by').isInt({ min: 1 })
], validate, async (req, res) => {
  const { id } = req.params;
  const { signed_by } = req.body;

  try {
    const [result] = await pool.query(`
      UPDATE monthly_stock_summary
      SET is_signed = 1, signed_by = ?, signed_at = NOW()
      WHERE id = ?
    `, [signed_by, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'ไม่พบรายการสรุปประจำเดือนที่ระบุ' });
    }

    res.json({ success: true, message: 'ลงนามอนุมัติยอดเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error signing summary:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 7.5 GET /api/external/valuation/:invenId - Query valuation from external/temp table sup_rep_tmp_04
app.get('/api/external/valuation/:invenId', [
  param('invenId').isString()
], validate, async (req, res) => {
  const { invenId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT SUP_ID, MONEY_TOTAL FROM sup_rep_tmp_04 WHERE INVEN_ID = ?`,
      [invenId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.warn(`Database query for sup_rep_tmp_04 failed:`, error.message || error);
    return res.json({ success: false, error: error.message || String(error) });
  }
});

// -----------------------------------------------------------------------------
// Import Excel / CSV Endpoints
// -----------------------------------------------------------------------------

// 8. POST /api/import/items - Batch Import Master Items
app.post('/api/import/items', async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'ข้อมูลรายการวัสดุไม่ถูกต้องหรือว่างเปล่า' });
  }

  try {
    let insertedCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      const itemCode = String(item.item_code || '').trim();
      const name = String(item.name || '').trim();
      const unit = String(item.unit || 'ชิ้น').trim();
      const unitPrice = parseFloat(item.unit_price) || 0.00;
      const reorderPoint = parseInt(item.reorder_point) || 10;

      if (!itemCode || !name) continue;

      const [result] = await pool.query(`
        INSERT INTO items (category_id, item_code, name, unit, unit_price, reorder_point)
        VALUES (1, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          unit = VALUES(unit),
          unit_price = VALUES(unit_price),
          reorder_point = VALUES(reorder_point)
      `, [itemCode, name, unit, unitPrice, reorderPoint]);

      if (result.affectedRows === 1) insertedCount++;
      else if (result.affectedRows === 2) updatedCount++;
    }

    res.json({
      success: true,
      message: `นำเข้าข้อมูลวัสดุ Master สำเร็จ (เพิ่มใหม่ ${insertedCount} รายการ, อัปเดต ${updatedCount} รายการ)`
    });
  } catch (error) {
    console.error('Error batch importing items:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการนำเข้าข้อมูลวัสดุ' });
  }
});

// 9. POST /api/import/movements - Batch Import Stock Movements
app.post('/api/import/movements', async (req, res) => {
  const { movements } = req.body;

  if (!Array.isArray(movements) || movements.length === 0) {
    return res.status(400).json({ success: false, message: 'ข้อมูลรายการรับ-จ่ายไม่ถูกต้องหรือว่างเปล่า' });
  }

  try {
    let successCount = 0;
    const errors = [];

    for (const m of movements) {
      const itemCode = String(m.item_code || '').trim();
      const type = String(m.movement_type || 'receive').toLowerCase().trim();
      const qty = parseInt(m.quantity) || 0;
      const price = parseFloat(m.unit_price) || 0.00;
      const date = m.movement_date || new Date().toISOString().split('T')[0];
      const ref = m.reference_no || null;
      const note = m.note || null;
      const fiscalMonthId = parseInt(m.fiscal_month_id) || 4; // Default ม.ค. 2569

      if (!itemCode || qty <= 0) continue;

      // Find item ID by code
      const [itemRows] = await pool.query(`SELECT id FROM items WHERE item_code = ?`, [itemCode]);
      if (itemRows.length === 0) {
        errors.push(`ไม่พบรหัสวัสดุ: ${itemCode}`);
        continue;
      }
      const itemId = itemRows[0].id;

      await pool.query(`
        INSERT INTO stock_movements 
        (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [itemId, fiscalMonthId, type, qty, price, date, ref, note]);

      successCount++;
    }

    res.json({
      success: true,
      message: `นำเข้าบันทึกรับ-จ่ายสำเร็จ ${successCount} รายการ`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error batch importing movements:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการนำเข้าบันทึกรับ-จ่าย' });
  }
});

// 10. POST /api/import/excel-csv - Upload & Parse Excel/CSV File
app.post('/api/import/excel-csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์ Excel หรือ CSV' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);

    if (rawRows.length === 0) {
      return res.status(400).json({ success: false, message: 'ไฟล์ไม่มีข้อมูลแถวรายการ' });
    }

    res.json({
      success: true,
      filename: req.file.originalname,
      total_rows: rawRows.length,
      data: rawRows
    });
  } catch (error) {
    console.error('Error parsing Excel/CSV:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอ่านไฟล์ Excel/CSV' });
  }
});

// Start Server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT} (Basic Auth enabled)`);
});
