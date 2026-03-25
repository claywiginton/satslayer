import { NextRequest, NextResponse } from 'next/server';

// ── STRIKE PAYOUT ROUTE ──
// This route will handle sending sats to Eddy when challenges are completed.
// Currently wired up but NOT executing payments — will be enabled when ready.
//
// Flow:
// 1. App sends: { username, sats, reason }
// 2. We create a Lightning payment quote to username@strike.me
// 3. We execute the quote
// 4. Sats land in Eddy's wallet instantly
//
// To enable: set STRIKE_PAYOUTS_ENABLED=true in env vars

export async function POST(req: NextRequest) {
  try {
    const { username, sats, reason } = await req.json();

    if (!username || !sats || !reason) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // GUARDRAIL: cap single payout at 200,000 sats (milestone max + weigh-in max)
    const MAX_SINGLE_PAYOUT = 200_000;
    if (sats > MAX_SINGLE_PAYOUT || sats <= 0) {
      console.error('Payout blocked — out of range:', sats);
      return NextResponse.json({ error: 'Payout amount out of range', sats }, { status: 400 });
    }

    const strikeKey = process.env.STRIKE_API_KEY;
    const payoutsEnabled = process.env.STRIKE_PAYOUTS_ENABLED === 'true';

    if (!strikeKey) {
      return NextResponse.json({
        success: true,
        mock: true,
        message: `Would send ${sats} sats to ${username} for: ${reason}`,
      });
    }

    if (!payoutsEnabled) {
      return NextResponse.json({
        success: true,
        mock: true,
        message: `Payouts disabled. Would send ${sats} sats to ${username} for: ${reason}`,
      });
    }

    // ── REAL PAYOUT FLOW (disabled until STRIKE_PAYOUTS_ENABLED=true) ──

    // Step 1: Create payment quote
    const btcAmount = (sats / 100_000_000).toFixed(8);
    const quoteRes = await fetch('https://api.strike.me/v1/payment-quotes/lightning/lnurl', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${strikeKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lnAddressOrUrl: `${username}@strike.me`,
        sourceCurrency: 'BTC',
        amount: { amount: btcAmount, currency: 'BTC' },
      }),
    });

    if (!quoteRes.ok) {
      const err = await quoteRes.json();
      return NextResponse.json({ success: false, error: 'Quote creation failed', details: err }, { status: 500 });
    }

    const quote = await quoteRes.json();

    // Step 2: Execute the quote
    const execRes = await fetch(`https://api.strike.me/v1/payment-quotes/${quote.paymentQuoteId}/execute`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${strikeKey}`,
        'Content-Length': '0',
      },
    });

    if (!execRes.ok) {
      const err = await execRes.json();
      return NextResponse.json({ success: false, error: 'Payment execution failed', details: err }, { status: 500 });
    }

    const payment = await execRes.json();

    return NextResponse.json({
      success: true,
      mock: false,
      paymentId: payment.paymentId,
      sats,
      reason,
    });

  } catch (e) {
    return NextResponse.json({ success: false, error: 'Payout failed' }, { status: 500 });
  }
}
