// ── TELEGRAM BOT HELPER ──

const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function sendTelegram(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('Telegram not configured, skipping:', message);
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('Telegram send failed:', data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Telegram error:', e);
    return false;
  }
}

// ── MESSAGE TEMPLATES ──

export function eveningReminderMessage(
  completedHabits: string[],
  missingHabits: string[],
  streakInfo: { name: string; days: number; satsAtRisk: number }[]
): string {
  if (missingHabits.length === 0) return ''; // All done, no reminder needed

  let msg = `🔥 <b>SATSLAYER — Evening Check</b>\n\n`;

  if (completedHabits.length > 0) {
    msg += `✅ Done: ${completedHabits.join(', ')}\n`;
  }

  msg += `❌ Missing: <b>${missingHabits.join(', ')}</b>\n\n`;

  const atRisk = streakInfo.filter(s => s.days > 0 && missingHabits.some(m => m.toLowerCase().includes(s.name.toLowerCase())));
  if (atRisk.length > 0) {
    msg += `⚠️ <b>Streaks at risk:</b>\n`;
    for (const s of atRisk) {
      msg += `  → ${s.name}: ${s.days}d streak (−${s.satsAtRisk.toLocaleString()} sats/day if broken)\n`;
    }
    msg += '\n';
  }

  msg += `⏰ Log before midnight or lose your streak.`;
  return msg;
}

export function weighInReminderMessage(weekNumber: number): string {
  return `⚖️ <b>SATSLAYER — Weigh-in Day</b>\n\nWeek ${weekNumber} weigh-in is ready.\nStep on the scale and log your weight to earn sats.\n\n💰 Base reward: 5,000 sats just for showing up.`;
}

export function streakWarningMessage(
  streaks: { name: string; days: number; multiplier: number; satsPerDay: number }[]
): string {
  let msg = `🚨 <b>SATSLAYER — Streak Warning</b>\n\n`;
  msg += `Your streaks break tomorrow if you don't log today:\n\n`;

  for (const s of streaks) {
    msg += `${s.name}: <b>${s.days}d</b> at ${s.multiplier}× (${s.satsPerDay.toLocaleString()} sats/day)\n`;
  }

  msg += `\nDon't throw it away. Open the app and log now.`;
  return msg;
}

export function milestoneAlertMessage(
  currentWeight: number,
  nextMilestone: { weight: number; label: string; sats: number },
  unit: string
): string {
  const diff = Math.round((currentWeight - nextMilestone.weight) * 10) / 10;
  return `🎯 <b>SATSLAYER — Milestone Alert</b>\n\nYou're <b>${diff} ${unit}</b> away from "${nextMilestone.label}"!\n\nReward: <b>${nextMilestone.sats.toLocaleString()} sats</b> bonus when you hit ${nextMilestone.weight} ${unit}.\n\nKeep pushing. 💪`;
}

export function allCompleteMessage(totalSats: number): string {
  return `✅ <b>SATSLAYER — All Done!</b>\n\nAll 3 habits logged today. +${totalSats.toLocaleString()} sats earned.\n\nSee you tomorrow. 🔥`;
}
