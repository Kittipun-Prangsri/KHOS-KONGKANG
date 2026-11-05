import { api } from '../api.js';
import { $, esc, n0, dateTimeTh, toast, empty } from '../ui.js';

const ROLE = { admin: 'ผู้ดูแลระบบ', staff: 'เจ้าหน้าที่คลัง', viewer: 'ผู้ดูข้อมูล' };
const ACTION = {
  login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', 'movement.create': 'บันทึกรับ/จ่าย', 'movement.delete': 'ลบรายการรับ/จ่าย',
  'sync.run': 'ซิงก์จาก Hosoffice', 'sync.dry': 'ทดลองซิงก์', 'summary.sign': 'ลงนามรับรองยอด', 'summary.sign_month': 'ลงนามรับรองยอดทั้งเดือน',
  'user.add': 'เพิ่มผู้ใช้', 'user.update': 'แก้ไขผู้ใช้', 'item.reorder_point': 'แก้จุดสั่งซื้อ', 'import.items': 'นำเข้าวัสดุ', 'import.movements': 'นำเข้ารับ-จ่าย',
};
const TABS = [['users', 'ผู้ใช้งาน'], ['sync', 'ซิงก์ Hosoffice'], ['audit', 'ประวัติการใช้งาน']];

export async function render(root, ctx, { sub }) {
  const tab = TABS.some(([k]) => k === sub) ? sub : 'users';
  root.innerHTML = `
  <div class="mx-auto grid max-w-6xl gap-5">
    <div class="animate-rise"><h1 class="text-2xl font-bold tracking-tight sm:text-3xl">ตั้งค่า</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">จัดการผู้ใช้ ตรวจสอบการซิงก์ข้อมูล และดูประวัติการใช้งาน (เฉพาะผู้ดูแลระบบ)</p></div>
    <div class="flex gap-2 animate-rise" role="tablist">${TABS.map(([k, l]) => `<a role="tab" aria-selected="${k === tab}" href="#/settings/${k}" class="chip !px-4 !py-2 !text-sm ${k === tab ? 'bg-teal-600 !text-white' : 'chip-mute hover:bg-slate-500/20'}">${l}</a>`).join('')}</div>
    <div id="pane" class="animate-rise"><div class="skeleton h-64"></div></div>
  </div>`;
  const pane = $('#pane', root);
  if (tab === 'users') await users(pane, ctx);
  else if (tab === 'sync') await sync(pane, ctx);
  else await audit(pane);
}

