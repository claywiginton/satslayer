import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({ connected: false, error: 'Bot not configured' }, { status: 500 });
    }

    // Check for recent messages to the bot
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=10&timeout=0`);
    const data = await res.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return NextResponse.json({ connected: false, error: 'No messages found. Send /start to the bot first.' });
    }

    // Find the most recent /start message
    const updates = data.result.reverse();
    let chatId: number | null = null;
    let firstName: string = '';

    for (const update of updates) {
      const msg = update.message;
      if (msg && msg.text && (msg.text === '/start' || msg.text.startsWith('/start'))) {
        chatId = msg.chat.id;
        firstName = msg.chat.first_name || msg.from?.first_name || '';
        break;
      }
    }

    if (!chatId) {
      // Fall back to any message
      for (const update of updates) {
        if (update.message?.chat?.id) {
          chatId = update.message.chat.id;
          firstName = update.message.chat.first_name || '';
          break;
        }
      }
    }

    if (!chatId) {
      return NextResponse.json({ connected: false, error: 'No messages found. Open the bot in Telegram and send /start' });
    }

    // Return chatId — the client will save it when profile is created
    // (Profile doesn't exist yet during onboarding)

    // Send a welcome message
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔥 <b>SATSLAYER — Connected!</b>\n\nYou'll get reminders here:\n• Evening nudge if you haven't logged\n• Weekly weigh-in reminders\n• Milestone alerts\n• Streak warnings\n\nLet's go. 💪`,
        parse_mode: 'HTML',
      }),
    });

    return NextResponse.json({ connected: true, chatId, firstName });
  } catch (e) {
    console.error('Telegram register error:', e);
    return NextResponse.json({ connected: false, error: 'Connection failed' }, { status: 500 });
  }
}
