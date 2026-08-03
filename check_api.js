async function main() {
  console.log('Testing local server endpoints...');
  
  const endpoints = [
    'http://localhost:4000/api/items',
    'http://localhost:4000/api/stock/current',
    'http://localhost:4000/api/external/valuation/2'
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      console.log(`URL: ${url}`);
      console.log(`Status: ${res.status}`);
      const data = await res.json();
      console.log(`Success: ${data.success}`);
      if (data.success) {
        if (Array.isArray(data.data)) {
          console.log(`Data count: ${data.data.length}`);
          if (data.data.length > 0) {
            console.log(`First item sample:`, data.data[0]);
          }
        } else {
          console.log(`Data keys:`, Object.keys(data.data || {}));
        }
      } else {
        console.log(`Error message:`, data.message || data.error);
      }
    } catch (e) {
      console.error(`Fetch failed for ${url}:`, e.message);
    }
    console.log('--------------------------------------------------');
  }
}

main();
