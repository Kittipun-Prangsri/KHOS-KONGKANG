import './config.js';                                   // ต้องเป็นอันดับแรก: โหลด .env + ด่านป้องกัน DB
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { pool } from './db.js';
import { loadSession, requireAuth, csrfGuard } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import stockRoutes from './routes/stock.js';
import movementRoutes from './routes/movements.js';
import reportRoutes from './routes/reports.js';
import syncRoutes from './routes/sync.js';
import adminRoutes from './routes/admin.js';
import importRoutes from './routes/import.js';
import { startScheduler } from './services/hosoffice-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

// ส่วนหัวความปลอดภัยพื้นฐาน (ไม่โหลดอะไรจากภายนอก จึงเข้มได้)
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
if (config.corsOrigins.length) app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(loadSession);

// ---- API ----------------------------------------------------------------------
app.use('/api/auth', csrfGuard, authRoutes);              // ล็อกอิน/ออก/ข้อมูลตัวเอง (ล็อกอินเข้าได้โดยไม่ต้องมี session)
app.use('/api', requireAuth, csrfGuard);                  // ทุกอย่างหลังจากนี้ต้องล็อกอิน
app.use('/api/meta', metaRoutes);
app.use('/api', stockRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api', reportRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/import', importRoutes);
app.use('/api', (_req, res) => res.status(404).json({ success: false, message: 'ไม่พบ API นี้' }));

// ---- หน้าเว็บ -------------------------------------------------------------------
app.use('/assets', express.static(path.join(PUBLIC, 'assets'), { maxAge: config.isProd ? '7d' : 0 }));
app.use('/js', express.static(path.join(PUBLIC, 'js'), { maxAge: config.isProd ? '1h' : 0 }));
app.get('/login', (req, res) => (req.user ? res.redirect('/') : res.sendFile(path.join(PUBLIC, 'login.html'))));
app.get('/', (req, res) => (req.user ? res.sendFile(path.join(PUBLIC, 'index.html')) : res.redirect('/login')));
app.get('/templates/:name', requireAuth, (req, res) => {
  const ok = { 'sample_items.csv': 1, 'sample_movements.csv': 1 };
  if (!ok[req.params.name]) return res.status(404).end();
  res.sendFile(path.join(__dirname, '..', 'templates', req.params.name));
});
app.use((_req, res) => res.status(404).redirect('/'));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ success: false, message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' });
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, message: 'ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป' });
  console.error(`unhandled: ${err?.code || ''} ${err?.message || err}`.slice(0, 300));
  res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
});

// ล้าง session ที่หมดอายุทุกชั่วโมง
setInterval(() => pool.query('DELETE FROM app_sessions WHERE expires_at < NOW()').catch(() => {}), 3600_000).unref();

app.listen(config.port, config.host, () => {
  console.log(`🚀 KONGKANG Stock running on ${config.host}:${config.port}`);
  startScheduler(pool);
});
