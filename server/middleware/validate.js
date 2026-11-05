import { validationResult } from 'express-validator';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง', errors: errors.array() });
  next();
};

export const fail = (res, error, label = 'server error') => {
  console.error(`${label}: ${error?.code || ''} ${error?.message || error}`.slice(0, 300));   // ไม่พิมพ์ SQL/พารามิเตอร์ (อาจมีเลขบัตร)
  res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบ' });
};
