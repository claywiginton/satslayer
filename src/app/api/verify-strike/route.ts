import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();
    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Test mode: skip Strike verification
    const testMode = process.env.TEST_MODE === 'true';
    if (testMode) {
      return NextResponse.json({ valid: true, handle: username });
    }

    // Try to create a tiny payment quote to verify the account exists
    const strikeKey = process.env.STRIKE_API_KEY;
    if (!strikeKey) {
      // If no Strike key configured, accept any username (dev mode)
      return NextResponse.json({ valid: true, handle: username });
    }

    const res = await fetch('https://api.strike.me/v1/payment-quotes/lightning/lnurl', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${strikeKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lnAddressOrUrl: `${username}@strike.me`,
        sourceCurrency: 'BTC',
        amount: { amount: '0.00000001', currency: 'BTC' },
      }),
    });

    if (res.ok) {
      // Quote created = account exists. We won't execute it.
      return NextResponse.json({ valid: true, handle: username });
    } else {
      const data = await res.json();
      return NextResponse.json({ valid: false, error: 'Strike account not found' }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ valid: false, error: 'Verification failed' }, { status: 500 });
  }
}
