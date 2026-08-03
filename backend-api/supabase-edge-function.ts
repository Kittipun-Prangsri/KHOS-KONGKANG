// Supabase Edge Function: record-movement
// Path: supabase/functions/record-movement/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. ดักจับข้อผิดพลาดการ Parse JSON
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ success: false, message: 'Invalid JSON request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { item_id, fiscal_month_id, movement_type, quantity, unit_price, movement_date, reference_no, note, created_by } = body;

    if (!item_id || !fiscal_month_id || !movement_type || !quantity || !unit_price || !movement_date) {
      return new Response(JSON.stringify({ success: false, message: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. ตรวจสอบสต๊อกคงเหลือปัจจุบันกรณีเบิกจ่าย
    if (movement_type === 'issue') {
      const { data: stockData, error: stockError } = await supabase
        .from('v_current_stock')
        .select('current_qty')
        .eq('item_id', item_id)
        .maybeSingle();

      if (stockError) throw stockError;

      const currentQty = stockData?.current_qty || 0;
      if (currentQty < Number(quantity)) {
        return new Response(JSON.stringify({
          success: false,
          message: `จำนวนคงเหลือไม่พอสำหรับเบิกออก (คงเหลือปัจจุบัน: ${currentQty} ชิ้น)`
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3. บันทึกข้อมูล
    const { data, error } = await supabase
      .from('stock_movements')
      .insert([
        {
          item_id: Number(item_id),
          fiscal_month_id: Number(fiscal_month_id),
          movement_type,
          quantity: Number(quantity),
          unit_price: Number(unit_price),
          movement_date,
          reference_no: reference_no || null,
          note: note || null,
          created_by: created_by || null,
        }
      ])
      .select();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, message: 'Movement recorded', data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
