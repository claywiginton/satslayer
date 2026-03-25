// ── TELEGRAM BOT HELPER ──

const TELEGRAM_API = 'https://api.telegram.org/bot';

export async function sendTelegram(message: string, chatIdOverride?: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('Telegram not configured, skipping:', message.substring(0, 50));
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

const ALL_COMPLETE_LINES = [
  "You did it you dirty dog 🐕",
  "Three for three. You're a machine.",
  "That's how it's done. No excuses, just results.",
  "Another day, another proof of work. Respect.",
  "You just made money by being disciplined. Most people can't say that.",
  "Clean sweep. The streak lives on. 🔥",
  "Consistency is a superpower and you've got it.",
  "Crushed it. Sleep well, you earned it.",
  "The version of you from last month wouldn't believe this.",
  "Sats stacked. Habits locked. Tomorrow we go again.",
];

const EVENING_NUDGE_LINES = [
  "Don't blow it now.",
  "The clock is ticking. You know what to do.",
  "Your future self is watching. Don't let them down.",
  "You're this close to a perfect day. Finish it.",
  "The hard part is starting. Just open the app.",
  "Those sats aren't going to earn themselves.",
];

const STREAK_WARNING_LINES = [
  "This is not a drill.",
  "You've built something real. Don't torch it.",
  "One bad day undoes weeks of work. Don't let that be today.",
  "Your multiplier is begging you to show up.",
];

function randomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

export function eveningReminderMessage(
  completedHabits: string[],
  missingHabits: string[],
  streakInfo: { name: string; days: number; satsAtRisk: number }[]
): string {
  if (missingHabits.length === 0) return '';

  let msg = `⚠️ <b>PROOF OF WORK</b>\n\n`;

  if (completedHabits.length > 0) {
    msg += `✅ ${completedHabits.join(', ')} — done\n`;
  }

  msg += `❌ <b>${missingHabits.join(', ')}</b> — still missing\n\n`;

  const atRisk = streakInfo.filter(s => s.days > 0 && missingHabits.some(m => m.toLowerCase().includes(s.name.toLowerCase())));
  if (atRisk.length > 0) {
    for (const s of atRisk) {
      msg += `🔥 ${s.name}: ${s.days}d streak at risk (−${s.satsAtRisk.toLocaleString()} sats/day)\n`;
    }
    msg += '\n';
  }

  msg += randomLine(EVENING_NUDGE_LINES);
  return msg;
}

export function weighInReminderMessage(weekNumber: number): string {
  return `⚖️ <b>PROOF OF WORK — Weigh-in Time</b>\n\nWeek ${weekNumber}. Step on the scale.\n\n5,000 sats just for showing up. Lose weight and it pays even more.\n\nNo hiding from the number. That's the deal.`;
}

export function streakWarningMessage(
  streaks: { name: string; days: number; multiplier: number; satsPerDay: number }[]
): string {
  let msg = `🚨 <b>PROOF OF WORK</b>\n\n${randomLine(STREAK_WARNING_LINES)}\n\n`;

  for (const s of streaks) {
    msg += `→ ${s.name}: <b>${s.days}d</b> streak, ${s.multiplier}× multiplier, ${s.satsPerDay.toLocaleString()} sats/day\n`;
  }

  msg += `\nLog now or lose it all tomorrow.`;
  return msg;
}

export function milestoneAlertMessage(
  currentWeight: number,
  nextMilestone: { weight: number; label: string; sats: number },
  unit: string
): string {
  const diff = Math.round((currentWeight - nextMilestone.weight) * 10) / 10;
  return `🎯 <b>PROOF OF WORK — You're Close</b>\n\n<b>${diff} ${unit}</b> away from "${nextMilestone.label}"\n\nThat's a <b>${nextMilestone.sats.toLocaleString()} sat</b> bonus waiting for you.\n\nDon't slow down now. The finish line can see you. 👀`;
}

export function allCompleteMessage(totalSats: number): string {
  return `✅ <b>PROOF OF WORK</b>\n\nAll 3 habits logged. +${totalSats.toLocaleString()} sats.\n\n${randomLine(ALL_COMPLETE_LINES)}`;
}
