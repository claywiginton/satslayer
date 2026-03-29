import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '@/lib/data';
import {
  sendTelegram, allCompleteMessage,
  sponsorHabitLoggedMessage, sponsorAllCompleteMessage, sponsorWeighInMessage,
} from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { type, data } = await req.json();

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: profiles } = await supabase.from('player_profile').select('telegram_chat_id').limit(1);
    const playerChatId = profiles?.[0]?.telegram_chat_id;
    const sponsorChatId = process.env.SPONSOR_CHAT_ID;

    if (type === 'all_complete') {
      const msg = allCompleteMessage(data.totalSats || 0);
      if (playerChatId) await sendTelegram(msg, playerChatId);
      if (sponsorChatId) await sendTelegram(sponsorAllCompleteMessage(CONFIG.playerName, data.totalSats || 0), sponsorChatId);
      return NextResponse.json({ success: true });
    }

    if (type === 'habit_logged') {
      if (sponsorChatId) {
        await sendTelegram(sponsorHabitLoggedMessage(CONFIG.playerName, data.habit, data.sats, data.streak, data.multiplier), sponsorChatId);
      }
      return NextResponse.json({ success: true });
    }

    if (type === 'weigh_in') {
      if (sponsorChatId) {
        await sendTelegram(sponsorWeighInMessage(CONFIG.playerName, data.weight, data.change, data.sats, 'kg'), sponsorChatId);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
