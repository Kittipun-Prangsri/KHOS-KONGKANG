import { api } from './api.js';
import { $, $$, esc, dateTimeTh, modal, toast } from './ui.js';

const ICON = {
  overview: '<path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>',
  stock: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  movements: '<path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/>',
  reports: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const svg = (name, cls = 'size-5') => `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const ROUTES = {
  overview: { label: 'ภาพรวม', load: () => import('./views/overview.js') },
  stock: { label: 'วัสดุคงเหลือ', load: () => import('./views/stock.js') },
  movements: { label: 'รับ-จ่าย', load: () => import('./views/movements.js') },
  reports: { label: 'รายงาน', load: () => import('./views/reports.js') },
  settings: { label: 'ตั้งค่า', admin: true, load: () => import('./views/settings.js') },
};
const ROLE = { admin: 'ผู้ดูแลระบบ', staff: 'เจ้าหน้าที่คลัง', viewer: 'ผู้ดูข้อมูล' };

export const ctx = { me: null, months: [], currentMonthId: null, navigate, reloadSync };

function navigate(path) { location.hash = '#/' + path.replace(/^#?\/?/, ''); }

function parseHash() {
  const [pathPart, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = 'overview', ...rest] = pathPart.split('/');
  return { name: ROUTES[name] ? name : 'overview', sub: rest[0] || '', params: new URLSearchParams(query) };
}

function buildNav(active) {
  const items = Object.entries(ROUTES).filter(([, r]) => !r.admin || ctx.me.role === 'admin');
  $('#nav').innerHTML = items.map(([k, r]) =>
    `<a href="#/${k}" class="nav-link" ${k === active ? 'aria-current="page"' : ''}>${svg(k)}<span>${r.label}</span></a>`).join('');
  $('#bottomNav').style.gridTemplateColumns = `repeat(${items.length}, minmax(0, 1fr))`;
  $('#bottomNav').innerHTML = items.map(([k, r]) =>
    `<a href="#/${k}" class="nav-link flex-col !gap-0.5 !px-1 !py-1.5 text-[11px]" ${k === active ? 'aria-current="page"' : ''}>${svg(k, 'size-[22px]')}<span>${r.label}</span></a>`).join('');
}

let token = 0;
async function render() {
  const { name, sub, params } = parseHash();
  const my = ++token;
  buildNav(name);
  document.title = `${ROUTES[name].label} — คลังวัสดุ รพ.คลองหาด`;
  const view = $('#view');
  view.innerHTML = '<div class="mx-auto grid max-w-6xl gap-4"><div class="skeleton h-10 w-64"></div><div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div><div class="skeleton h-32"></div></div><div class="skeleton h-72"></div></div>';
  try {
    const mod = await ROUTES[name].load();
    if (my !== token) return;                       // ผู้ใช้เปลี่ยนหน้าไปแล้ว
    view.innerHTML = '';
    await mod.render(view, ctx, { sub, params });
    view.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  } catch (e) {
    if (my !== token) return;
    view.innerHTML = `<div class="card mx-auto max-w-xl p-8 text-center"><p class="text-lg font-semibold">โหลดหน้านี้ไม่สำเร็จ</p><p class="mt-2 text-sm text-slate-500">${esc(e.message)}</p><button class="btn btn-primary mt-5" onclick="location.reload()">ลองใหม่</button></div>`;
    console.error(e);
  }
}

export async function reloadSync() {
  const pill = $('#syncPill');
  try {
    const { data } = await api.get('/api/sync/status');
    const last = (data.recent || []).find((r) => r.status === 'success' || r.status === 'error');
    if (!data.configured) { pill.innerHTML = '<span class="size-2 rounded-full bg-slate-400"></span>ยังไม่ได้เชื่อม Hosoffice'; }
    else if (!last) { pill.innerHTML = '<span class="size-2 rounded-full bg-amber-500"></span>ยังไม่เคยซิงก์จาก Hosoffice'; }
    else {
      const ok = last.status === 'success';
      pill.innerHTML = `<span class="size-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-rose-500'}"></span>ซิงก์ล่าสุด ${esc(dateTimeTh(last.finished_at || last.started_at))}${ok ? '' : ' · ล้มเหลว'}`;
    }
    /* แสดงเฉพาะจอ sm ขึ้นไป (คลาส sm:flex ใน HTML) */
  } catch { /* ไม่แสดงถ้าดึงไม่ได้ */ }
}

// ---- ค้นหาวัสดุ (⌘K / Ctrl+K) ------------------------------------------------
let itemCache = null;
async function openSearch() {
  if (!itemCache) itemCache = (await api.get('/api/stock/current')).data;
  const m = modal(`<div class="-m-6 p-4">
    <input id="qs" class="input !py-3.5 text-base" placeholder="พิมพ์รหัสหรือชื่อวัสดุ…" autocomplete="off" aria-label="ค้นหาวัสดุ">
    <ul id="qsList" class="mt-3 max-h-80 overflow-auto"></ul></div>`);
  const input = $('#qs', m.el); const list = $('#qsList', m.el);
  const draw = () => {
    const t = input.value.trim().toLowerCase();
    const rows = (t ? itemCache.filter((r) => `${r.item_code} ${r.item_name}`.toLowerCase().includes(t)) : itemCache).slice(0, 12);
    list.innerHTML = rows.length ? rows.map((r) => `<li><button data-code="${esc(r.item_code)}" class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-900/5 dark:hover:bg-white/10"><span class="min-w-0"><span class="block truncate text-sm font-medium">${esc(r.item_name)}</span><span class="text-xs text-slate-500">รหัส ${esc(r.item_code)}</span></span><span class="num shrink-0 text-sm">${esc(r.current_qty)} ${esc(r.unit)}</span></button></li>`).join('') : '<li class="px-3 py-6 text-center text-sm text-slate-500">ไม่พบวัสดุ</li>';
  };
  input.addEventListener('input', draw); draw(); input.focus();
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-code]'); if (b) { m.close(); navigate(`stock?code=${encodeURIComponent(b.dataset.code)}`); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('[data-code]', list); if (b) b.click(); } });
}

