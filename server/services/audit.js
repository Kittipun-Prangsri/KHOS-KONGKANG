import { pool } from '../db.js';

export const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '').slice(0, 64);

// บันทึกประวัติการใช้งาน (ห้ามใส่รหัสผ่าน/โทเค็นใน detail)
export async function audit(req, action, entity = null, entityId = null, detail = null) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, action, entity, entity_id, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [req.user?.id ?? null, action, entity, entityId == null ? null : String(entityId),
        detail == null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 2000), clientIp(req)]);
  } catch (e) {
    console.error('audit failed:', e.message);   // ไม่ให้การบันทึกประวัติทำให้งานหลักล้ม
  }
}
