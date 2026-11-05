// กราฟ SVG เขียนเอง (ไม่พึ่งไลบรารี/อินเทอร์เน็ต) — คืนสตริง HTML
import { compact, esc } from './ui.js';

// กราฟพื้นที่ + แท่ง: เส้น = มูลค่าคงเหลือปลายเดือน, แท่ง = มูลค่าที่จ่ายออก
export function trendChart(points, { height = 220 } = {}) {
  if (!points.length) return '';
  const W = 640, H = height, L = 44, R = 12, T = 14, B = 30;
  const w = W - L - R, h = H - T - B;
  const maxV = Math.max(1, ...points.map((p) => Math.max(p.closing, p.issued))) * 1.12;
  const x = (i) => L + (points.length === 1 ? w / 2 : (i * w) / (points.length - 1));
  const y = (v) => T + h - (v / maxV) * h;
  const barW = Math.min(26, w / points.length - 8);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.closing).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${T + h} L${x(0).toFixed(1)},${T + h} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = (maxV * f); const yy = y(v);
    return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="currentColor" stroke-opacity=".08"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".5">${compact(v)}</text>`;
  }).join('');
  const bars = points.map((p, i) => `<rect x="${(x(i) - barW / 2).toFixed(1)}" y="${y(p.issued).toFixed(1)}" width="${barW}" height="${Math.max(0, T + h - y(p.issued)).toFixed(1)}" rx="5" fill="url(#gBar)"/>`).join('');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.closing).toFixed(1)}" r="4" fill="#fff" stroke="#0d9488" stroke-width="2.5"><title>${esc(p.label)}: คงเหลือ ${compact(p.closing)} · จ่ายออก ${compact(p.issued)} บาท</title></circle>`).join('');
  const labels = points.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="currentColor" fill-opacity=".6">${esc(p.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="h-auto w-full" role="img" aria-label="แนวโน้มมูลค่าวัสดุคงเหลือและการจ่ายออก 12 เดือน">
    <defs>
      <linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14b8a6" stop-opacity=".35"/><stop offset="1" stop-color="#14b8a6" stop-opacity="0"/></linearGradient>
      <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#6366f1" stop-opacity=".55"/></linearGradient>
    </defs>
    ${grid}${bars}<path d="${area}" fill="url(#gArea)"/><path d="${line}" fill="none" stroke="#0d9488" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>${dots}${labels}
  </svg>`;
}

// โดนัท: สัดส่วนรายการที่ "ปกติ" (เขียว) / "ใกล้หมด" (เหลือง) / "หมด" (แดง)
export function donut(parts, centerTop, centerBottom, size = 150) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = 54, c = 2 * Math.PI * r; let off = 0;
  const segs = parts.filter((p) => p.value > 0).map((p) => {
    const len = (p.value / total) * c;
    const s = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${Math.max(0, len - 3)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(p.label)}: ${p.value}</title></circle>`;
    off += len; return s;
  }).join('');
  return `<svg viewBox="0 0 140 140" width="${size}" height="${size}" role="img" aria-label="${esc(centerTop)} ${esc(centerBottom)}">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="14"/>${segs}
    <text x="70" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="currentColor">${esc(centerTop)}</text>
    <text x="70" y="88" text-anchor="middle" font-size="10.5" fill="currentColor" fill-opacity=".6">${esc(centerBottom)}</text></svg>`;
}

// แถบเปรียบเทียบคงเหลือกับจุดสั่งซื้อ
export function stockBar(qty, reorder) {
  const max = Math.max(reorder * 3, qty, 1);
  const pct = Math.max(0, Math.min(100, (qty / max) * 100)), mark = Math.min(100, (reorder / max) * 100);
  const color = qty <= 0 ? 'bg-rose-500' : qty <= reorder ? 'bg-amber-500' : 'bg-emerald-500';
  return `<div class="relative h-1.5 w-24 rounded-full bg-slate-900/10 dark:bg-white/10"><div class="h-full rounded-full ${color}" style="width:${pct}%"></div><div class="absolute -top-0.5 h-2.5 w-px bg-slate-500/60" style="left:${mark}%" title="จุดสั่งซื้อ ${reorder}"></div></div>`;
}
