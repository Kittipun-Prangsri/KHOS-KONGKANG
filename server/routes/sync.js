import { Router } from 'express';
import { pool } from '../db.js';
import { fail } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { runSync, getStatus } from '../services/hosoffice-sync.js';
import { audit } from '../services/audit.js';

const router = Router();

router.get('/status', async (_req, res) => {
  try { res.json({ success: true, data: await getStatus(pool) }); } catch (e) { fail(res, e, 'sync status'); }
});

// ?dry=1 = ทดลองคำนวณ ไม่เขียนข้อมูล (เจ้าหน้าที่ทำได้) / sync จริง = ผู้ดูแลเท่านั้น
router.post('/hosoffice', async (req, res, next) => {
  const dry = req.query.dry === '1';
  return requireRole(dry ? 'staff' : 'admin')(req, res, async () => {
    try {
      const result = await runSync(pool, { dryRun: dry, triggerBy: 'manual' });
      await audit(req, dry ? 'sync.dry' : 'sync.run', 'hosoffice', null,
        { inserted: result.inserted, updated: result.updated, deleted: result.deleted });
      res.json({ success: true, data: result });
    } catch (e) {
      console.error('sync failed:', e.message);
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

export default router;
