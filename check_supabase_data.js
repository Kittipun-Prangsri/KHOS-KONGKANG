import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://hxejooyqjjrdycxzgdkp.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log('Querying Supabase v_current_stock directly...');
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/v_current_stock?select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      }
    });

    console.log('Response Status:', res.status);
    const data = await res.json();
    console.log('Is Array:', Array.isArray(data));
    if (Array.isArray(data)) {
      console.log('Data count:', data.length);
      if (data.length > 0) {
        console.log('First 3 items:', data.slice(0, 3));
      }
    } else {
      console.log('Response:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
