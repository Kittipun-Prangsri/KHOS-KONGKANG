import { api } from '../api.js';
import { $, esc, n0, baht, dateTh, todayIso, modal, toast, empty } from '../ui.js';

const TYPE = { receive: ['รับเข้า', 'chip-ok'], issue: ['จ่ายออก', 'chip-info'] };
const SRC = { hosoffice: ['Hosoffice', 'chip-info'], opening: ['ยอดยกมา', 'chip-mute'] };

export async function render(root, ctx) {
  const canWrite = ctx.me.role !== 'viewer';
  const isAdmin = ctx.me.role === 'admin';
  const withData = ctx.months.filter((m) => m.has_data);
  let monthId = Number(sessionStorage.getItem('kk-month')) || withData.at(-1)?.id || ctx.currentMonthId;
  let type = '';
  let term = '';

  root.innerHTML = `
  <div class="mx-auto grid max-w-6xl gap-5">
    <div class="flex flex-wrap items-end justify-between gap-3 animate-rise">
      <div><h1 class="text-2xl font-bold tracking-tight sm:text-3xl">รับ-จ่าย</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">รายการรับเข้าและจ่ายออก ดึงจาก Hosoffice อัตโนมัติ · บันทึกเพิ่มเองได้เมื่อจำเป็น</p></div>
      ${canWrite ? `<div class="flex gap-2 no-print"><button id="addIn" class="btn btn-primary" type="button">＋ บันทึกรับเข้า</button><button id="addOut" class="btn btn-soft" type="button">－ บันทึกจ่ายออก</button></div>` : ''}
    </div>

    <div class="card flex flex-wrap items-center gap-3 p-3 animate-rise">
      <select id="mSel" class="input !w-auto !py-2 font-medium" aria-label="เดือน">${ctx.months.filter((m) => m.has_data || m.id === monthId).map((m) => `<option value="${m.id}" ${m.id === monthId ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
      <div class="flex gap-2" role="tablist">${[['', 'ทั้งหมด'], ['receive', 'รับเข้า'], ['issue', 'จ่ายออก']].map(([k, l]) => `<button data-t="${k}" role="tab" class="chip cursor-pointer !px-3.5 !py-1.5 !text-sm"></button>`).join('')}</div>
      <input id="q" class="input !w-full sm:!w-64 sm:ml-auto" placeholder="ค้นหาวัสดุ/เลขที่เอกสาร" aria-label="ค้นหา">
    </div>

    <div class="card overflow-hidden animate-rise"><div class="overflow-x-auto"><table class="w-full min-w-[760px]">
      <thead class="border-b border-slate-200/70 dark:border-white/10"><tr><th class="th">วันที่</th><th class="th">ประเภท</th><th class="th">รายการ</th><th class="th text-right">จำนวน</th><th class="th text-right">มูลค่า (บาท)</th><th class="th">เลขที่เอกสาร</th><th class="th">ที่มา</th>${isAdmin ? '<th class="th"></th>' : ''}</tr></thead>
      <tbody id="rows" class="divide-y divide-slate-200/60 dark:divide-white/5"></tbody></table></div>
      <p id="foot" class="border-t border-slate-200/70 px-4 py-3 text-xs text-slate-500 dark:border-white/10"></p></div>
  </div>`;

  let data = [];
  const draw = () => {
    $$chips();
    const t = term.toLowerCase();
    const rows = data.filter((r) => !t || `${r.item_name} ${r.item_code} ${r.reference_no || ''}`.toLowerCase().includes(t));
    const rec = rows.filter((r) => r.movement_type === 'receive').reduce((a, r) => a + Number(r.total_value), 0);
    const iss = rows.filter((r) => r.movement_type === 'issue').reduce((a, r) => a + Number(r.total_value), 0);
    $('#foot', root).textContent = `${n0(rows.length)} รายการ · รับเข้า ${baht(rec)} บาท · จ่ายออก ${baht(iss)} บาท`;
    $('#rows', root).innerHTML = rows.length ? rows.map((r) => {
      const [tl, tc] = TYPE[r.movement_type]; const s = SRC[r.source_system] || ['บันทึกเอง', 'chip-warn'];
      return `<tr class="hover:bg-slate-500/5"><td class="td num whitespace-nowrap text-slate-500">${esc(dateTh(r.movement_date))}</td>
        <td class="td"><span class="chip ${tc}">${tl}</span></td>
        <td class="td font-medium">${esc(r.item_name)}<span class="block text-xs font-normal text-slate-400">รหัส ${esc(r.item_code)}</span></td>
        <td class="td num text-right font-semibold">${r.movement_type === 'issue' ? '−' : '+'}${n0(r.quantity)} <span class="text-xs font-normal text-slate-400">${esc(r.unit)}</span></td>
        <td class="td num text-right">${baht(r.total_value)}</td>
        <td class="td text-slate-500">${esc(r.reference_no || '—')}</td>
        <td class="td"><span class="chip ${s[1]}">${s[0]}</span></td>
        ${isAdmin ? `<td class="td text-right">${r.source_system ? '' : `<button data-del="${r.id}" class="btn btn-danger !px-2.5 !py-1 text-xs" type="button">ลบ</button>`}</td>` : ''}</tr>`;
    }).join('') : `<tr><td colspan="${isAdmin ? 8 : 7}">${empty('ไม่มีรายการ', 'ลองเลือกเดือนหรือตัวกรองอื่น')}</td></tr>`;
  };
  function $$chips() {
    root.querySelectorAll('[data-t]').forEach((b) => {
      const on = b.dataset.t === type; const lbl = { '': 'ทั้งหมด', receive: 'รับเข้า', issue: 'จ่ายออก' }[b.dataset.t];
      b.className = `chip cursor-pointer !px-3.5 !py-1.5 !text-sm ${on ? 'bg-teal-600 !text-white' : 'chip-mute hover:bg-slate-500/20'}`; b.textContent = lbl; b.setAttribute('aria-selected', on);
    });
  }
  const load = async () => {
    $('#rows', root).innerHTML = '<tr><td colspan="8" class="p-6"><div class="skeleton h-40"></div></td></tr>';
    data = (await api.get(`/api/movements?fiscal_month_id=${monthId}${type ? `&type=${type}` : ''}&limit=1000`)).data;
    draw();
  };

  $('#mSel', root).addEventListener('change', (e) => { monthId = Number(e.target.value); sessionStorage.setItem('kk-month', monthId); load(); });
  root.querySelector('[role=tablist]').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; load(); } });
  $('#q', root).addEventListener('input', (e) => { term = e.target.value.trim(); draw(); });
  $('#rows', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!confirm('ลบรายการนี้? ยอดคงเหลือจะถูกคำนวณใหม่อัตโนมัติ')) return;
    await api.del(`/api/movements/${b.dataset.del}`); toast('ลบรายการแล้ว'); load();
  });
  if (canWrite) {
    $('#addIn', root).addEventListener('click', () => openForm('receive', ctx, load));
    $('#addOut', root).addEventListener('click', () => openForm('issue', ctx, load));
  }
  await load();
}

async function openForm(kind, ctx, done) {
  const { data: items } = await api.get('/api/stock/current');
  const label = kind === 'receive' ? 'บันทึกรับเข้า' : 'บันทึกจ่ายออก';
  const m = modal(`
    <div class="mb-5 flex items-center justify-between"><h2 class="text-xl font-bold">${label}</h2><button data-close class="btn btn-soft !p-2" aria-label="ปิด">✕</button></div>
    <form id="f" class="grid gap-4" novalidate>
      <div><label class="label" for="item">วัสดุ</label>
        <input id="item" list="itemList" class="input" placeholder="พิมพ์รหัสหรือชื่อ แล้วเลือกจากรายการ" autocomplete="off" required>
        <datalist id="itemList">${items.map((r) => `<option value="${esc(r.item_code)} · ${esc(r.item_name)}"></option>`).join('')}</datalist>
        <p id="bal" class="mt-1.5 hidden text-xs text-slate-500"></p></div>
      <div class="grid gap-4 sm:grid-cols-3">
        <div><label class="label" for="qty">จำนวน</label><input id="qty" type="number" min="1" step="1" inputmode="numeric" class="input num" required></div>
        <div><label class="label" for="price">ราคาต่อหน่วย (บาท)</label><input id="price" type="number" min="0" step="0.01" inputmode="decimal" class="input num" required></div>
        <div><label class="label" for="date">วันที่</label><input id="date" type="date" class="input" value="${todayIso()}" required></div>
      </div>
      <div><label class="label" for="ref">เลขที่เอกสาร (ถ้ามี)</label><input id="ref" class="input" maxlength="100" placeholder="เช่น RE-25690408001 หรือ บช.69-045"></div>
      <div><label class="label" for="note">หมายเหตุ</label><input id="note" class="input" maxlength="500" placeholder="${kind === 'issue' ? 'เช่น เบิกให้แผนกผู้ป่วยนอก' : 'เช่น ซื้อเพิ่มรอบ ม.ค.'}"></div>
      <p id="err" role="alert" class="hidden rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"></p>
      <div class="flex justify-end gap-2 pt-1"><button data-close class="btn btn-soft" type="button">ยกเลิก</button><button id="ok" class="btn btn-primary" type="submit">บันทึก</button></div>
    </form>`);
  const f = $('#f', m.el); const err = $('#err', m.el);
  const pick = () => items.find((r) => `${r.item_code} · ${r.item_name}` === $('#item', m.el).value);
  $('#item', m.el).addEventListener('input', () => {
    const it = pick(); const bal = $('#bal', m.el);
    if (it) { bal.classList.remove('hidden'); bal.textContent = `คงเหลือ ${n0(it.current_qty)} ${it.unit}`; if (!$('#price', m.el).value) $('#price', m.el).value = it.unit_price; } else bal.classList.add('hidden');
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.classList.add('hidden');
    const it = pick(); const date = $('#date', m.el).value;
    const fm = ctx.months.find((x) => x.start_date <= date && date <= x.end_date);
    const fail = (t) => { err.textContent = t; err.classList.remove('hidden'); };
    if (!it) return fail('กรุณาเลือกวัสดุจากรายการ');
    if (!fm) return fail('ไม่พบเดือนงบประมาณของวันที่ที่เลือก');
    const btn = $('#ok', m.el); btn.disabled = true;
    try {
      await api.post('/api/movements', { item_id: it.item_id, fiscal_month_id: fm.id, movement_type: kind, quantity: Number($('#qty', m.el).value), unit_price: Number($('#price', m.el).value), movement_date: date, reference_no: $('#ref', m.el).value.trim() || undefined, note: $('#note', m.el).value.trim() || undefined });
      m.close(); toast(`${label}เรียบร้อยแล้ว`); done();
    } catch (x) { fail(x.message); btn.disabled = false; }
  });
  $('#item', m.el).focus();
}