async function logout() {
  try { await api.post('/api/auth/logout'); } finally { location.replace('/login'); }
}

// ชื่อ-ตำแหน่งสำหรับเซ็นเอกสารที่พิมพ์ (ของตัวเองเท่านั้น ไม่เกี่ยวกับสิทธิ์ใช้งาน)
function openProfileModal() {
  const m = modal(`
    <div class="mb-5 flex items-center justify-between"><h2 class="text-xl font-bold">ข้อมูลสำหรับเซ็นเอกสาร</h2><button data-close class="btn btn-soft !p-2" aria-label="ปิด">✕</button></div>
    <p class="mb-4 text-sm text-slate-500">ใช้แสดงท้ายรายงานที่พิมพ์ (เช่น "นายกิตติพันธ์ ปรางศรี" และตำแหน่งงาน) ไม่กระทบชื่อหรือสิทธิ์ใช้งานระบบ</p>
    <form id="pf" class="grid gap-4" novalidate>
      <div><label class="label" for="pfName">ชื่อ-นามสกุล สำหรับเซ็น</label><input id="pfName" class="input" maxlength="150" placeholder="เช่น นายกิตติพันธ์ ปรางศรี" value="${esc(ctx.me.signature_name || ctx.me.name)}"></div>
      <div><label class="label" for="pfPos">ตำแหน่ง</label><input id="pfPos" class="input" maxlength="150" placeholder="เช่น นักวิชาการคอมพิวเตอร์" value="${esc(ctx.me.position_title || '')}"></div>
      <div class="flex justify-end gap-2 pt-1"><button data-close class="btn btn-soft" type="button">ยกเลิก</button><button class="btn btn-primary" type="submit">บันทึก</button></div>
    </form>`);
  $('#pf', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await api.patch('/api/auth/me', { signature_name: $('#pfName', m.el).value.trim(), position_title: $('#pfPos', m.el).value.trim() });
    ctx.me.signature_name = $('#pfName', m.el).value.trim();
    ctx.me.position_title = $('#pfPos', m.el).value.trim();
    m.close(); toast('บันทึกแล้ว');
  });
}

async function boot() {
  try {
    const [me, meta] = await Promise.all([api.get('/api/auth/me'), api.get('/api/meta/fiscal-months')]);
    ctx.me = me.data; ctx.months = meta.data; ctx.currentMonthId = meta.current_id;
  } catch { location.replace('/login'); return; }

  $('#meName').textContent = ctx.me.name;
  $('#meRole').textContent = ROLE[ctx.me.role] || ctx.me.role;
  $('#logoutBtn').innerHTML = svg('logout', 'size-4');
  $('#logoutBtnTop').innerHTML = svg('logout', 'size-4');
  $('#meAvatar').textContent = [...ctx.me.name.trim()][0] || '?';

  $('#logoutBtn').addEventListener('click', logout);
  $('#logoutBtnTop').addEventListener('click', logout);
  $('#meProfileBtn').addEventListener('click', openProfileModal);
  $('#cmdBtn').addEventListener('click', openSearch);
  $('#cmdBtnTop').addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });

  window.addEventListener('hashchange', render);
  window.addEventListener('unhandledrejection', (e) => { if (e.reason?.status !== 401) toast(e.reason?.message || 'เกิดข้อผิดพลาด', 'err'); });
  reloadSync();
  render();
}
boot();
export { svg, ROLE };
