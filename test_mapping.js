const valData = [
  {"SUP_ID":0,"MONEY_TOTAL":"0.0000"},
  {"SUP_ID":291,"MONEY_TOTAL":"22050.0000"},
  {"SUP_ID":741,"MONEY_TOTAL":"0.0000"},
  {"SUP_ID":742,"MONEY_TOTAL":"5400.0000"},
  {"SUP_ID":1641,"MONEY_TOTAL":"450.0000"}
];

const mockItems = [
  { item_id: 1, item_code: '291', name: 'หมึก Laser canon 325', current_value: 27000.00 },
  { item_id: 2, item_code: '741', name: 'หมึก Laser HP 12A', current_value: 450.00 },
  { item_id: 3, item_code: '742', name: 'หมึก Laser canon 303', current_value: 5400.00 },
  { item_id: 50, item_code: '1641', name: 'หมึก เติม canon injek  500 ml สีเหลือง', current_value: 300.00 }
];

console.log('--- Initial Values ---');
mockItems.forEach(i => console.log(`${i.item_code} (${i.name}): ${i.current_value}`));

const valMap = new Map(valData.map(d => [String(d.SUP_ID), Number(d.MONEY_TOTAL)]));

mockItems.forEach(item => {
  const extVal = valMap.get(String(item.item_code));
  if (extVal !== undefined) {
    item.current_value = extVal;
  }
});

console.log('--- Updated Values ---');
mockItems.forEach(i => console.log(`${i.item_code} (${i.name}): ${i.current_value}`));
