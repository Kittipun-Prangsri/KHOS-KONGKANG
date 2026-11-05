// สลับโหมดมืด/สว่าง — โหลดใน <head> เพื่อไม่ให้หน้าวาบสีผิดตอนเปิด
(function () {
  var KEY = 'kk-theme';
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(mode) {
    var dark = mode === 'dark' || (mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var els = document.querySelectorAll('[data-theme-icon]');
    for (var i = 0; i < els.length; i++) els[i].textContent = dark ? '☀' : '☾';
  }
  apply(stored());
  window.kkToggleTheme = function () {
    var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) { /* ใช้ไม่ได้ก็ข้าม */ }
    apply(next);
  };
  document.addEventListener('DOMContentLoaded', function () {
    apply(stored());
    document.addEventListener('click', function (e) { if (e.target.closest('#themeBtn')) window.kkToggleTheme(); });
  });
})();
