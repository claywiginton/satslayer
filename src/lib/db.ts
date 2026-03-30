import { supabase } from './supabase';
import {
  CONFIG, HABITS, type HabitType, type DayLog, type WeighIn, type HabitStreak, type PlayerStats,
  getMultiplier, getSatsForHabit, getTodayStr, calculateWeighInReward, checkMilestones, habitMet,
} from './data';

// ── PLAYER PROFILE ──

export interface PlayerProfile {
  strikeUsername: string;
  startWeight: number;
  goalWeight: number;
  startDate: string;
  createdAt: string;
}

export async function getPlayerProfile(): Promise<PlayerProfile | null> {
  const { data, error } = await supabase
    .from('player_profile')
    .select('*')
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const d = data[0];
  return {
    strikeUsername: d.strike_username,
    startWeight: Number(d.start_weight),
    goalWeight: Number(d.goal_weight),
    startDate: d.start_date,
    createdAt: d.created_at,
  };
}

export async function savePlayerProfile(
  strikeUsername: string,
  startWeight: number,
  goalWeight: number,
  telegramChatId?: string,
  startDate?: string,
  startPhoto?: string
): Promise<boolean> {
  const date = startDate || getTodayStr();
  console.log('savePlayerProfile: inserting', { strikeUsername, startWeight, goalWeight, start_date: date, telegramChatId, hasPhoto: !!startPhoto });
  const row: any = {
    strike_username: strikeUsername,
    start_weight: startWeight,
    goal_weight: goalWeight,
    start_date: date,
    telegram_chat_id: telegramChatId || null,
  };
  if (startPhoto) row.start_photo = startPhoto;
  const { data, error } = await supabase.from('player_profile').insert(row).select();

  console.log('savePlayerProfile result:', { data, error });
  if (error) { console.error('Save profile failed:', error.message, error.details, error.hint, error.code); return false; }
  return true;
}

// ── DAY LOGS ──

export async function getDayLogs(): Promise<DayLog[]> {
  const { data, error } = await supabase
    .from('day_logs')
    .select('*')
    .order('date', { ascending: true });

  if (error) { console.error('Load day_logs failed:', error); return []; }
  return (data || []).map((d: any) => ({
    date: d.date,
    steps: Number(d.steps) || 0,
    workout: Number(d.workout) || 0,
    calories: Number(d.calories) || 0,
    sugar: Number(d.sugar) || 0,
  }));
}

export async function getTodayLog(): Promise<DayLog | null> {
  const today = getTodayStr();
  const { data, error } = await supabase
    .from('day_logs')
    .select('*')
    .eq('date', today)
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const d = data[0];
  return { date: d.date, steps: Number(d.steps) || 0, workout: Number(d.workout) || 0, calories: Number(d.calories) || 0, sugar: Number(d.sugar) || 0 };
}

export async function saveHabitValue(habit: HabitType, value: number): Promise<boolean> {
  const today = getTodayStr();

  const existing = await getTodayLog();

  // GUARDRAIL: if this habit was already logged today with a valid value, block it
  if (existing && habitMet(habit, existing[habit])) {
    console.log('Habit already completed today, blocking duplicate:', habit);
    return false;
  }

  if (existing) {
    const { error } = await supabase
      .from('day_logs')
      .update({ [habit]: value })
      .eq('date', today);
    if (error) { console.error('Update habit failed:', error); return false; }
  } else {
    const row: any = { date: today, steps: 0, workout: 0, calories: 0, sugar: 0 };
    row[habit] = value;
    const { error } = await supabase.from('day_logs').insert(row);
    if (error) { console.error('Insert day_log failed:', error); return false; }
  }
  return true;
}

// ── STREAK CALCULATION ──

// Helper: get ISO week start (Monday) for a date
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split('T')[0];
}

