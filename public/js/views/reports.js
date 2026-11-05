import { api } from '../api.js';
import { $, esc, n0, baht, dateTimeTh, monthShort, toast, csvDownload, empty } from '../ui.js';

export async function render(root, ctx) {
  const isAdmin = ctx.me.role === 'admin';
  const withData = ctx.months.filter((m) => m.has_data);
  let monthId = Number(sessionStorage.getItem('kk-month')) || withData.at(-1)?.id || ctx.currentMonthId;
  let mode = 'month';
  const years = [...new Map(ctx.months.map((m) => [m.fiscal_year_id, m.fiscal_year])).entries()];
  let yearId = ctx.months.find((m) => m.id === monthId)?.fiscal_year_id || years.at(-1)?.[0];

  root.innerHTML = `
  <div class="mx-auto grid max-w-6xl gap-5">
    <div class="flex flex-wrap items-end justify-between gap-3 animate-rise">
      <div><h1 class="text-2xl font-bold tracking-tight sm:text-3xl">รายงานสรุป</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">บัญชีสรุปยอดยกมา · รับเข้า · จ่ายออก · คงเหลือ พร้อมพิมพ์หรือส่งออกเป็นไฟล์</p></div>
      <div class="flex flex-wrap gap-2 no-print"><button id="print" class="btn btn-soft" type="button">🖨 พิมพ์</button><button id="csv" class="btn btn-soft" type="button">⬇ CSV</button><button id="sign" class="btn btn-primary hidden" type="button">✍ ลงนามรับรองยอด</button></div>
    </div>
    <div class="card flex flex-wrap items-center gap-3 p-3 no-print animate-rise">
      <div class="flex gap-2" role="tablist"><button data-m="month" class="chip cursor-pointer !px-3.5 !py-1.5 !text-sm">รายเดือน</button><button data-m="monthly-value" class="chip cursor-pointer !px-3.5 !py-1.5 !text-sm">สรุปมูลค่ารายเดือน</button><button data-m="year" class="chip cursor-pointer !px-3.5 !py-1.5 !text-sm">รายปีงบประมาณ</button></div>
      <select id="sel" class="input !w-auto !py-2 font-medium" aria-label="ช่วงเวลา"></select>
    </div>
    <div id="out" class="card overflow-hidden animate-rise"></div>
  </div>`;

  let current = { rows: [], head: [], title: '' };
  const chips = () => root.querySelectorAll('[data-m]').forEach((b) => { const on = b.dataset.m === mode; b.className = `chip cursor-pointer !px-3.5 !py-1.5 !text-sm ${on ? 'bg-teal-600 !text-white' : 'chip-mute hover:bg-slate-500/20'}`; });
  const fillSel = () => {
    $('#sel', root).innerHTML = mode === 'month'
      ? ctx.months.filter((m) => m.has_data || m.id === monthId).map((m) => `<option value="${m.id}" ${m.id === monthId ? 'selected' : ''}>${esc(m.label)}</option>`).join('')
      : years.map(([id, name]) => `<option value="${id}" ${id === yearId ? 'selected' : ''}>ปีงบประมาณ ${esc(name)}</option>`).join('');
  };

  const load = async () => {
    chips(); fillSel();
    $('#out', root).innerHTML = '<div class="p-6"><div class="skeleton h-64"></div></div>';
    $('#sign', root).classList.add('hidden');
    if (mode === 'month') {
      const { data } = await api.get(`/api/summary/${monthId}`);
      const lbl = ctx.months.find((m) => m.id === monthId)?.label || '';
      const T = data.reduce((a, r) => ({ ov: a.ov + Number(r.opening_value), rv: a.rv + Number(r.received_value), iv: a.iv + Number(r.issued_value), cv: a.cv + Number(r.closing_value) }), { ov: 0, rv: 0, iv: 0, cv: 0 });
      current = { title: `สรุปบัญชีวัสดุ ${lbl}`, head: ['รหัส', 'รายการ', 'หน่วย', 'ยกมา', 'รับเข้า', 'จ่ายออก', 'คงเหลือ', 'มูลค่าคงเหลือ'], rows: data.map((r) => [r.item_code, r.item_name, r.unit, r.opening_qty, r.received_qty, r.issued_qty, r.closing_qty, r.closing_value]) };
      const unsigned = data.filter((r) => !r.is_signed).length;
      if (isAdmin && data.length && unsigned) { const b = $('#sign', root); b.classList.remove('hidden'); b.textContent = `✍ ลงนามรับรองยอด (${unsigned})`; }
      const signedRow = data.find((r) => r.is_signed);
      $('#out', root).innerHTML = data.length ? table(`สรุปบัญชีวัสดุ ${esc(lbl)}`, data.map((r) => `
        <tr><td class="td num text-slate-500">${esc(r.item_code)}</td><td class="td font-medium">${esc(r.item_name)}</td>
        <td class="td num text-right">${n0(r.opening_qty)}</td><td class="td num text-right text-emerald-700 dark:text-emerald-400">${r.received_qty ? '+' + n0(r.received_qty) : '–'}</td>
        <td class="td num text-right">${r.issued_qty ? '−' + n0(r.issued_qty) : '–'}</td><td class="td num text-right font-semibold">${n0(r.closing_qty)} <span class="text-xs font-normal text-slate-400">${esc(r.unit)}</span></td>
        <td class="td num text-right">${baht(r.closing_value)}</td><td class="td no-print">${r.is_signed ? '<span class="chip chip-ok">ลงนามแล้ว</span>' : ''}</td></tr>`).join(''),
        `<tr class="border-t-2 border-slate-300 font-semibold dark:border-white/20"><td class="td" colspan="6">รวมมูลค่าวัสดุคงเหลือ (บาท)</td><td class="td num text-right">${baht(T.cv)}</td><td class="td no-print"></td></tr>`,
        ['รหัส', 'รายการ', 'ยกมา', 'รับเข้า', 'จ่ายออก', 'คงเหลือ', 'มูลค่าคงเหลือ (บาท)', ''], signedRow ? `ลงนามเมื่อ ${dateTimeTh(signedRow.signed_at)}` : '',
        [['ยกมาต้นเดือน', T.ov], ['รับเข้า', T.rv], ['จ่ายออก', T.iv], ['คงเหลือปลายเดือน', T.cv]], 7)
        : empty('เดือนนี้ยังไม่มีข้อมูล', 'เลือกเดือนอื่นหรือซิงก์ข้อมูลจาก Hosoffice');
    } else if (mode === 'monthly-value') {
      const { data } = await api.get(`/api/summary/monthly-value/${yearId}`);
      const name = years.find(([id]) => id === yearId)?.[1] || '';
      current = { title: `รายงานมูลค่าวัสดุคอมพิวเตอร์คงคลังปี ${name}`, head: ['เดือน', 'ยอดยกมา', 'มูลค่ารับเข้า', 'มูลค่าใช้ไป', 'คงเหลือ'], rows: data.map((r) => [r.month_name, r.opening_value, r.received_value, r.issued_value, r.closing_value]) };
      const hasAny = data.some((r) => Number(r.opening_value) || Number(r.received_value) || Number(r.issued_value) || Number(r.closing_value));
      const totalIssued = data.reduce((a, r) => a + Number(r.issued_value), 0);
      const lastClosing = Number([...data].reverse().find((r) => Number(r.closing_value))?.closing_value || 0);
      const body = data.map((r, idx) => {
        const opening = Number(r.opening_value), received = Number(r.received_value), issued = Number(r.issued_value), closing = Number(r.closing_value);
        const prevClosing = idx > 0 ? Number(data[idx - 1].closing_value) : null;
        const chg = prevClosing ? ((closing - prevClosing) / prevClosing) * 100 : null;
        const ok = Math.round((opening + received - issued) * 100) === Math.round(closing * 100);
        return `<tr><td class="td font-medium">${esc(r.month_name)}</td>
          <td class="td num text-right">${baht(opening)}</td>
          <td class="td num text-right text-emerald-700 dark:text-emerald-400">${received ? '+' + baht(received) : '–'}</td>
          <td class="td num text-right">${issued ? '−' + baht(issued) : '–'}</td>
          <td class="td num text-right font-semibold">${baht(closing)}</td>
          <td class="td no-print">${chg === null ? '' : `<span class="${chg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}%</span>`}</td>
          <td class="td text-center no-print">${opening || received || issued || closing ? (ok ? '<span class="chip chip-ok">✓</span>' : '<span class="chip chip-bad">✗</span>') : ''}</td></tr>`;
      }).join('');
      const foot = `<tr class="border-t-2 border-slate-300 font-semibold dark:border-white/20"><td class="td" colspan="2">รวม</td><td class="td"></td><td class="td num text-right">${baht(totalIssued)}</td><td class="td num text-right">${baht(lastClosing)}</td><td class="td no-print" colspan="2"></td></tr>`;
      const printTitle = `<div class="print-only px-5 pt-8 pb-1 text-center text-lg font-bold">รายงานมูลค่าวัสดุคอมพิวเตอร์คงคลังปี ${esc(name)}</div>`;
      const printSign = `<div class="print-only px-5 pt-20 pb-10 text-center text-sm">
          <p>ผู้รายงาน..........................................................</p>
          <p class="mt-3">(${esc(ctx.me.signature_name || ctx.me.name)})</p>
          <p>ตำแหน่ง ${esc(ctx.me.position_title || '-')}</p>
        </div>`;
      $('#out', root).innerHTML = hasAny
        ? printTitle + table(`สรุปมูลค่าคงคลังรายเดือน ปีงบประมาณ ${esc(name)}`, body, foot,
            ['เดือน', 'ยอดยกมา', 'มูลค่ารับเข้า', 'มูลค่าใช้ไป', 'คงเหลือ', 'เปลี่ยนแปลง', 'ตรวจสอบ'],
            'ยกมา + รับเข้า − ใช้ไป ต้องเท่ากับคงเหลือเสมอ (คำนวณโดยฐานข้อมูลอัตโนมัติ) คอลัมน์ "ตรวจสอบ" ยืนยันผลนี้ทุกเดือน',
            [], 5, true) + printSign
        : empty('ปีงบประมาณนี้ยังไม่มีข้อมูล');
    } else {
      const { data } = await api.get(`/api/summary/annual/${yearId}`);
      const name = years.find(([id]) => id === yearId)?.[1] || '';
      current = { title: `สรุปรายปีงบประมาณ ${name}`, head: ['รหัส', 'รายการ', 'หน่วย', 'รับทั้งปี', 'จ่ายทั้งปี', 'คงเหลือสิ้นปี', 'มูลค่าคงเหลือสิ้นปี'], rows: data.map((r) => [r.item_code, r.item_name, r.unit, r.annual_received_qty, r.annual_issued_qty, r.year_end_closing_qty, r.year_end_closing_value]) };
      const T = data.reduce((a, r) => ({ r: a.r + Number(r.annual_received_value), i: a.i + Number(r.annual_issued_value), c: a.c + Number(r.year_end_closing_value) }), { r: 0, i: 0, c: 0 });
      $('#out', root).innerHTML = data.length ? table(`สรุปรายปีงบประมาณ ${esc(name)}`, data.map((r) => `
        <tr><td class="td num text-slate-500">${esc(r.item_code)}</td><td class="td font-medium">${esc(r.item_name)}</td>
        <td class="td num text-right">${n0(r.annual_received_qty)}</td><td class="td num text-right">${n0(r.annual_issued_qty)}</td>
        <td class="td num text-right font-semibold">${n0(r.year_end_closing_qty)} <span class="text-xs font-normal text-slate-400">${esc(r.unit)}</span></td><td class="td num text-right">${baht(r.year_end_closing_value)}</td></tr>`).join(''),
        `<tr class="border-t-2 border-slate-300 font-semibold dark:border-white/20"><td class="td" colspan="5">รวมมูลค่าวัสดุคงเหลือสิ้นปี (บาท)</td><td class="td num text-right">${baht(T.c)}</td></tr>`,
        ['รหัส', 'รายการ', 'รับทั้งปี', 'จ่ายทั้งปี', 'คงเหลือสิ้นปี', 'มูลค่าคงเหลือสิ้นปี (บาท)'], '',
        [['รับเข้าทั้งปี', T.r], ['จ่ายออกทั้งปี', T.i], ['คงเหลือสิ้นปี', T.c]])
        : empty('ปีงบประมาณนี้ยังไม่มีข้อมูล');
    }
  };
  const table = (title, body, foot, head, note, stats = [], noPrintFrom = null, hideTitleOnPrint = false) => `
    <div class="${hideTitleOnPrint ? 'no-print ' : ''}border-b border-slate-200/70 px-5 py-4 dark:border-white/10"><h2 class="font-semibold">${title}</h2>${note ? `<p class="mt-0.5 text-xs text-slate-500">${esc(note)}</p>` : ''}
      <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">${stats.map(([l, v]) => `<div class="rounded-xl bg-slate-900/5 px-3.5 py-2.5 dark:bg-white/5"><p class="text-xs text-slate-500">${l}</p><p class="num text-lg font-semibold">${baht(v)} <span class="text-xs font-normal text-slate-400">บาท</span></p></div>`).join('')}</div></div>
    <div class="overflow-x-auto"><table class="w-full min-w-[820px]"><thead class="border-b border-slate-200/70 dark:border-white/10"><tr>${head.map((h, i) => `<th class="th ${i >= 2 && h ? 'text-right' : ''} ${noPrintFrom !== null && i >= noPrintFrom ? 'no-print' : ''}">${h}</th>`).join('')}</tr></thead>
    <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">${body}</tbody><tfoot>${foot}</tfoot></table></div>`;

  root.querySelector('[role=tablist]').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) { mode = b.dataset.m; load(); } });
  $('#sel', root).addEventListener('change', (e) => { const v = Number(e.target.value); if (mode === 'month') { monthId = v; sessionStorage.setItem('kk-month', v); } else yearId = v; load(); });
  $('#print', root).addEventListener('click', () => window.print());
  $('#csv', root).addEventListener('click', () => csvDownload(`${current.title}.csv`, [current.head, ...current.rows]));
  $('#sign', root).addEventListener('click', async () => {
    if (!confirm('ยืนยันลงนามรับรองยอดของทุกรายการในเดือนนี้?')) return;
    const r = await api.patch(`/api/summary/month/${monthId}/sign`); toast(r.message); load();
  });
  await load();
}
