import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CONFIG, HABITS, habitMet, getWeekNumber, getTodayStr, getMultiplier, getSatsForHabit } from '@/lib/data';
import {
  sendTelegram, eveningReminderMessage, weighInReminderMessage,
  streakWarningMessage, milestoneAlertMessage, allCompleteMessage,
} from '@/lib/telegram';

// Vercel cron jobs call this endpoint
// Schedule: runs at 8pm daily and 9am on weigh-in day (configured in vercel.json)

export async function GET(req: NextRequest) {
  // Verify this is a legitimate cron call
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const today = getTodayStr();
  const weekNumber = getWeekNumber();
  const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
  const hour = new Date().getUTCHours(); // We'll use the trigger type param instead

  // Get trigger type from query param
  const trigger = req.nextUrl.searchParams.get('trigger') || 'evening';

  try {
    // Load today's log
    const { data: todayLogs } = await supabase
      .from('day_logs').select('*').eq('date', today).limit(1);
    const todayLog = todayLogs?.[0] || null;

    // Load all logs for streak calculation
    const { data: allLogs } = await supabase
      .from('day_logs').select('*').order('date', { ascending: true });

    // Load weigh-ins
    const { data: weighIns } = await supabase
      .from('weigh_ins').select('*').order('week_number', { ascending: true });

    // Load profile
    const { data: profiles } = await supabase
      .from('player_profile').select('*').limit(1);
    const profile = profiles?.[0];

    if (!profile) {
      return NextResponse.json({ message: 'No profile found, skipping' });
    }

    const messages: string[] = [];

    // ── EVENING CHECK (8pm) ──
    if (trigger === 'evening') {
      const completedHabits: string[] = [];
      const missingHabits: string[] = [];
      const streakInfo: { name: string; days: number; satsAtRisk: number }[] = [];

      for (const habit of HABITS) {
        const val = todayLog ? Number(todayLog[habit.type]) || 0 : 0;
        const met = habitMet(habit.type, val);

        if (met) {
          completedHabits.push(habit.label);
        } else {
          missingHabits.push(habit.label);
        }

        // Calculate current streak for this habit (simplified — check consecutive days)
        if (allLogs && allLogs.length > 0) {
          let streak = 0;
          const sorted = [...allLogs].sort((a: any, b: any) => b.date.localeCompare(a.date));
          for (const log of sorted) {
            if (habitMet(habit.type, Number(log[habit.type]) || 0)) {
              streak++;
            } else {
              break;
            }
          }
          if (streak > 0) {
            const satsAtRisk = getSatsForHabit(streak) - CONFIG.baseSatsPerHabit;
            streakInfo.push({ name: habit.label, days: streak, satsAtRisk });
          }
        }
      }

      // If all complete, send congrats instead
      if (missingHabits.length === 0) {
        const { data: satsToday } = await supabase
          .from('sats_log').select('sats').eq('date', today);
        const totalToday = (satsToday || []).reduce((sum: number, s: any) => sum + s.sats, 0);
        if (totalToday > 0) {
          messages.push(allCompleteMessage(totalToday));
        }
      } else {
        const msg = eveningReminderMessage(completedHabits, missingHabits, streakInfo);
        if (msg) messages.push(msg);
      }
    }

    // ── WEIGH-IN REMINDER (Sunday morning) ──
    if (trigger === 'weighin') {
      const alreadyWeighed = weighIns?.some((w: any) => w.week_number === weekNumber);
      if (!alreadyWeighed) {
        messages.push(weighInReminderMessage(weekNumber));
      }
    }

    // ── MILESTONE ALERT (check weekly) ──
    if (trigger === 'milestone') {
      const latestWeighIn = weighIns && weighIns.length > 0 ? weighIns[weighIns.length - 1] : null;
      const currentWeight = latestWeighIn ? Number(latestWeighIn.weight) : Number(profile.start_weight);

      // Find next unhit milestone
      const hitMilestones: string[] = [];
      (weighIns || []).forEach((w: any) => {
        if (w.milestones_hit) hitMilestones.push(...w.milestones_hit);
      });

      const nextMilestone = CONFIG.milestones.find(
        (m) => currentWeight > m.weight && !hitMilestones.includes(m.label)
      );

      if (nextMilestone) {
        const diff = currentWeight - nextMilestone.weight;
        if (diff <= 5) { // Only alert when within 5 kg
          messages.push(milestoneAlertMessage(currentWeight, nextMilestone, 'kg'));
        }
      }
    }

    // Send all messages
    for (const msg of messages) {
      await sendTelegram(msg);
    }

    return NextResponse.json({
      success: true,
      trigger,
      messagesSent: messages.length,
    });

  } catch (e) {
    console.error('Cron error:', e);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