export function calculateStreaks(logs: DayLog[]): Record<HabitType, { current: number; longest: number }> {
  const result: Record<string, { current: number; longest: number }> = {};
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const today = getTodayStr();

  for (const habitConfig of HABITS) {
    const habit = habitConfig.type;

    if (habitConfig.streakMode === 'daily') {
      // ── DAILY STREAK: must complete every consecutive day ──
      let longest = 0;
      let current = 0;

      for (let i = 0; i < sorted.length; i++) {
        const completed = habitMet(habit, sorted[i][habit]);
        if (completed) {
          if (i === 0) {
            current = 1;
          } else {
            const prevDate = new Date(sorted[i - 1].date);
            const currDate = new Date(sorted[i].date);
            const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
            current = diffDays === 1 ? current + 1 : 1;
          }
          longest = Math.max(longest, current);
        } else {
          current = 0;
        }
      }

      // Verify streak is connected to today or yesterday
      if (sorted.length > 0) {
        const lastLog = sorted[sorted.length - 1];
        const lastDate = new Date(lastLog.date);
        const todayDate = new Date(today);
        const diffFromToday = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffFromToday > 1 || !habitMet(habit, lastLog[habit])) {
          current = 0;
        }
      }

      result[habit] = { current, longest };

    } else {
      // ── WEEKLY STREAK: need X completions per calendar week (Mon-Sun) ──
      const weeklyTarget = habitConfig.weeklyTarget || 5;

      // Group logs by week (Mon-Sun)
      const weekMap: Record<string, number> = {};
      for (const log of sorted) {
        if (habitMet(habit, log[habit])) {
          const weekKey = getWeekStart(log.date);
          weekMap[weekKey] = (weekMap[weekKey] || 0) + 1;
        }
      }

      // Get all week starts in order
      const weekKeys = Object.keys(weekMap).sort();

      // Calculate consecutive weeks that met the target
      let longest = 0;
      let current = 0;

      for (let i = 0; i < weekKeys.length; i++) {
        const metTarget = weekMap[weekKeys[i]] >= weeklyTarget;
        if (metTarget) {
          if (i === 0) {
            current = 1;
          } else {
            // Check if this is the consecutive next week
            const prevWeek = new Date(weekKeys[i - 1]);
            const currWeek = new Date(weekKeys[i]);
            const diffDays = Math.round((currWeek.getTime() - prevWeek.getTime()) / (1000 * 60 * 60 * 24));
            current = diffDays === 7 ? current + 1 : 1;
          }
          longest = Math.max(longest, current);
        } else {
          current = 0;
        }
      }

      // Verify current streak: this week or last week must have met target
      const thisWeekStart = getWeekStart(today);
      const lastWeekDate = new Date(thisWeekStart);
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);
      const lastWeekStart = lastWeekDate.toISOString().split('T')[0];

      const thisWeekCount = weekMap[thisWeekStart] || 0;
      const lastWeekCount = weekMap[lastWeekStart] || 0;

      // Current week is still in progress — check if last completed week was recent
      if (weekKeys.length > 0) {
        const lastCompletedWeek = weekKeys[weekKeys.length - 1];
        if (lastCompletedWeek !== thisWeekStart && lastCompletedWeek !== lastWeekStart) {
          current = 0;
        } else if (lastCompletedWeek === lastWeekStart && lastWeekCount < weeklyTarget) {
          current = 0;
        }
      }

      // Convert weekly streak to "days" equivalent for the multiplier (weeks × 7)
      // This way the multiplier tiers work the same
      result[habit] = { current: current * 7, longest: longest * 7 };
    }
  }

  return result as Record<HabitType, { current: number; longest: number }>;
}

// ── SAT TRACKING ──

export async function getSatsLog(): Promise<{ date: string; habit: string; sats: number }[]> {
  const { data, error } = await supabase
    .from('sats_log')
    .select('*')
    .order('date', { ascending: true });

  if (error) { console.error('Load sats_log failed:', error); return []; }
  return (data || []).map((d: any) => ({ date: d.date, habit: d.habit, sats: d.sats }));
}

export async function logSats(date: string, habit: string, sats: number): Promise<boolean> {
  const { error } = await supabase.from('sats_log').insert({ date, habit, sats });
  if (error) { console.error('Log sats failed:', error); return false; }
  return true;
}

// ── WEIGH-INS ──