async function users(pane, ctx) {
  const load = async () => {
    const { data } = await api.get('/api/admin/users');
    pane.innerHTML = `
      <div class="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <section class="card overflow-hidden"><div class="overflow-x-auto"><table class="w-full min-w-[560px]">
          <thead class="border-b border-slate-200/70 dark:border-white/10"><tr><th class="th">ชื่อ</th><th class="th">รหัสบุคลากร</th><th class="th">สิทธิ์</th><th class="th">เข้าใช้ล่าสุด</th><th class="th">สถานะ</th><th class="th"></th></tr></thead>
          <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">${data.map((u) => {
            const me = u.id === ctx.me.id;
            return `<tr class="${u.is_active ? '' : 'opacity-50'}"><td class="td font-medium">${esc(u.display_name)}${me ? ' <span class="chip chip-info">คุณ</span>' : ''}</td><td class="td num text-slate-500">${esc(u.hr_person_id)}</td>
              <td class="td"><select data-role="${u.id}" class="input !w-auto !py-1.5 text-sm" ${me ? 'disabled' : ''} aria-label="สิทธิ์ของ ${esc(u.display_name)}">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
              <td class="td text-sm text-slate-500">${esc(dateTimeTh(u.last_login_at))}</td>
              <td class="td"><span class="chip ${u.is_active ? 'chip-ok' : 'chip-mute'}">${u.is_active ? 'ใช้งานอยู่' : 'ปิดแล้ว'}</span></td>
              <td class="td text-right">${me ? '' : `<button data-toggle="${u.id}" data-on="${u.is_active ? 1 : 0}" class="btn ${u.is_active ? 'btn-danger' : 'btn-soft'} !px-3 !py-1.5 text-xs" type="button">${u.is_active ? 'ปิด' : 'เปิดใช้งาน'}</button>`}</td></tr>`; }).join('')}</tbody></table></div></section>

        <section class="card h-fit p-5"><h2 class="font-semibold">เพิ่มผู้ใช้</h2>
          <p class="mt-1 text-xs text-slate-500">ใส่ชื่อผู้ใช้ที่ใช้ล็อกอิน Hosoffice ของบุคคลนั้น ระบบจะค้นหาชื่อจริงให้ และ <b>เก็บเฉพาะรหัสบุคลากรกับชื่อ</b> ไม่เก็บชื่อผู้ใช้ที่พิมพ์</p>
          <form id="add" class="mt-4 grid gap-3" novalidate>
            <div><label class="label" for="u">ชื่อผู้ใช้ที่ใช้ล็อกอิน Hosoffice</label><input id="u" class="input" autocomplete="off" spellcheck="false" inputmode="numeric" required></div>
            <div><label class="label" for="r">สิทธิ์</label><select id="r" class="input"><option value="viewer">ผู้ดูข้อมูล — ดูอย่างเดียว</option><option value="staff">เจ้าหน้าที่คลัง — บันทึกรับ/จ่ายได้</option><option value="admin">ผู้ดูแลระบบ — ทุกอย่าง</option></select></div>
            <p id="addErr" role="alert" class="hidden text-sm text-rose-600"></p>
            <button class="btn btn-primary" type="submit">เพิ่มผู้ใช้</button></form>
        </section></div>`;
    pane.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => { await api.patch(`/api/admin/users/${s.dataset.role}`, { role: s.value }); toast('เปลี่ยนสิทธิ์แล้ว'); load(); }));
    pane.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => { await api.patch(`/api/admin/users/${b.dataset.toggle}`, { is_active: b.dataset.on !== '1' }); toast('บันทึกแล้ว'); load(); }));
    $('#add', pane).addEventListener('submit', async (e) => {
      e.preventDefault(); const err = $('#addErr', pane); err.classList.add('hidden');
      try { const r = await api.post('/api/admin/users', { hr_username: $('#u', pane).value.trim(), role: $('#r', pane).value }); toast(r.message); load(); }
      catch (x) { err.textContent = x.message; err.classList.remove('hidden'); }
    });
  };
  await load();
}

