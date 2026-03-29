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

// ── MORNING MOTIVATION ──

const MORNING_LINES = [
  "New day. New chance to prove it. Let's go.",
  "The streak doesn't build itself. Get after it.",
  "Yesterday is done. Today is what matters. Show up.",
  "Your multiplier is counting on you. Don't let it down.",
  "Rise and grind. Sats are waiting.",
  "Every day you show up, the gap closes. Let's work.",
  "Champions don't take days off. Neither do you.",
  "The hardest part is the first step. Take it now.",
  "You're not doing this because it's easy. You're doing it because it pays.",
  "Another 24 hours to prove you're about that life.",
];

export function morningMotivationMessage(
  dayNumber: number,
  currentStreak: number,
  multiplier: number,
  satsPerHabit: number,
): string {
  let msg = `☀️ <b>PROOF OF WORK — Day ${dayNumber}</b>\n\n`;
  msg += randomLine(MORNING_LINES);
  msg += `\n\n`;
  if (currentStreak > 0) {
    msg += `🔥 Streak: ${currentStreak} days\n`;
    msg += `⚡ Multiplier: ${multiplier}×\n`;
    msg += `💰 ${satsPerHabit.toLocaleString()} sats per habit today\n`;
  } else {
    msg += `💰 500 sats per habit today — start building that streak.\n`;
  }
  msg += `\n3 habits. Get it done.\n\n✝️ <i>"I can do all things through Christ who strengthens me."</i> — Philippians 4:13`;
  return msg;
}

// ── WEEKLY SUMMARY (sent to player) ──

export function weeklySummaryMessage(data: {
  weekNumber: number;
  daysLogged: number;
  satsEarnedThisWeek: number;
  totalSatsEarned: number;
  currentWeight: number;
  weightChange: number;
  bestStreak: number;
  bestMultiplier: number;
  unit: string;
}): string {
  const { weekNumber, daysLogged, satsEarnedThisWeek, totalSatsEarned, currentWeight, weightChange, bestStreak, bestMultiplier, unit } = data;
  let msg = `📊 <b>PROOF OF WORK — Week ${weekNumber} Summary</b>\n\n`;
  msg += `Days logged: <b>${daysLogged}/7</b>\n`;
  msg += `Sats earned this week: <b>${satsEarnedThisWeek.toLocaleString()}</b>\n`;
  msg += `Total sats earned: <b>${totalSatsEarned.toLocaleString()}</b>\n\n`;
  msg += `⚖️ Current weight: <b>${Math.round(currentWeight * 10) / 10} ${unit}</b>\n`;
  if (weightChange < 0) {
    msg += `📉 Down <b>${Math.abs(Math.round(weightChange * 10) / 10)} ${unit}</b> this week — keep going!\n`;
  } else if (weightChange > 0) {
    msg += `📈 Up ${Math.round(weightChange * 10) / 10} ${unit} — tighten it up this week.\n`;
  } else {
    msg += `➡️ Weight maintained\n`;
  }
  msg += `\n🔥 Best streak: ${bestStreak}d (${bestMultiplier}×)\n`;
  msg += `\nNew week starts now. Make it count.`;
  return msg;
}

// ── SPONSOR NOTIFICATIONS ──

export function sponsorHabitLoggedMessage(
  playerName: string,
  habit: string,
  sats: number,
  streak: number,
  multiplier: number,
): string {
  return `📋 <b>${playerName}</b> logged <b>${habit}</b>\n+${sats.toLocaleString()} sats · ${streak}d streak · ${multiplier}×`;
}

export function sponsorAllCompleteMessage(playerName: string, totalSats: number): string {
  return `✅ <b>${playerName}</b> completed all 3 habits today. +${totalSats.toLocaleString()} sats.`;
}

export function sponsorMissedDayMessage(playerName: string, missingHabits: string[], streaksAtRisk: string[]): string {
  let msg = `❌ <b>${playerName}</b> missed: ${missingHabits.join(', ')}\n`;
  if (streaksAtRisk.length > 0) {
    msg += `⚠️ Streaks broken: ${streaksAtRisk.join(', ')}`;
  }
  return msg;
}

export function sponsorWeighInMessage(playerName: string, weight: number, change: number, sats: number, unit: string): string {
  const dir = change <= 0 ? '📉' : '📈';
  const changeStr = change <= 0 ? `down ${Math.abs(Math.round(change * 10) / 10)}` : `up ${Math.round(change * 10) / 10}`;
  return `⚖️ <b>${playerName}</b> weighed in: <b>${Math.round(weight * 10) / 10} ${unit}</b> (${dir} ${changeStr} ${unit})\n+${sats.toLocaleString()} sats`;
}

export function sponsorWeeklySummaryMessage(playerName: string, data: {
  weekNumber: number;
  daysLogged: number;
  satsEarnedThisWeek: number;
  totalSatsEarned: number;
  totalSatsPaid: number;
}): string {
  const { weekNumber, daysLogged, satsEarnedThisWeek, totalSatsEarned } = data;
  return `📊 <b>Sponsor Report — Week ${weekNumber}</b>\n\n${playerName}: ${daysLogged}/7 days logged\nPaid this week: ${satsEarnedThisWeek.toLocaleString()} sats\nTotal paid: ${totalSatsEarned.toLocaleString()} sats`;
}
