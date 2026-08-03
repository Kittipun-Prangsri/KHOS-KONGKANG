import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL || 'https://hxejooyqjjrdycxzgdkp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4ZWpvb3lxampyZHljeHpnZGtwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU3NjczOSwiZXhwIjoyMDk5MTUyNzM5fQ.pgMSF9y2-t5n6lH7hql8B7QzSj76Eqv3qEqMJZSS42k';

async function repopulateSummary() {
  const filePath = path.join(__dirname, '../downloaded_stock_file2.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error('❌ ไม่พบไฟล์ downloaded_stock_file2.xlsx');
    process.exit(1);
  }

  console.log('📖 อ่านข้อมูล Excel เพื่อป้อนเข้า monthly_stock_summary...');
  const workbook = XLSX.readFile(filePath);

  // Fetch Items from Supabase to map item_code -> id
  const resFetch = await fetch(`${supabaseUrl}/rest/v1/items?select=id,item_code`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const dbItems = await resFetch.json();
  const codeToIdMap = new Map((dbItems || []).map(i => [i.item_code, i.id]));

  const monthSheetNames = ['10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09'];
  const monthIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const summariesToInsert = [];

  for (let mIdx = 0; mIdx < monthSheetNames.length; mIdx++) {
    const sName = monthSheetNames[mIdx];
    const fMonthId = monthIds[mIdx];
    const sheet = workbook.Sheets[sName];
    if (!sheet) continue;

    const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (let r = 4; r < sheetRows.length; r++) {
      const row = sheetRows[r];
      if (!row || !row[11] || isNaN(row[11])) continue;

      const code = String(row[26] || row[11]).trim();
      const itemId = codeToIdMap.get(code);

      if (!itemId) continue;

      const openQty = parseInt(row[16]) || 0;
      const openVal = parseFloat(row[22]) || 0.00;

      const recQty = parseInt(row[17]) || 0;
      const recVal = parseFloat(row[23]) || 0.00;

      const issQty = parseInt(row[19]) || 0;
      const issVal = parseFloat(row[24]) || 0.00;

      summariesToInsert.push({
        item_id: itemId,
        fiscal_month_id: fMonthId,
        opening_qty: openQty,
        opening_value: openVal,
        received_qty: recQty,
        received_value: recVal,
        issued_qty: issQty,
        issued_value: issVal
      });
    }
  }

  console.log(`📦 เตรียมข้อมูล monthly_stock_summary ${summariesToInsert.length} แถว`);

  const res = await fetch(`${supabaseUrl}/rest/v1/monthly_stock_summary`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(summariesToInsert)
  });

  const inserted = await res.json();
  console.log(`✅ Upsert monthly_stock_summary สำเร็จ ${inserted.length || summariesToInsert.length} แถวไปยัง Supabase! (Status: ${res.status})`);
}

repopulateSummary();
