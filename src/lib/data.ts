// ── SATSLAYER v2: STREAK MULTIPLIER ENGINE ──

export const CONFIG = {
  playerName: 'Eddy',
  startWeight: 300,
  goalWeight: 250,
  calorieTarget: 2000,
  startDate: '2026-04-01',
  totalSats: 2_000_000,

  // Base sats per habit (before multiplier)
  baseSatsPerHabit: 500,

  // Streak multiplier tiers — ramps fast to create addiction
  streakTiers: [
    { minDays: 1, multiplier: 1 },    // Days 1-3
    { minDays: 4, multiplier: 2 },    // Days 4-7 — first taste
    { minDays: 8, multiplier: 4 },    // Days 8-14
    { minDays: 15, multiplier: 7 },   // Days 15-21
    { minDays: 22, multiplier: 10 },  // Days 22-30
    { minDays: 31, multiplier: 15 },  // Days 31-60
    { minDays: 61, multiplier: 20 },  // Days 61+ — max
  ],

  // Weekly weigh-in
  weighInBase: 5_000,
  weighInPerPound: 10_000,
  weighInMaxPayout: 75_000,

  // Milestone jackpots
  milestones: [
    { weight: 290, label: 'Down 10', sats: 25_000 },
    { weight: 275, label: 'Halfway', sats: 50_000 },
    { weight: 260, label: 'Almost There', sats: 75_000 },
    { weight: 250, label: 'GOAL WEIGHT', sats: 150_000 },
  ] as Milestone[],
};

export type HabitType = 'steps' | 'workout' | 'calories';

export const HABITS: { type: HabitType; label: string; icon: string; description: string; color: string; inputType: 'number' | 'boolean'; unit: string; threshold: number; thresholdDir: 'gte' | 'lte' }[] = [
  { type: 'steps', label: 'Steps', icon: '👟', description: 'Hit 8,000 steps', color: '#22c55e', inputType: 'number', unit: 'steps', threshold: 8000, thresholdDir: 'gte' },
  { type: 'workout', label: 'Workout', icon: '💪', description: '30+ min exercise', color: '#f7931a', inputType: 'boolean', unit: '', threshold: 1, thresholdDir: 'gte' },
  { type: 'calories', label: 'Calories', icon: '🍽', description: `Under ${CONFIG.calorieTarget.toLocaleString()} cal`, color: '#a855f7', inputType: 'number', unit: 'cal', threshold: CONFIG.calorieTarget, thresholdDir: 'lte' },
];

export interface Milestone {
  weight: number;
  label: string;
  sats: number;
}

export interface DayLog {
  date: string;
  steps: number;      // actual step count (0 = not logged)
  workout: number;     // 1 = did it, 0 = didn't
  calories: number;    // actual calorie count (0 = not logged)
}

// Check if a habit value meets the threshold
export function habitMet(type: HabitType, value: number): boolean {
  const habit = HABITS.find((h) => h.type === type)!;
  if (habit.thresholdDir === 'gte') return value >= habit.threshold;
  return value <= habit.threshold && value > 0; // lte but must have logged something
}

export interface WeighIn {
  id?: number;
  weekNumber: number;
  date: string;
  weight: number;
  previousWeight: number;
  change: number;
  satsEarned: number;
  milestonesHit: string[];
}

export interface HabitStreak {
  type: HabitType;
  currentStreak: number;
  multiplier: number;
  satsPerCompletion: number;
  longestStreak: number;
}

export interface PlayerStats {
  totalSatsEarned: number;
  currentWeight: number;
  totalLost: number;
  streaks: HabitStreak[];
  totalDaysLogged: number;
  weighInsLogged: number;
  milestonesHit: string[];
}

// ── STREAK MATH ──

export function getMultiplier(streakDays: number): number {
  let mult = 1;
  for (const tier of CONFIG.streakTiers) {
    if (streakDays >= tier.minDays) mult = tier.multiplier;
  }
  return mult;
}

export function getSatsForHabit(streakDays: number): number {
  return CONFIG.baseSatsPerHabit * getMultiplier(streakDays);
}

export function getNextTier(streakDays: number): { daysUntil: number; nextMultiplier: number } | null {
  for (const tier of CONFIG.streakTiers) {
    if (streakDays < tier.minDays) {
      return { daysUntil: tier.minDays - streakDays, nextMultiplier: tier.multiplier };
    }
  }
  return null; // Already at max
}

// ── DATE HELPERS ──

export function getDayNumber(date?: string): number {
  const start = new Date(CONFIG.startDate);
  const now = date ? new Date(date) : new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

export function getWeekNumber(date?: string): number {
  return Math.ceil(getDayNumber(date) / 7);
}

export function getDateForDay(dayNumber: number): string {
  const start = new Date(CONFIG.startDate);
  start.setDate(start.getDate() + dayNumber - 1);
  return start.toISOString().split('T')[0];
}

export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── WEIGH-IN CALC ──

export function calculateWeighInReward(currentWeight: number, previousWeight: number): {
  baseSats: number;
  bonusSats: number;
  totalSats: number;
  poundsLost: number;
} {
  const poundsLost = Math.max(0, previousWeight - currentWeight);
  const baseSats = currentWeight <= previousWeight ? CONFIG.weighInBase : 0;
  const bonusSats = Math.round(poundsLost * CONFIG.weighInPerPound);
  const totalSats = Math.min(baseSats + bonusSats, CONFIG.weighInMaxPayout);
  return { baseSats, bonusSats, totalSats, poundsLost };
}

export function checkMilestones(weight: number, alreadyHit: string[]): Milestone[] {
  return CONFIG.milestones.filter((m) => weight <= m.weight && !alreadyHit.includes(m.label));
}

export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

export function satsToUsd(sats: number, btcPrice: number = 70000): string {
  return ((sats / 100_000_000) * btcPrice).toFixed(2);
}
