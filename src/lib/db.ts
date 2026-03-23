import { supabase } from './supabase';
import { CONFIG, calculateWeighInReward, checkMilestones, type PlayerStats, type WeighIn } from './data';

// ── DAILY CHALLENGES ──

export async function getCompletedChallenges(): Promise<Set<number>> {
  const { data, error } = await supabase
    .from('daily_challenges')
    .select('day_number');

  if (error) { console.error('Failed to load challenges:', error); return new Set(); }
  return new Set((data || []).map((d: any) => d.day_number));
}

export async function completeChallenge(dayNumber: number, sats: number): Promise<boolean> {
  const { error } = await supabase
    .from('daily_challenges')
    .insert({
      day_number: dayNumber,
      sats_earned: sats,
      completed_at: new Date().toISOString(),
    });

  if (error) { console.error('Failed to complete challenge:', error); return false; }
  return true;
}

// ── WEIGH-INS ──

export async function getWeighIns(): Promise<WeighIn[]> {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('*')
    .order('week_number', { ascending: true });

  if (error) { console.error('Failed to load weigh-ins:', error); return []; }

  return (data || []).map((d: any) => ({
    id: d.id,
    weekNumber: d.week_number,
    date: d.date,
    weight: Number(d.weight),
    photoUrl: d.photo_url,
    previousWeight: Number(d.previous_weight),
    change: Number(d.change),
    satsEarned: Number(d.sats_earned),
    milestonesHit: d.milestones_hit || [],
  }));
}

export async function saveWeighIn(
  weekNumber: number,
  weight: number,
  previousWeight: number,
  photoUrl?: string
): Promise<{ success: boolean; satsEarned: number; milestonesHit: string[] }> {
  const reward = calculateWeighInReward(weight, previousWeight);
  const existingMilestones = await getHitMilestones();
  const newMilestones = checkMilestones(weight, existingMilestones);
  const milestoneNames = newMilestones.map((m) => m.label);
  const milestoneSats = newMilestones.reduce((sum, m) => sum + m.sats, 0);
  const totalSats = reward.totalSats + milestoneSats;
  const change = Math.round((weight - previousWeight) * 10) / 10;

  const { error } = await supabase.from('weigh_ins').insert({
    week_number: weekNumber,
    date: new Date().toISOString().split('T')[0],
    weight,
    previous_weight: previousWeight,
    change,
    sats_earned: totalSats,
    milestones_hit: milestoneNames,
    photo_url: photoUrl || null,
  });

  if (error) { console.error('Failed to save weigh-in:', error); return { success: false, satsEarned: 0, milestonesHit: [] }; }
  return { success: true, satsEarned: totalSats, milestonesHit: milestoneNames };
}

async function getHitMilestones(): Promise<string[]> {
  const { data, error } = await supabase
    .from('weigh_ins')
    .select('milestones_hit');

  if (error) return [];
  const all: string[] = [];
  (data || []).forEach((d: any) => {
    if (d.milestones_hit) all.push(...d.milestones_hit);
  });
  return [...new Set(all)];
}

// ── STATS ──

export async function getPlayerStats(): Promise<PlayerStats> {
  const [completedDays, weighIns] = await Promise.all([
    getCompletedChallenges(),
    getWeighIns(),
  ]);

  const dailySats = completedDays.size * CONFIG.dailySatsBase;
  const weighInSats = weighIns.reduce((sum, w) => sum + w.satsEarned, 0);
  const totalSatsEarned = dailySats + weighInSats;

  const latestWeighIn = weighIns.length > 0 ? weighIns[weighIns.length - 1] : null;
  const currentWeight = latestWeighIn ? latestWeighIn.weight : CONFIG.startWeight;

  // Streak calc
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  for (let d = 1; d <= 365; d++) {
    if (completedDays.has(d)) {
      tempStreak++;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }
  // Current streak from most recent completed day backwards
  const sortedDays = [...completedDays].sort((a, b) => b - a);
  if (sortedDays.length > 0) {
    currentStreak = 1;
    for (let i = 1; i < sortedDays.length; i++) {
      if (sortedDays[i] === sortedDays[i - 1] - 1) currentStreak++;
      else break;
    }
  }

  const hitMilestones = await getHitMilestones();

  // Comeback pool: sum of missed weekly sats where weight was gained
  const comebackPool = weighIns
    .filter((w) => w.change > 0)
    .reduce((sum, w) => sum + CONFIG.weeklyWeighInBase, 0);

  return {
    totalSatsEarned,
    totalSatsAvailable: CONFIG.totalSats,
    currentWeight,
    startWeight: CONFIG.startWeight,
    goalWeight: CONFIG.goalWeight,
    totalLost: Math.round((CONFIG.startWeight - currentWeight) * 10) / 10,
    currentStreak,
    longestStreak,
    challengesCompleted: completedDays.size,
    challengesTotal: 365,
    weighInsLogged: weighIns.length,
    milestonesHit: hitMilestones,
    comebackPool,
  };
}
