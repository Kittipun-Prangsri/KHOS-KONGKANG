// ตัวช่วยแสดงผล: จัดรูปแบบตัวเลข/วันที่ไทย, หนีอักขระพิเศษ (กัน XSS), toast, modal, drawer
const nf0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const n0 = (v) => nf0.format(Number(v) || 0);
export const baht = (v) => nf2.format(Number(v) || 0);
export const compact = (v) => new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v) || 0);

const MON = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const monthShort = (m) => MON[m] || '';
export function dateTh(s) {
  if (!s) return '-';
  const d = String(s).slice(0, 10).split('-').map(Number);
  return d.length === 3 && d[0] ? `${d[2]} ${MON[d[1]]} ${d[0] + 543}` : '-';
}
export function dateTimeTh(s) {
  if (!s) return '-';
  const [d, t] = String(s).replace('T', ' ').split(' ');
  return `${dateTh(d)} ${String(t || '').slice(0, 5)}`;
}
export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// หนีอักขระ HTML — ใช้กับข้อความที่มาจากฐานข้อมูล/ผู้ใช้ทุกครั้งก่อนใส่ใน template
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, kind = 'ok') {
  const root = $('#toasts');
  const color = { ok: 'bg-emerald-600', err: 'bg-rose-600', info: 'bg-slate-800' }[kind] || 'bg-slate-800';
  const el = document.createElement('div');
  el.className = `animate-rise pointer-events-auto rounded-xl ${color} px-4 py-3 text-sm text-white shadow-xl`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3800);
}

function mount(html, cls) {
  const root = $('#overlay');
  const wrap = document.createElement('div');
  wrap.className = cls;
  wrap.innerHTML = html;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  return { el: wrap, close };
}

export const modal = (html) => mount(
  `<div class="animate-rise card max-h-[92vh] w-full max-w-xl overflow-auto !bg-white p-6 shadow-2xl dark:!bg-slate-900" role="dialog" aria-modal="true">${html}</div>`,
  'fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm');

export const drawer = (html) => mount(
  `<aside class="animate-rise ml-auto h-full w-full max-w-lg overflow-auto bg-white p-6 shadow-2xl dark:bg-slate-900" role="dialog" aria-modal="true">${html}</aside>`,
  'fixed inset-0 z-50 flex bg-slate-950/50 backdrop-blur-sm');

export const skeleton = (rows = 5) => `<div class="grid gap-3">${Array.from({ length: rows }, () => '<div class="skeleton h-12 w-full"></div>').join('')}</div>`;
export const empty = (title, hint = '') => `<div class="grid place-items-center gap-2 px-6 py-16 text-center"><div class="text-4xl opacity-60">📭</div><p class="font-medium">${esc(title)}</p><p class="text-sm text-slate-500">${esc(hint)}</p></div>`;

export const csvDownload = (name, rows) => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ตัวเลขนับขึ้น (เคารพ prefers-reduced-motion)
export function countUp(el, to, fmt = n0, ms = 700) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
