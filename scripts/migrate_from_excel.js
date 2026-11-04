import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env (ห้ามฝังในโค้ด)');
  process.exit(1);
}

async function migrateExcel() {
  const filePath = path.join(__dirname, '../downloaded_stock_file2.xlsx');
  if (!fs.existsSync(filePath)) {
    console.error('❌ ไม่พบไฟล์ downloaded_stock_file2.xlsx');
    process.exit(1);
  }

  console.log('📖 กำลังอ่านข้อมูลจาก Excel:', filePath);
  const workbook = XLSX.readFile(filePath);
  
  const sheet10 = workbook.Sheets['10'] || workbook.Sheets[workbook.SheetNames[0]];
  const rows10 = XLSX.utils.sheet_to_json(sheet10, { header: 1 });

  const itemsMap = new Map();
  const sqlItemValues = [];

  for (let i = 4; i < rows10.length; i++) {
    const row = rows10[i];
    if (!row || !row[11] || isNaN(row[11])) continue;

    const name = String(row[12] || '').trim();
    const catName = String(row[13] || 'วัสดุคอมพิวเตอร์').trim();
    const unit = String(row[21] || 'ชิ้น').trim();
    const code = String(row[26] || row[11]).trim();
    const initialOpeningQty = parseInt(row[16]) || 0;
    const initialOpeningVal = parseFloat(row[22]) || 0.00;
    const unitPrice = initialOpeningQty > 0 ? (initialOpeningVal / initialOpeningQty) : 100.00;

    if (!name || !code) continue;

    itemsMap.set(code, { name, unit, unitPrice, catName });

    const escapedName = name.replace(/'/g, "''");
    sqlItemValues.push(`('${code}', '${escapedName}', 1, '${unit}', ${unitPrice.toFixed(2)}, 5)`);
  }

  console.log(`📦 ดึงข้อมูลรายการวัสดุ Master ได้ทั้งหมด ${itemsMap.size} รายการ`);

  // Write seed_real_data.sql
  let sqlContent = `-- =============================================================================\n`;
  sqlContent += `-- ข้อมูลจริงวัสดุคอมพิวเตอร์ 51 รายการ จาก 3_มูลค่าวัสดุคอมคงเหลือรายเดือน ปี 2569.xlsx\n`;
  sqlContent += `-- =============================================================================\n\n`;

  sqlContent += `INSERT INTO items (item_code, name, category_id, unit, unit_price, reorder_point)\nVALUES\n`;
  sqlContent += sqlItemValues.join(',\n') + `\nON CONFLICT (item_code) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit, unit_price = EXCLUDED.unit_price;\n\n`;

  // Send Items via Supabase REST API directly
  const itemsArray = Array.from(itemsMap.entries()).map(([code, data]) => ({
    item_code: code,
    name: data.name,
    unit: data.unit,
    unit_price: Number(data.unitPrice.toFixed(2)),
    reorder_point: 5,
    category_id: 1
  }));

  const resItems = await fetch(`${supabaseUrl}/rest/v1/items`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(itemsArray)
  });

  const savedItems = await resItems.json();
  console.log(`✅ Upsert รายการวัสดุ ${savedItems.length || itemsArray.length} รายการไปยัง Supabase!`);

  // Fetch Items mapping code -> ID from Supabase
  const resFetch = await fetch(`${supabaseUrl}/rest/v1/items?select=id,item_code`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const dbItems = await resFetch.json();
  const codeToIdMap = new Map((dbItems || []).map(i => [i.item_code, i.id]));

  // Parse 12 Months
  const monthSheetNames = ['10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09'];
  const monthIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const movementsToInsert = [];

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

      const receivedQty = parseInt(row[17]) || 0;
      const receivedVal = parseFloat(row[23]) || 0.00;

      const issuedQty = parseInt(row[19]) || 0;
      const issuedVal = parseFloat(row[24]) || 0.00;

      const unitPrice = itemsMap.get(code)?.unitPrice || 100.00;

      if (receivedQty > 0) {
        movementsToInsert.push({
          item_id: itemId,
          fiscal_month_id: fMonthId,
          movement_type: 'receive',
          quantity: receivedQty,
          unit_price: receivedQty > 0 ? Number((receivedVal / receivedQty).toFixed(2)) : unitPrice,
          movement_date: `2026-0${fMonthId}-01`,
          note: `ยอดยกมาจาก Excel Sheet ${sName}`
        });
      }

      if (issuedQty > 0) {
        movementsToInsert.push({
          item_id: itemId,
          fiscal_month_id: fMonthId,
          movement_type: 'issue',
          quantity: issuedQty,
          unit_price: issuedQty > 0 ? Number((issuedVal / issuedQty).toFixed(2)) : unitPrice,
          movement_date: `2026-0${fMonthId}-15`,
          note: `การเบิกจ่ายประจำเดือน Sheet ${sName}`
        });
      }
    }
  }

  if (movementsToInsert.length > 0) {
    const resMovs = await fetch(`${supabaseUrl}/rest/v1/stock_movements`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(movementsToInsert)
    });

    console.log(`🎉 Migrate บันทึกเคลื่อนไหวสำเร็จทั้งหมด ${movementsToInsert.length} รายการไปยัง Supabase! (Status: ${resMovs.status})`);
  }

  fs.writeFileSync(path.join(__dirname, '../db/seed_real_data.sql'), sqlContent);
  console.log('📄 บันทึกไฟล์ db/seed_real_data.sql เรียบร้อย');
}

migrateExcel();
