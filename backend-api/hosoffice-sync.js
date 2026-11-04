// =============================================================================
// Sync รับ-จ่ายวัสดุจาก Hosoffice -> stock_movements (อ่านอย่างเดียวฝั่ง Hosoffice)
//   รับ : sup_stock_card (REC_OPEN_TYPE='REC')
//   จ่าย: sup_open_inven + sup_open_inven_detail (STATUS='SUCCESS')
// ไม่ดึงคอลัมน์ชื่อบุคคลใด ๆ จาก Hosoffice
// ยอดคงเหลือคำนวณโดย trigger ในฐานข้อมูลเหมือนเดิม
// =============================================================================
import mysql from 'mysql2/promise';
import { guardAppDb } from './db-guard.js';

const SOURCE = 'hosoffice';
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

let hosPool = null;
let running = false;

export const isConfigured = () => Boolean(process.env.HOSOFFICE_DB_HOST && process.env.HOSOFFICE_DB_USER);

function getHosPool() {
  if (!hosPool) {
    hosPool = mysql.createPool({
      host: process.env.HOSOFFICE_DB_HOST,
      port: Number(process.env.HOSOFFICE_DB_PORT) || 3306,
      user: process.env.HOSOFFICE_DB_USER,
      password: process.env.HOSOFFICE_DB_PASSWORD || '',
      database: process.env.HOSOFFICE_DB_NAME || 'hosoffice',
      connectionLimit: 2,
      dateStrings: true,        // คืนค่า DATE เป็นสตริง YYYY-MM-DD ไม่ให้เพี้ยนเพราะ timezone
      decimalNumbers: true,
    });
    // กันพลาด: ทุก connection ไป Hosoffice เป็นแบบอ่านอย่างเดียว
    hosPool.pool.on('connection', (c) => c.query('SET SESSION TRANSACTION READ ONLY'));
  }
  return hosPool;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// --- อ่านข้อมูลจาก Hosoffice -------------------------------------------------
async function readSource(invenId, fromDate) {
  const pool = getHosPool();
  const wanted = new Map();
  const skipped = { non_integer_qty: 0, other_types: {} };

  const [recs] = await pool.query(
    `SELECT ID, SUP_ID, SUP_NAME, UNIT_NAME, REC_OPEN_DATE, REC_TOTAL, PRICE_PER_UNIT, REC_OPEN_CODE
       FROM sup_stock_card
      WHERE INVEN_ID = ? AND REC_OPEN_DATE >= ? AND REC_OPEN_TYPE = 'REC' AND REC_TOTAL > 0`,
    [String(invenId), fromDate]);
  for (const r of recs) {
    wanted.set(`REC:${r.ID}`, {
      type: 'receive', code: String(r.SUP_ID).trim(), name: r.SUP_NAME, unit: r.UNIT_NAME,
      date: String(r.REC_OPEN_DATE).slice(0, 10), qty: Number(r.REC_TOTAL),
      price: r2(r.PRICE_PER_UNIT), ref: r.REC_OPEN_CODE || null,
      note: 'รับเข้า (sync จาก Hosoffice)',
    });
  }

  const [others] = await pool.query(
    `SELECT REC_OPEN_TYPE AS t, COUNT(*) AS n FROM sup_stock_card
      WHERE INVEN_ID = ? AND REC_OPEN_DATE >= ? AND (REC_OPEN_TYPE IS NULL OR REC_OPEN_TYPE <> 'REC')
      GROUP BY REC_OPEN_TYPE`, [String(invenId), fromDate]);
  for (const o of others) skipped.other_types[o.t ?? '(null)'] = o.n;

  const [iss] = await pool.query(
    `SELECT d.ID, h.OPEN_CODE, h.OPEN_DATE, h.RECEIVE_DEP_NAME,
            d.SUP_ID, d.SUP_NAME, d.UNIT_NAME, d.OPEN_TOTAL, d.PRICE_PER_UNIT
       FROM sup_open_inven h
       JOIN sup_open_inven_detail d ON d.OPEN_ID = h.ID
      WHERE h.INVEN_ID = ? AND h.STATUS = 'SUCCESS' AND h.OPEN_DATE >= ? AND d.OPEN_TOTAL > 0`,
    [Number(invenId), fromDate]);
  for (const r of iss) {
    const qty = Number(r.OPEN_TOTAL);
    if (!Number.isInteger(qty)) { skipped.non_integer_qty++; continue; }
    wanted.set(`OPEN:${r.ID}`, {
      type: 'issue', code: String(r.SUP_ID).trim(), name: r.SUP_NAME, unit: r.UNIT_NAME,
      date: String(r.OPEN_DATE).slice(0, 10), qty,
      price: r2(r.PRICE_PER_UNIT), ref: r.OPEN_CODE || null,
      note: r.RECEIVE_DEP_NAME ? `เบิกให้ ${r.RECEIVE_DEP_NAME}` : 'เบิกจ่าย (sync จาก Hosoffice)',
    });
  }
  return { wanted, skipped };
}

// --- ปีงบ/เดือนงบ: สร้างให้อัตโนมัติถ้ายังไม่มี (เช่นปีงบ 2570) ---------------
async function makeFiscalMonthResolver(conn) {
  const cache = new Map();
  return async function resolve(dateStr) {
    const ym = dateStr.slice(0, 7);
    if (cache.has(ym)) return cache.get(ym);
    const [rows] = await conn.query(
      'SELECT id FROM fiscal_months WHERE ? BETWEEN start_date AND end_date LIMIT 1', [dateStr]);
    if (rows.length) { cache.set(ym, rows[0].id); return rows[0].id; }

    const y = Number(dateStr.slice(0, 4)); const m = Number(dateStr.slice(5, 7));
    const startYear = m >= 10 ? y : y - 1;                // ปีงบเริ่ม 1 ต.ค.
    const yearName = String(startYear + 544);             // ค.ศ. -> พ.ศ. ของปีงบ (2025 -> 2569)
    await conn.query(
      'INSERT IGNORE INTO fiscal_years (year_name, start_date, end_date, is_active) VALUES (?, ?, ?, 1)',
      [yearName, `${startYear}-10-01`, `${startYear + 1}-09-30`]);
    const [[fy]] = await conn.query('SELECT id FROM fiscal_years WHERE year_name = ?', [yearName]);
    for (let no = 1; no <= 12; no++) {
      const calMonth = ((no + 8) % 12) + 1;               // 1->10, 2->11, ... 4->1
      const calYear = calMonth >= 10 ? startYear : startYear + 1;
      const last = new Date(Date.UTC(calYear, calMonth, 0)).getUTCDate();
      const mm = String(calMonth).padStart(2, '0');
      await conn.query(
        `INSERT IGNORE INTO fiscal_months
           (fiscal_year_id, month_no, month_name, calendar_month, calendar_year_ad, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fy.id, no, THAI_MONTHS[calMonth - 1], calMonth, calYear, `${calYear}-${mm}-01`, `${calYear}-${mm}-${last}`]);
    }
    const [again] = await conn.query(
      'SELECT id FROM fiscal_months WHERE ? BETWEEN start_date AND end_date LIMIT 1', [dateStr]);
    cache.set(ym, again[0].id);
    return again[0].id;
  };
}

// --- ตัวหลัก ----------------------------------------------------------------
export async function runSync(appPool, { dryRun = false, triggerBy = 'manual' } = {}) {
  if (!isConfigured()) throw new Error('ยังไม่ได้ตั้งค่า HOSOFFICE_DB_* ใน .env');
  guardAppDb();
  if (running) throw new Error('กำลัง sync อยู่ กรุณารอสักครู่');
  running = true;

  const invenId = process.env.HOSOFFICE_INVEN_ID || '2';
  const fromDate = process.env.SYNC_FROM_DATE || '2025-10-01';
  const startedAt = new Date();
  const result = { dryRun, invenId, fromDate, inserted: 0, updated: 0, deleted: 0, itemsCreated: [], skipped: {}, monthly: {} };
  let runId = null;

  try {
    if (!dryRun) {
      const [r] = await appPool.query(
        "INSERT INTO sync_runs (started_at, status, trigger_by) VALUES (?, 'running', ?)", [startedAt, triggerBy]);
      runId = r.insertId;
    }

    const { wanted, skipped } = await readSource(invenId, fromDate);
    result.skipped = skipped;
    result.sourceRows = wanted.size;
    for (const w of wanted.values()) {
      const k = `${w.date.slice(0, 7)} ${w.type}`;
      result.monthly[k] = (result.monthly[k] || 0) + w.qty;
    }

    const conn = await appPool.getConnection();
    try {
      const [existingRows] = await conn.query(
        `SELECT id, source_id, item_id, fiscal_month_id, movement_type, quantity, unit_price,
                DATE_FORMAT(movement_date, '%Y-%m-%d') AS movement_date
           FROM stock_movements WHERE source_system = ?`, [SOURCE]);
      const existing = new Map(existingRows.map(r => [r.source_id, r]));

      // กันพลาด: ถ้าอ่านต้นทางได้ 0 แถวทั้งที่เคย sync มาแล้ว ให้หยุด ไม่ลบอะไรทั้งนั้น
      if (wanted.size === 0 && existing.size > 0) {
        throw new Error('อ่านข้อมูลจาก Hosoffice ได้ 0 แถว แต่ในระบบมีข้อมูลที่ sync ไว้แล้ว — ยกเลิกเพื่อความปลอดภัย');
      }

      const [itemRows] = await conn.query('SELECT id, item_code FROM items');
      const itemIds = new Map(itemRows.map(r => [r.item_code, r.id]));

      if (dryRun) {
        const missing = new Set();
        let ins = 0, upd = 0;
        for (const [sid, w] of wanted) {
          if (!itemIds.has(w.code)) missing.add(w.code);
          const e = existing.get(sid);
          if (!e) ins++;
          else if (e.quantity !== w.qty || Number(e.unit_price) !== w.price || e.movement_date !== w.date) upd++;
        }
        result.inserted = ins; result.updated = upd;
        result.deleted = [...existing.keys()].filter(k => !wanted.has(k)).length;
        result.itemsCreated = [...missing].map(c => `(จะสร้าง) ${c}`);
        return result;
      }

      const resolveMonth = await makeFiscalMonthResolver(conn);
      await conn.beginTransaction();

      for (const w of wanted.values()) {
        if (itemIds.has(w.code)) continue;
        const [r] = await conn.query(
          'INSERT INTO items (category_id, item_code, name, unit, unit_price, reorder_point) VALUES (1, ?, ?, ?, ?, 10)',
          [w.code, w.name || w.code, w.unit || 'ชิ้น', w.price]);
        itemIds.set(w.code, r.insertId);
        result.itemsCreated.push(`${w.code} ${w.name || ''}`.trim());
      }

      for (const [sid, w] of wanted) {
        const itemId = itemIds.get(w.code);
        const fmId = await resolveMonth(w.date);
        const e = existing.get(sid);
        if (!e) {
          await conn.query(
            `INSERT INTO stock_movements
               (item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date,
                reference_no, note, source_system, source_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [itemId, fmId, w.type, w.qty, w.price, w.date, w.ref, w.note, SOURCE, sid]);
          result.inserted++;
        } else if (e.item_id !== itemId || e.fiscal_month_id !== fmId || e.quantity !== w.qty ||
                   Number(e.unit_price) !== w.price || e.movement_date !== w.date || e.movement_type !== w.type) {
          await conn.query(
            `UPDATE stock_movements SET item_id=?, fiscal_month_id=?, movement_type=?, quantity=?,
                    unit_price=?, movement_date=?, reference_no=?, note=? WHERE id=?`,
            [itemId, fmId, w.type, w.qty, w.price, w.date, w.ref, w.note, e.id]);
          result.updated++;
        }
      }

      for (const [sid, e] of existing) {
        if (!wanted.has(sid)) {
          await conn.query('DELETE FROM stock_movements WHERE id = ?', [e.id]);
          result.deleted++;
        }
      }
      await conn.commit();
    } catch (err) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw err;
    } finally {
      conn.release();
    }

    await appPool.query(
      `UPDATE sync_runs SET finished_at = NOW(), status = 'success', inserted_count = ?, updated_count = ?,
              deleted_count = ?, message = ? WHERE id = ?`,
      [result.inserted, result.updated, result.deleted, JSON.stringify({ skipped: result.skipped, itemsCreated: result.itemsCreated }), runId]);
    return result;
  } catch (err) {
    if (runId) {
      await appPool.query("UPDATE sync_runs SET finished_at = NOW(), status = 'error', message = ? WHERE id = ?",
        [String(err.message || err).slice(0, 1000), runId]).catch(() => {});
    }
    throw err;
  } finally {
    running = false;
  }
}

export async function getStatus(appPool) {
  const [rows] = await appPool.query('SELECT * FROM sync_runs ORDER BY id DESC LIMIT 10');
  return { configured: isConfigured(), running, recent: rows };
}

export function startScheduler(appPool) {
  const minutes = Number(process.env.SYNC_INTERVAL_MIN);
  if (!isConfigured() || !minutes || minutes <= 0) return;
  console.log(`🔄 Hosoffice sync ทุก ${minutes} นาที`);
  const tick = () => runSync(appPool, { triggerBy: 'schedule' })
    .then(r => console.log(`🔄 sync สำเร็จ +${r.inserted} ~${r.updated} -${r.deleted}`))
    .catch(e => console.error('🔄 sync ผิดพลาด:', e.message));
  setTimeout(tick, 10_000);
  setInterval(tick, minutes * 60_000);
}
