import { api } from '../api.js';
import { $, $$, esc, n0, baht, dateTh, drawer, toast, empty, csvDownload } from '../ui.js';
import { stockBar } from '../charts.js';

const status = (r) => {
  const q = Number(r.current_qty), p = Number(r.reorder_point);
  return q < 0 ? ['out', 'ติดลบ — ตรวจสอบ', 'chip-bad'] : q === 0 ? ['out', 'หมด', 'chip-bad'] : q <= p ? ['low', 'ใกล้หมด', 'chip-warn'] : ['ok', 'ปกติ', 'chip-ok'];
};

export async function render(root, ctx, { params }) {
  const { data: all } = await api.get('/api/stock/current');
  const canEdit = ctx.me.role !== 'viewer';
  let filter = params.get('filter') || 'all';
  let term = '';

  root.innerHTML = `
  <div class="mx-auto grid max-w-6xl gap-5">
    <div class="flex flex-wrap items-end justify-between gap-3 animate-rise">
      <div><h1 class="text-2xl font-bold tracking-tight sm:text-3xl">วัสดุคงเหลือ</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">ยอดคงเหลือปัจจุบันของวัสดุทุกรายการ · คลิกแถวเพื่อดูประวัติรับ-จ่าย</p></div>
      <button id="exp" class="btn btn-soft no-print" type="button">⬇ ดาวน์โหลด CSV</button>
    </div>

    <div class="card flex flex-wrap items-center gap-3 p-3 animate-rise">
      <input id="q" class="input !w-full sm:!w-72" placeholder="ค้นหารหัสหรือชื่อวัสดุ" aria-label="ค้นหา">
      <div id="chips" class="flex flex-wrap gap-2" role="tablist"></div>
      <span id="count" class="ml-auto text-sm text-slate-500"></span>
    </div>

    <div class="card overflow-hidden animate-rise">
      <div class="overflow-x-auto"><table class="w-full sm:min-w-[720px]">
        <thead class="border-b border-slate-200/70 dark:border-white/10"><tr>
          <th class="th hidden sm:table-cell">รหัส</th><th class="th">รายการ</th><th class="th text-right">คงเหลือ</th><th class="th hidden md:table-cell">เทียบจุดสั่งซื้อ</th><th class="th hidden sm:table-cell text-right">มูลค่า (บาท)</th><th class="th">สถานะ</th></tr></thead>
        <tbody id="rows" class="divide-y divide-slate-200/60 dark:divide-white/5"></tbody>
      </table></div>
    </div>
  </div>`;

  const counts = () => ({ all: all.length, low: all.filter((r) => status(r)[0] === 'low').length, out: all.filter((r) => status(r)[0] === 'out').length });
  const draw = () => {
    const c = counts();
    $('#chips', root).innerHTML = [['all', 'ทั้งหมด'], ['low', 'ใกล้หมด'], ['out', 'หมด']].map(([k, l]) =>
      `<button role="tab" aria-selected="${filter === k}" data-f="${k}" class="chip ${filter === k ? 'bg-teal-600 !text-white' : 'chip-mute hover:bg-slate-500/20'} cursor-pointer !px-3.5 !py-1.5 !text-sm">${l} <b class="num">${c[k]}</b></button>`).join('');
    const t = term.toLowerCase();
    const rows = all.filter((r) => (filter === 'all' || status(r)[0] === filter) && (!t || `${r.item_code} ${r.item_name}`.toLowerCase().includes(t)));
    $('#count', root).textContent = `แสดง ${n0(rows.length)} จาก ${n0(all.length)} รายการ`;
    $('#rows', root).innerHTML = rows.length ? rows.map((r) => {
      const [, label, cls] = status(r);
      return `<tr data-id="${r.item_id}" tabindex="0" class="cursor-pointer transition hover:bg-teal-500/5 focus-visible:bg-teal-500/5">
        <td class="td num hidden text-slate-500 sm:table-cell">${esc(r.item_code)}</td>
        <td class="td font-medium">${esc(r.item_name)}<span class="block text-xs font-normal text-slate-400">${esc(r.category_name || '')}</span></td>
        <td class="td num text-right text-base font-semibold">${n0(r.current_qty)} <span class="text-xs font-normal text-slate-400">${esc(r.unit)}</span></td>
        <td class="td hidden md:table-cell">${stockBar(Number(r.current_qty), Number(r.reorder_point))}</td>
        <td class="td num hidden sm:table-cell text-right">${baht(r.current_value)}</td>
        <td class="td"><span class="chip ${cls}">${label}</span></td></tr>`;
    }).join('') : `<tr><td colspan="6">${empty('ไม่พบรายการที่ตรงกับการค้นหา', 'ลองเปลี่ยนคำค้นหรือตัวกรอง')}</td></tr>`;
  };
  draw();

  $('#q', root).addEventListener('input', (e) => { term = e.target.value.trim(); draw(); });
  $('#chips', root).addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; draw(); } });
  const open = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) openItem(Number(tr.dataset.id), all, canEdit); };
  $('#rows', root).addEventListener('click', open);
  $('#rows', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e); });
  $('#exp', root).addEventListener('click', () => csvDownload('วัสดุคงเหลือ.csv',
    [['รหัส', 'รายการ', 'หน่วย', 'คงเหลือ', 'จุดสั่งซื้อ', 'มูลค่า(บาท)', 'สถานะ']].concat(all.map((r) => [r.item_code, r.item_name, r.unit, r.current_qty, r.reorder_point, r.current_value, status(r)[1]]))));

  const code = params.get('code');
  if (code) { const hit = all.find((r) => r.item_code === code); if (hit) openItem(hit.item_id, all, canEdit); }
}

