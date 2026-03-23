import { supabase } from './supabase';
import {
  CONFIG, type HabitType, type DayLog, type WeighIn, type HabitStreak, type PlayerStats,
  getMultiplier, getSatsForHabit, getTodayStr, calculateWeighInReward, checkMilestones,
} from './data';

// ── DAY LOGS ──

export async function getDayLogs(): Promise<DayLog[]> {
  const { data, error } = await supabase
    .from('day_logs')
    .select('*')
    .order('date', { ascending: true });

  if (error) { console.error('Load day_logs failed:', error); return []; }
  return (data || []).map((d: any) => ({
    date: d.date,
    steps: d.steps,
    workout: d.workout,
    calories: d.calories,
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
  return { date: d.date, steps: d.steps, workout: d.workout, calories: d.calories };
}

export async function toggleHabit(habit: HabitType, value: boolean): Promise<boolean> {
  const today = getTodayStr();

  // Upsert today's log
  const existing = await getTodayLog();
  if (existing) {
    const { error } = await supabase
      .from('day_logs')
      .update({ [habit]: value })
      .eq('date', today);
    if (error) { console.error('Update habit failed:', error); return false; }
  } else {
    const row: any = { date: today, steps: false, workout: false, calories: false };
    row[habit] = value;
    const { error } = await supabase.from('day_logs').insert(row);
    if (error) { console.error('Insert day_log failed:', error); return false; }
  }
  return true;
}

// ── STREAK CALCULATION ──

export function calculateStreaks(logs: DayLog[]): Record<HabitType, { current: number; longest: number }> {
  const habits: HabitType[] = ['steps', 'workout', 'calories'];
  const result: Record<string, { current: number; longest: number }> = {};

  for (const habit of habits) {
    let longest = 0;
    let current = 0;

    // Sort by date ascending
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < sorted.length; i++) {
      const completed = sorted[i][habit];
      if (completed) {
        // Check if consecutive day
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

    // Verify current streak is actually current (connected to today or yesterday)
    if (sorted.length > 0) {
      const lastLog = sorted[sorted.length - 1];
      const lastDate = new Date(lastLog.date);
      const today = new Date(getTodayStr());
      const diffFromToday = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffFromToday > 1 || !lastLog[habit]) {
        current = 0;
      }
    }

    result[habit] = { current, longest };
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

export async function saveWeighIn(weekNumber: number, weight: number, previousWeight: number): Promise<{ success: boolean; satsEarned: number; milestonesHit: string[] }> {
  const reward = calculateWeighInReward(weight, previousWeight);
  const existing = await getHitMilestones();
  const newMs = checkMilestones(weight, existing);
  const msNames = newMs.map((m) => m.label);
  const msSats = newMs.reduce((s, m) => s + m.sats, 0);
  const totalSats = reward.totalSats + msSats;
  const change = Math.round((weight - previousWeight) * 10) / 10;

  const { error } = await supabase.from('weigh_ins').insert({
    week_number: weekNumber, date: getTodayStr(), weight,
    previous_weight: previousWeight, change, sats_earned: totalSats,
    milestones_hit: msNames,
  });

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

  const streaks: HabitStreak[] = (['steps', 'workout', 'calories'] as HabitType[]).map((type) => {
    const s = streakData[type];
    return {
      type,
      currentStreak: s.current,
      multiplier: getMultiplier(s.current),
      satsPerCompletion: getSatsForHabit(s.current),
      longestStreak: s.longest,
    };
  });

  const daysWithAnyHabit = dayLogs.filter((d) => d.steps || d.workout || d.calories).length;

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
