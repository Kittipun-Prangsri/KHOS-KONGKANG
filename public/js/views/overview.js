import { api } from '../api.js';
import { $, esc, n0, baht, compact, dateTh, monthShort, countUp, empty } from '../ui.js';
import { trendChart, donut } from '../charts.js';

const TYPE = { receive: ['รับเข้า', 'chip-ok'], issue: ['จ่ายออก', 'chip-info'] };

export async function render(root, ctx) {
  const withData = ctx.months.filter((m) => m.has_data);
  const selId = Number(sessionStorage.getItem('kk-month')) || withData.at(-1)?.id || ctx.currentMonthId;

  root.innerHTML = `
  <div class="mx-auto grid max-w-6xl gap-6">
    <div class="flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        <p class="text-sm text-slate-500 dark:text-slate-400">สวัสดี ${esc(ctx.me.name)}</p>
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">ภาพรวมคลังวัสดุ</h1>
      </div>
      <div class="flex items-center gap-2">
        <label class="sr-only" for="monthSel">เลือกเดือน</label>
        <select id="monthSel" class="input !w-auto !py-2 font-medium">
          ${ctx.months.filter((m) => m.has_data || m.id === selId).map((m) => `<option value="${m.id}" ${m.id === selId ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="ov" class="grid gap-6"><div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">${'<div class="skeleton h-32"></div>'.repeat(4)}</div><div class="skeleton h-72"></div></div>
  </div>`;

  const load = async (id) => {
    sessionStorage.setItem('kk-month', id);
    const [{ data: d }, { data: recent }] = await Promise.all([
      api.get(`/api/dashboard?fiscal_month_id=${id}`),
      api.get(`/api/movements?fiscal_month_id=${id}&limit=6`),
    ]);
    paint(d, recent, ctx);
  };
  $('#monthSel', root).addEventListener('change', (e) => load(Number(e.target.value)));
  await load(selId);
}

function paint(d, recent, ctx) {
  const ov = $('#ov');
  if (!d.month) {
    ov.innerHTML = `<div class="card">${empty('ยังไม่มีข้อมูลในระบบ', 'เมื่อซิงก์จาก Hosoffice หรือบันทึกรายการแรก ตัวเลขจะปรากฏที่นี่')}</div>`;
    return;
  }
  const m = d.month;
  const chg = m.prev_closing_value ? ((m.closing_value - m.prev_closing_value) / m.prev_closing_value) * 100 : null;
  const out = d.totals.items - 0;
  const zero = d.low_items.filter((x) => Number(x.current_qty) <= 0).length;
  const low = d.totals.low_stock;
  const okCount = Math.max(0, out - low);
  const lowOnly = Math.max(0, low - zero);
  const health = out ? Math.round((okCount / out) * 100) : 0;

  const kpi = (label, value, sub, accent, id) => `
    <div class="card relative overflow-hidden p-5 animate-rise">
      <div class="absolute -top-8 -right-8 size-28 rounded-full ${accent} opacity-20 blur-2xl"></div>
      <p class="text-sm text-slate-500 dark:text-slate-400">${label}</p>
      <p class="num mt-2 text-3xl font-bold tracking-tight"><span id="${id}">0</span> <span class="text-base font-medium text-slate-400">บาท</span></p>
      <p class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">${sub}</p>
    </div>`;

  const trend = d.trend.map((t) => ({ label: monthShort(t.calendar_month), closing: t.closing_value, issued: t.issued_value }));
  const maxTop = Math.max(1, ...d.top_issued.map((t) => Number(t.issued_value)));

  ov.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${kpi('มูลค่าวัสดุคงเหลือรวม', 0, chg === null ? 'ยังไม่มีเดือนก่อนหน้าให้เทียบ' : `<span class="${chg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} font-medium">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}%</span> จากเดือนก่อน`, 'bg-teal-400', 'k1')}
      ${kpi('รับเข้าเดือนนี้', 0, `${n0(m.received_qty)} หน่วย`, 'bg-emerald-400', 'k2')}
      ${kpi('จ่ายออกเดือนนี้', 0, `${n0(m.issued_qty)} หน่วย`, 'bg-indigo-400', 'k3')}
      <div class="card flex items-center gap-4 p-5 animate-rise">
        <div class="shrink-0 text-slate-800 dark:text-slate-100">${donut([
          { label: 'ปกติ', value: okCount, color: '#10b981' }, { label: 'ใกล้หมด', value: lowOnly, color: '#f59e0b' }, { label: 'หมด', value: zero, color: '#f43f5e' },
        ], `${health}%`, 'สุขภาพสต๊อก', 112)}</div>
        <div class="min-w-0 text-sm leading-6">
          <p><span class="mr-1.5 inline-block size-2 rounded-full bg-emerald-500"></span>ปกติ <b class="num">${n0(okCount)}</b></p>
          <p><span class="mr-1.5 inline-block size-2 rounded-full bg-amber-500"></span>ใกล้หมด <b class="num">${n0(lowOnly)}</b></p>
          <p><span class="mr-1.5 inline-block size-2 rounded-full bg-rose-500"></span>หมด <b class="num">${n0(zero)}</b></p>
        </div>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <section class="card p-5 lg:col-span-2 animate-rise">
        <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">แนวโน้ม 12 เดือน</h2>
          <div class="flex items-center gap-4 text-xs text-slate-500"><span class="flex items-center gap-1.5"><i class="size-2.5 rounded-full bg-teal-500"></i>มูลค่าคงเหลือ</span><span class="flex items-center gap-1.5"><i class="size-2.5 rounded-sm bg-indigo-400"></i>จ่ายออก</span></div>
        </div>
        <div class="text-slate-700 dark:text-slate-200">${trend.length > 1 ? trendChart(trend) : '<p class="py-16 text-center text-sm text-slate-500">ต้องมีข้อมูลอย่างน้อย 2 เดือนจึงจะแสดงแนวโน้มได้</p>'}</div>
      </section>

      <section class="card p-5 animate-rise">
        <h2 class="mb-4 font-semibold">จ่ายออกมากที่สุดเดือนนี้</h2>
        ${d.top_issued.length ? `<ol class="grid gap-4">${d.top_issued.map((t, i) => `
          <li><div class="flex items-baseline justify-between gap-3 text-sm"><span class="truncate"><b class="mr-1.5 text-slate-400">${i + 1}</b>${esc(t.name)}</span><span class="num shrink-0 text-slate-500">${n0(t.issued_qty)} ${esc(t.unit)}</span></div>
          <div class="mt-1.5 h-1.5 rounded-full bg-slate-900/10 dark:bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-teal-400" style="width:${(Number(t.issued_value) / maxTop) * 100}%"></div></div></li>`).join('')}</ol>`
          : '<p class="py-10 text-center text-sm text-slate-500">เดือนนี้ยังไม่มีการจ่ายออก</p>'}
      </section>
    </div>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card p-5 animate-rise">
        <div class="mb-3 flex items-center justify-between"><h2 class="font-semibold">ควรสั่งซื้อ <span class="chip chip-warn ml-1">${n0(low)}</span></h2><a class="text-sm text-teal-600 hover:underline dark:text-teal-300" href="#/stock?filter=low">ดูทั้งหมด →</a></div>
        ${d.low_items.length ? `<ul class="divide-y divide-slate-200/70 dark:divide-white/10">${d.low_items.map((x) => `
          <li><a href="#/stock?code=${esc(x.item_code)}" class="flex items-center justify-between gap-3 py-2.5 hover:opacity-80"><span class="min-w-0 truncate text-sm">${esc(x.name)}</span>
          <span class="num shrink-0 text-sm"><b class="${Number(x.current_qty) <= 0 ? 'text-rose-600' : 'text-amber-600'}">${n0(x.current_qty)}</b> <span class="text-slate-400">/ ${n0(x.reorder_point)} ${esc(x.unit)}</span></span></a></li>`).join('')}</ul>`
          : '<p class="py-10 text-center text-sm text-slate-500">ไม่มีรายการใกล้หมด 🎉</p>'}
      </section>

      <section class="card p-5 animate-rise">
        <div class="mb-3 flex items-center justify-between"><h2 class="font-semibold">รายการล่าสุดของเดือน</h2><a class="text-sm text-teal-600 hover:underline dark:text-teal-300" href="#/movements">ดูทั้งหมด →</a></div>
        ${recent.length ? `<ul class="divide-y divide-slate-200/70 dark:divide-white/10">${recent.map((r) => `
          <li class="flex items-center justify-between gap-3 py-2.5"><div class="min-w-0"><p class="truncate text-sm">${esc(r.item_name)}</p><p class="text-xs text-slate-500">${esc(dateTh(r.movement_date))}${r.reference_no ? ' · ' + esc(r.reference_no) : ''}</p></div>
          <div class="shrink-0 text-right"><span class="chip ${TYPE[r.movement_type][1]}">${TYPE[r.movement_type][0]}</span><p class="num mt-0.5 text-sm font-medium">${r.movement_type === 'issue' ? '−' : '+'}${n0(r.quantity)} ${esc(r.unit)}</p></div></li>`).join('')}</ul>`
          : '<p class="py-10 text-center text-sm text-slate-500">ยังไม่มีรายการในเดือนนี้</p>'}
      </section>
    </div>`;

  countUp($('#k1'), d.totals.stock_value, baht);
  countUp($('#k2'), m.received_value, baht);
  countUp($('#k3'), m.issued_value, baht);
  void compact; void ctx;
}
