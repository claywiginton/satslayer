import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CONFIG, HABITS, habitMet, getWeekNumber, getDayNumber, getTodayStr, getMultiplier, getSatsForHabit } from '@/lib/data';
import {
  sendTelegram, eveningReminderMessage, weighInReminderMessage,
  milestoneAlertMessage, allCompleteMessage,
  morningMotivationMessage, weeklySummaryMessage,
  sponsorMissedDayMessage, sponsorWeeklySummaryMessage,
} from '@/lib/telegram';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const today = getTodayStr();
  const trigger = req.nextUrl.searchParams.get('trigger') || 'evening';

  try {
    const { data: profiles } = await supabase.from('player_profile').select('*').limit(1);
    const profile = profiles?.[0];
    if (!profile) return NextResponse.json({ message: 'No profile found, skipping' });

    const playerChatId = profile.telegram_chat_id;
    const sponsorChatId = process.env.SPONSOR_CHAT_ID;
    const startDate = profile.start_date || CONFIG.startDate;
    const dayNumber = getDayNumber(undefined, startDate);
    const weekNumber = getWeekNumber(undefined, startDate);

    const { data: todayLogs } = await supabase.from('day_logs').select('*').eq('date', today).limit(1);
    const todayLog = todayLogs?.[0] || null;

    const { data: allLogs } = await supabase.from('day_logs').select('*').order('date', { ascending: true });
    const { data: weighIns } = await supabase.from('weigh_ins').select('*').order('week_number', { ascending: true });
    const { data: allSats } = await supabase.from('sats_log').select('*');

    const playerMessages: string[] = [];
    const sponsorMessages: string[] = [];

    const getStreak = (habitType: string): number => {
      if (!allLogs || allLogs.length === 0) return 0;
      let streak = 0;
      const sorted = [...allLogs].sort((a: any, b: any) => b.date.localeCompare(a.date));
      for (const log of sorted) {
        if (habitMet(habitType as any, Number(log[habitType]) || 0)) streak++;
        else break;
      }
      return streak;
    };

    // ── MORNING MOTIVATION (7:30am) ──
    if (trigger === 'morning') {
      const maxStreak = Math.max(...HABITS.map(h => getStreak(h.type)), 0);
      const multiplier = getMultiplier(maxStreak);
      const satsPerHabit = getSatsForHabit(maxStreak);
      playerMessages.push(morningMotivationMessage(dayNumber, maxStreak, multiplier, satsPerHabit));
    }

    // ── EVENING CHECK (8pm) ──
    if (trigger === 'evening') {
      const completedHabits: string[] = [];
      const missingHabits: string[] = [];
      const streakInfo: { name: string; days: number; satsAtRisk: number }[] = [];

      for (const habit of HABITS) {
        const val = todayLog ? Number(todayLog[habit.type]) || 0 : 0;
        if (habitMet(habit.type, val)) completedHabits.push(habit.label);
        else missingHabits.push(habit.label);

        const streak = getStreak(habit.type);
        if (streak > 0) {
          streakInfo.push({ name: habit.label, days: streak, satsAtRisk: getSatsForHabit(streak) - CONFIG.baseSatsPerHabit });
        }
      }

      if (missingHabits.length === 0) {
        const { data: satsToday } = await supabase.from('sats_log').select('sats').eq('date', today);
        const totalToday = (satsToday || []).reduce((sum: number, s: any) => sum + s.sats, 0);
        if (totalToday > 0) playerMessages.push(allCompleteMessage(totalToday));
      } else {
        const msg = eveningReminderMessage(completedHabits, missingHabits, streakInfo);
        if (msg) playerMessages.push(msg);

        const streaksAtRisk = streakInfo.filter(s => s.days >= 4 && missingHabits.some(m => m.toLowerCase().includes(s.name.toLowerCase()))).map(s => `${s.name} (${s.days}d)`);
        sponsorMessages.push(sponsorMissedDayMessage(CONFIG.playerName, missingHabits, streaksAtRisk));
      }
    }

    // ── WEIGH-IN REMINDER (Sunday 9am) ──
    if (trigger === 'weighin') {
      const alreadyWeighed = weighIns?.some((w: any) => w.week_number === weekNumber);
      if (!alreadyWeighed) playerMessages.push(weighInReminderMessage(weekNumber));
    }

    // ── MILESTONE ALERT (Monday noon) ──
    if (trigger === 'milestone') {
      const latestWeighIn = weighIns && weighIns.length > 0 ? weighIns[weighIns.length - 1] : null;
      const currentWeight = latestWeighIn ? Number(latestWeighIn.weight) : Number(profile.start_weight);
      const hitMilestones: string[] = [];
      (weighIns || []).forEach((w: any) => { if (w.milestones_hit) hitMilestones.push(...w.milestones_hit); });
      const nextMilestone = CONFIG.milestones.find((m) => currentWeight > m.weight && !hitMilestones.includes(m.label));
      if (nextMilestone && (currentWeight - nextMilestone.weight) <= 5) {
        playerMessages.push(milestoneAlertMessage(currentWeight, nextMilestone, 'kg'));
      }
    }

    // ── WEEKLY SUMMARY (Sunday 7pm) ──
    if (trigger === 'weekly_summary') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      const weekSats = (allSats || []).filter((s: any) => s.date >= weekStartStr).reduce((sum: number, s: any) => sum + Number(s.sats), 0);
      const totalSats = (allSats || []).reduce((sum: number, s: any) => sum + Number(s.sats), 0);
      const weekLogs = (allLogs || []).filter((d: any) => d.date >= weekStartStr);
      const daysLogged = weekLogs.filter((d: any) => HABITS.some(h => habitMet(h.type, Number(d[h.type]) || 0))).length;

      const latestWeighIn = weighIns && weighIns.length > 0 ? weighIns[weighIns.length - 1] : null;
      const prevWeighIn = weighIns && weighIns.length > 1 ? weighIns[weighIns.length - 2] : null;
      const currentWeight = latestWeighIn ? Number(latestWeighIn.weight) : Number(profile.start_weight);
      const weightChange = prevWeighIn && latestWeighIn ? Number(latestWeighIn.weight) - Number(prevWeighIn.weight) : 0;

      const maxStreak = Math.max(...HABITS.map(h => getStreak(h.type)), 0);

      playerMessages.push(weeklySummaryMessage({
        weekNumber, daysLogged, satsEarnedThisWeek: weekSats, totalSatsEarned: totalSats,
        currentWeight, weightChange, bestStreak: maxStreak, bestMultiplier: getMultiplier(maxStreak), unit: 'kg',
      }));

      sponsorMessages.push(sponsorWeeklySummaryMessage(CONFIG.playerName, {
        weekNumber, daysLogged, satsEarnedThisWeek: weekSats, totalSatsEarned: totalSats, totalSatsPaid: totalSats,
      }));
    }

    // Send to player
    for (const msg of playerMessages) {
      if (playerChatId) await sendTelegram(msg, playerChatId);
    }

    // Send to sponsor
    for (const msg of sponsorMessages) {
      if (sponsorChatId) await sendTelegram(msg, sponsorChatId);
    }

    return NextResponse.json({ success: true, trigger, playerMessages: playerMessages.length, sponsorMessages: sponsorMessages.length });

  } catch (e) {
    console.error('Cron error:', e);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
