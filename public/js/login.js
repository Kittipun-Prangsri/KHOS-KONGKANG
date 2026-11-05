const form = document.getElementById('loginForm');
const err = document.getElementById('error');
const btn = document.getElementById('submitBtn');
const pw = document.getElementById('password');

document.getElementById('togglePw').addEventListener('click', (e) => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'ซ่อน' : 'แสดง';
});

const showError = (m) => { err.textContent = m; err.classList.remove('hidden'); };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.classList.add('hidden');
  const username = form.username.value.trim();
  const password = form.password.value;
  if (!username || !password) return showError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kk' },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) { location.replace('/'); return; }
    showError(json.message || 'เข้าสู่ระบบไม่สำเร็จ');
    pw.value = ''; pw.focus();
  } catch {
    showError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่');
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
  }
});