async function openItem(id, all, canEdit) {
  const item = all.find((r) => r.item_id === id);
  const d = drawer(`<div id="dr"><div class="skeleton h-8 w-2/3"></div><div class="skeleton mt-6 h-64"></div></div>`);
  try {
    const { data } = await api.get(`/api/stock/${id}/ledger`);
    const [, label, cls] = status(item);
    const SRC = { hosoffice: ['Hosoffice', 'chip-info'], opening: ['ยอดยกมา', 'chip-mute'] };
    $('#dr', d.el).innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div><p class="text-xs text-slate-500">รหัส ${esc(item.item_code)} · ${esc(item.category_name || '')}</p><h2 class="mt-1 text-xl font-bold">${esc(item.item_name)}</h2></div>
        <button data-close class="btn btn-soft !p-2" aria-label="ปิด">✕</button></div>

      <div class="mt-5 grid grid-cols-3 gap-3">
        <div class="card p-3"><p class="text-xs text-slate-500">คงเหลือ</p><p class="num text-xl font-bold">${n0(item.current_qty)}</p><p class="text-xs text-slate-400">${esc(item.unit)}</p></div>
        <div class="card p-3"><p class="text-xs text-slate-500">มูลค่า</p><p class="num text-xl font-bold">${n0(item.current_value)}</p><p class="text-xs text-slate-400">บาท</p></div>
        <div class="card p-3"><p class="text-xs text-slate-500">สถานะ</p><p class="mt-1"><span class="chip ${cls}">${label}</span></p></div>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-900/5 p-3 text-sm dark:bg-white/5">
        <span class="text-slate-500">เตือนเมื่อคงเหลือ ≤</span>
        <input id="rp" type="number" min="0" class="input !w-24 !py-1.5" value="${esc(item.reorder_point)}" ${canEdit ? '' : 'disabled'} aria-label="จุดสั่งซื้อ">
        ${canEdit ? '<button id="rpSave" class="btn btn-soft !py-1.5 text-sm" type="button">บันทึก</button>' : ''}
      </div>

      <h3 class="mt-6 mb-3 font-semibold">บัญชีคุม (ประวัติรับ-จ่าย)</h3>
      ${data.rows.length ? `<ol class="relative grid gap-0 border-l border-slate-200 pl-5 dark:border-white/10">${[...data.rows].reverse().map((r) => {
        const rec = r.movement_type === 'receive'; const src = SRC[r.source_system];
        return `<li class="relative pb-5"><i class="absolute top-1 -left-[26px] size-3 rounded-full ring-4 ring-white dark:ring-slate-900 ${rec ? 'bg-emerald-500' : 'bg-indigo-400'}"></i>
          <div class="flex items-baseline justify-between gap-3"><span class="num text-sm text-slate-500">${esc(dateTh(r.movement_date))}</span><span class="num font-semibold ${rec ? 'text-emerald-600 dark:text-emerald-400' : ''}">${rec ? '+' : '−'}${n0(r.quantity)}</span></div>
          <div class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><span>${rec ? 'รับเข้า' : 'จ่ายออก'}</span>${r.reference_no ? `<span>· ${esc(r.reference_no)}</span>` : ''}${src ? `<span class="chip ${src[1]} !py-0">${src[0]}</span>` : ''}<span class="ml-auto num">คงเหลือ ${n0(r.balance_qty)}</span></div>
          ${r.note ? `<p class="mt-1 text-xs text-slate-400">${esc(r.note)}</p>` : ''}</li>`; }).join('')}</ol>` : '<p class="py-8 text-center text-sm text-slate-500">ยังไม่มีรายการ</p>'}`;
    const save = $('#rpSave', d.el);
    if (save) save.addEventListener('click', async () => {
      const v = Number($('#rp', d.el).value);
      await api.patch(`/api/items/${id}`, { reorder_point: v });
      item.reorder_point = v; toast('บันทึกจุดสั่งซื้อแล้ว');
    });
  } catch (e) { $('#dr', d.el).innerHTML = `<p class="py-10 text-center text-rose-600">${esc(e.message)}</p>`; }
}