async function sync(pane) {
  const load = async () => {
    const { data } = await api.get('/api/sync/status');
    const ST = { success: ['สำเร็จ', 'chip-ok'], error: ['ล้มเหลว', 'chip-bad'], running: ['กำลังทำงาน', 'chip-warn'], 'dry-run': ['ทดลอง', 'chip-mute'] };
    pane.innerHTML = `
      <div class="grid gap-5">
        <section class="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div><h2 class="font-semibold">ซิงก์ใบรับ-ใบเบิกจาก Hosoffice</h2>
            <p class="mt-1 max-w-xl text-sm text-slate-500">ดึงรายการรับ-จ่ายของคลังสารสนเทศตั้งแต่ต้นปีงบ มาแทนการกรอก Excel (อ่านอย่างเดียว ไม่แก้ข้อมูลใน Hosoffice) กด “ทดลอง” เพื่อดูผลก่อนโดยไม่บันทึก</p>
            ${data.configured ? '' : '<p class="mt-2 text-sm text-amber-600">ยังไม่ได้ตั้งค่าการเชื่อมต่อ Hosoffice ใน .env</p>'}</div>
          <div class="flex gap-2"><button id="dry" class="btn btn-soft" type="button" ${data.configured ? '' : 'disabled'}>ทดลองซิงก์</button><button id="run" class="btn btn-primary" type="button" ${data.configured ? '' : 'disabled'}>ซิงก์ตอนนี้</button></div>
        </section>
        <section id="res" class="hidden card p-5"></section>
        <section class="card overflow-hidden"><div class="border-b border-slate-200/70 px-5 py-3 text-sm font-medium dark:border-white/10">ประวัติการซิงก์ล่าสุด</div>
          ${data.recent.length ? `<div class="overflow-x-auto"><table class="w-full min-w-[560px]"><thead><tr><th class="th">เวลา</th><th class="th">ผล</th><th class="th text-right">เพิ่ม</th><th class="th text-right">แก้ไข</th><th class="th text-right">ลบ</th><th class="th">ผู้สั่ง</th></tr></thead><tbody class="divide-y divide-slate-200/60 dark:divide-white/5">${data.recent.map((r) => `<tr><td class="td num text-sm">${esc(dateTimeTh(r.started_at))}</td><td class="td"><span class="chip ${(ST[r.status] || ST['dry-run'])[1]}">${(ST[r.status] || ['-'])[0]}</span></td><td class="td num text-right">${n0(r.inserted_count)}</td><td class="td num text-right">${n0(r.updated_count)}</td><td class="td num text-right">${n0(r.deleted_count)}</td><td class="td text-sm text-slate-500">${r.trigger_by === 'schedule' ? 'อัตโนมัติ' : 'ผู้ใช้'}</td></tr>`).join('')}</tbody></table></div>` : empty('ยังไม่เคยซิงก์')}</section>
      </div>`;
    const show = (r, dry) => {
      const mo = Object.entries(r.monthly || {}).sort();
      const box = $('#res', pane); box.classList.remove('hidden');
      box.innerHTML = `<h3 class="font-semibold">${dry ? 'ผลทดลอง (ยังไม่ได้บันทึก)' : 'ซิงก์เสร็จแล้ว'}</h3>
        <p class="mt-2 text-sm">พบ <b class="num">${n0(r.sourceRows)}</b> แถวจาก Hosoffice · เพิ่ม <b class="num">${n0(r.inserted)}</b> · แก้ไข <b class="num">${n0(r.updated)}</b> · ลบ <b class="num">${n0(r.deleted)}</b></p>
        ${r.itemsCreated?.length ? `<p class="mt-2 text-sm text-amber-600">วัสดุใหม่ที่จะถูกสร้าง: ${esc(r.itemsCreated.join(', '))}</p>` : ''}
        ${Object.keys(r.skipped?.other_types || {}).length ? `<p class="mt-2 text-sm text-amber-600">ข้ามประเภทรายการ: ${esc(JSON.stringify(r.skipped.other_types))}</p>` : ''}
        <div class="mt-3 flex flex-wrap gap-2">${mo.map(([k, v]) => `<span class="chip chip-mute">${esc(k)}: ${n0(v)}</span>`).join('')}</div>`;
    };
    const go = (dry) => async () => {
      const btn = $(dry ? '#dry' : '#run', pane); btn.disabled = true; const t = btn.textContent; btn.textContent = 'กำลังทำงาน…';
      try { const r = await api.post(`/api/sync/hosoffice${dry ? '?dry=1' : ''}`); show(r.data, dry); if (!dry) { toast('ซิงก์เสร็จแล้ว'); } }
      catch (x) { toast(x.message, 'err'); } finally { btn.disabled = false; btn.textContent = t; }
    };
    $('#dry', pane).addEventListener('click', go(true));
    $('#run', pane).addEventListener('click', () => { if (confirm('ซิงก์จริงตอนนี้? ระบบจะเพิ่ม/แก้ไข/ลบรายการที่มาจาก Hosoffice ให้ตรงกับต้นทาง')) go(false)(); });
  };
  await load();
}

async function audit(pane) {
  const { data } = await api.get('/api/admin/audit');
  pane.innerHTML = `<section class="card overflow-hidden">${data.length ? `<div class="overflow-x-auto"><table class="w-full min-w-[640px]"><thead class="border-b border-slate-200/70 dark:border-white/10"><tr><th class="th">เวลา</th><th class="th">ผู้ใช้</th><th class="th">การกระทำ</th><th class="th">รายละเอียด</th></tr></thead>
    <tbody class="divide-y divide-slate-200/60 dark:divide-white/5">${data.map((a) => `<tr><td class="td num whitespace-nowrap text-sm text-slate-500">${esc(dateTimeTh(a.created_at))}</td><td class="td text-sm">${esc(a.user_name || 'ระบบ')}</td><td class="td"><span class="chip chip-mute">${esc(ACTION[a.action] || a.action)}</span></td><td class="td max-w-md truncate text-xs text-slate-500" title="${esc(a.detail || '')}">${esc(a.detail || '')}</td></tr>`).join('')}</tbody></table></div>` : empty('ยังไม่มีประวัติ')}</section>`;
}
