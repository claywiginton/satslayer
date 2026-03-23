import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const adminPin = process.env.ADMIN_PIN || '7777';

    if (pin !== adminPin) {
      return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Delete all data in order (respecting foreign keys)
    await supabase.from('sats_log').delete().neq('id', 0);
    await supabase.from('day_logs').delete().neq('id', 0);
    await supabase.from('weigh_ins').delete().neq('id', 0);
    await supabase.from('player_profile').delete().neq('id', 0);

    return NextResponse.json({ success: true, message: 'All data wiped. Fresh start.' });
  } catch (e) {
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