export async function getWeighIns(): Promise<WeighIn[]> {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('*')
    .order('week_number', { ascending: true });

  if (error) { console.error('Load weigh_ins failed:', error); return []; }
  return (data || []).map((d: any) => ({
    id: d.id, weekNumber: d.week_number, date: d.date,
    weight: Number(d.weight), previousWeight: Number(d.previous_weight),
    change: Number(d.change), satsEarned: Number(d.sats_earned),
    milestonesHit: d.milestones_hit || [],
  }));
}

export async function saveWeighIn(weekNumber: number, weight: number, previousWeight: number, scalePhoto?: string): Promise<{ success: boolean; satsEarned: number; milestonesHit: string[] }> {
  // GUARDRAIL: check if already weighed in this week
  const { data: existingWeighIns } = await supabase
    .from('weigh_ins').select('id').eq('week_number', weekNumber).limit(1);
  if (existingWeighIns && existingWeighIns.length > 0) {
    console.log('Already weighed in this week, blocking duplicate');
    return { success: false, satsEarned: 0, milestonesHit: [] };
  }

  // GUARDRAIL: weight must be reasonable (30-300 kg)
  if (weight < 30 || weight > 300) {
    console.log('Weight out of reasonable range:', weight);
    return { success: false, satsEarned: 0, milestonesHit: [] };
  }

  const reward = calculateWeighInReward(weight, previousWeight);
  const existing = await getHitMilestones();
  const newMs = checkMilestones(weight, existing);
  const msNames = newMs.map((m) => m.label);
  const msSats = newMs.reduce((s, m) => s + m.sats, 0);
  const totalSats = reward.totalSats + msSats;
  const change = Math.round((weight - previousWeight) * 10) / 10;

  const row: any = {
    week_number: weekNumber, date: getTodayStr(), weight,
    previous_weight: previousWeight, change, sats_earned: totalSats,
    milestones_hit: msNames,
  };
  if (scalePhoto) row.scale_photo = scalePhoto;

  const { error } = await supabase.from('weigh_ins').insert(row);

  if (error) { console.error('Save weigh-in failed:', error); return { success: false, satsEarned: 0, milestonesHit: [] }; }

  // Log the sats
  if (totalSats > 0) await logSats(getTodayStr(), 'weigh_in', totalSats);

  return { success: true, satsEarned: totalSats, milestonesHit: msNames };
}

async function getHitMilestones(): Promise<string[]> {
  const { data, error } = await supabase.from('weigh_ins').select('milestones_hit');
  if (error) return [];
  const all: string[] = [];
  (data || []).forEach((d: any) => { if (d.milestones_hit) all.push(...d.milestones_hit); });
  return [...new Set(all)];
}

// ── FULL STATS ──

export async function getPlayerStats(): Promise<PlayerStats> {
  const [dayLogs, satsLog, weighIns] = await Promise.all([
    getDayLogs(), getSatsLog(), getWeighIns(),
  ]);

  const streakData = calculateStreaks(dayLogs);
  const totalSatsFromLog = satsLog.reduce((sum, s) => sum + s.sats, 0);
  const latestWeighIn = weighIns.length > 0 ? weighIns[weighIns.length - 1] : null;
  const currentWeight = latestWeighIn ? latestWeighIn.weight : CONFIG.startWeight;
  const hitMilestones = await getHitMilestones();

  const streaks: HabitStreak[] = (['steps', 'workout', 'calories', 'sugar'] as HabitType[]).map((type) => {
    const s = streakData[type];
    return {
      type,
      currentStreak: s.current,
      multiplier: getMultiplier(s.current),
      satsPerCompletion: getSatsForHabit(s.current),
      longestStreak: s.longest,
    };
  });

  const daysWithAnyHabit = dayLogs.filter((d) => d.steps > 0 || d.workout > 0 || d.calories > 0 || d.sugar > 0).length;

  return {
    totalSatsEarned: totalSatsFromLog,
    currentWeight,
    totalLost: Math.round((CONFIG.startWeight - currentWeight) * 10) / 10,
    streaks,
    totalDaysLogged: daysWithAnyHabit,
    weighInsLogged: weighIns.length,
    milestonesHit: hitMilestones,
  };
}
