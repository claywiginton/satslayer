import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram, allCompleteMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { type, data } = await req.json();

    // Get chat ID from profile
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: profiles } = await supabase.from('player_profile').select('telegram_chat_id').limit(1);
    const chatId = profiles?.[0]?.telegram_chat_id || process.env.TELEGRAM_CHAT_ID;

    if (type === 'all_complete') {
      const msg = allCompleteMessage(data.totalSats || 0);
      await sendTelegram(msg, chatId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
