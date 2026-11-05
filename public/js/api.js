// เรียก API ภายในระบบ: ส่งหัว X-Requested-With (ป้องกัน CSRF), หมดเวลาเข้าสู่ระบบ -> กลับหน้าล็อกอิน
export class ApiError extends Error {
  constructor(message, status, body) { super(message); this.status = status; this.body = body; }
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'X-Requested-With': 'kk', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !url.startsWith('/api/auth/')) { location.replace('/login'); throw new ApiError('หมดเวลาเข้าสู่ระบบ', 401); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) throw new ApiError(json.message || `เกิดข้อผิดพลาด (${res.status})`, res.status, json);
  return json;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  patch: (u, b = {}) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};
