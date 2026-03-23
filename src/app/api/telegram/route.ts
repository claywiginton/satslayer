import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram, allCompleteMessage } from '@/lib/telegram';

export async function POST(req: NextRequest) {
  try {
    const { type, data } = await req.json();

    if (type === 'all_complete') {
      const msg = allCompleteMessage(data.totalSats || 0);
      await sendTelegram(msg);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
