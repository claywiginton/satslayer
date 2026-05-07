// ── PROOF OF WORK — STREAK MULTIPLIER ENGINE ──

export type WeightUnit = 'kg' | 'lbs';

export const CONFIG = {
  playerName: 'Eddy',
  startWeight: 129,       // kg
  goalWeight: 99,          // kg
  defaultUnit: 'kg' as WeightUnit,
  calorieTarget: 2500,
  startDate: '2026-04-01',
  totalWeeks: 50, // Apr 1, 2026 - Mar 18, 2027
  totalSats: 2_000_000,

  // Cheat day rules: 0 cheat days for first 30 days, then 1 every 30 days
  cheatDayLockoutDays: 30,
  cheatDayFrequency: 30,
  cheatDayCalorieMax: 3500, // Max calories on a cheat day (above this = streak breaks)

  // Base sats per habit (before multiplier)
  baseSatsPerHabit: 50,

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

  // Weekly weigh-in — flat payout if lost at least 0.2 kg
  weighInPayout: 7_200,
  weighInMinLoss: 0.2,


  // Milestone jackpots (in kg)
  milestones: [
    { weight: 122, label: 'Down 7kg', sats: 25_000 },
    { weight: 115, label: 'Under 115', sats: 50_000 },
    { weight: 107, label: 'Under 107', sats: 75_000 },
    { weight: 99, label: 'GOAL WEIGHT', sats: 150_000 },
  ] as Milestone[],
};

// Unit conversion helpers
export function kgToLbs(kg: number): number { return Math.round(kg * 2.20462 * 10) / 10; }
export function lbsToKg(lbs: number): number { return Math.round(lbs / 2.20462 * 10) / 10; }
export function formatWeight(value: number, unit: WeightUnit): string {
  if (unit === 'lbs') return `${kgToLbs(value)} lbs`;
  return `${value} kg`;
}

export type HabitType = 'steps' | 'workout' | 'calories' | 'sugar';
export type StreakMode = 'daily' | 'weekly'; // daily = every day, weekly = X per calendar week

export const HABITS: { type: HabitType; label: string; icon: string; description: string; color: string; inputType: 'number' | 'boolean'; unit: string; threshold: number; thresholdDir: 'gte' | 'lte'; streakMode: StreakMode; weeklyTarget?: number }[] = [
  { type: 'steps', label: 'Steps', icon: '👟', description: 'Hit 8,000 steps', color: '#22c55e', inputType: 'number', unit: 'steps', threshold: 8000, thresholdDir: 'gte', streakMode: 'daily' },
  { type: 'workout', label: 'Exercise', icon: '💪', description: '30+ min · 3× per week', color: '#f7931a', inputType: 'boolean', unit: '', threshold: 1, thresholdDir: 'gte', streakMode: 'weekly', weeklyTarget: 3 },
  { type: 'calories', label: 'Calories', icon: '🍽', description: `Under ${CONFIG.calorieTarget.toLocaleString()} cal`, color: '#a855f7', inputType: 'number', unit: 'cal', threshold: CONFIG.calorieTarget, thresholdDir: 'lte', streakMode: 'daily' },
  { type: 'sugar', label: 'No Sugar', icon: '🚫', description: 'No sugar today', color: '#ef4444', inputType: 'boolean', unit: '', threshold: 1, thresholdDir: 'gte', streakMode: 'daily' },
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
  sugar: number;       // 1 = no sugar, 0 = not logged
}

// Check if a habit value meets the threshold
export function habitMet(type: HabitType, value: number): boolean {
  const habit = HABITS.find((h) => h.type === type)!;
  if (habit.thresholdDir === 'gte') return value >= habit.threshold;
  return value <= habit.threshold && value > 0; // lte but must have logged something
}

// Check calorie status: normal, cheat day, or fail
export type CalorieStatus = 'normal' | 'cheat' | 'fail' | 'not_logged';
export function getCalorieStatus(calories: number): CalorieStatus {
  if (calories <= 0) return 'not_logged';
  if (calories <= CONFIG.calorieTarget) return 'normal';
  if (calories <= CONFIG.cheatDayCalorieMax) return 'cheat';
  return 'fail';
}

// Check if calories count as "met" considering cheat days
// For streak purposes: normal = met, cheat = met (if cheat day available), fail = not met
export function caloriesMet(calories: number, cheatDayAvailable: boolean): boolean {
  const status = getCalorieStatus(calories);
  if (status === 'normal') return true;
  if (status === 'cheat' && cheatDayAvailable) return true;
  return false;
}

// ── CHEAT DAY LOGIC ──

export function getCheatDayInfo(dayNumber: number, usedCheatDays: number): {
  available: boolean;
  totalEarned: number;
  totalUsed: number;
  nextCheatDay: number;
  inLockout: boolean;
} {
  const { cheatDayLockoutDays, cheatDayFrequency } = CONFIG;

  if (dayNumber <= cheatDayLockoutDays) {
    return { available: false, totalEarned: 0, totalUsed: usedCheatDays, nextCheatDay: cheatDayLockoutDays + 1, inLockout: true };
  }

  // After lockout: first cheat day available immediately, then 1 more every cheatDayFrequency days
  const daysAfterLockout = dayNumber - cheatDayLockoutDays;
  const totalEarned = 1 + Math.floor((daysAfterLockout - 1) / cheatDayFrequency);
  const available = totalEarned > usedCheatDays;
  const nextEarnDay = cheatDayLockoutDays + 1 + (totalEarned * cheatDayFrequency);

  return { available, totalEarned, totalUsed: usedCheatDays, nextCheatDay: nextEarnDay, inLockout: false };
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

export function getDayNumber(date?: string, customStartDate?: string): number {
  // Parse both dates as local date components to avoid UTC timezone skew
  const startStr = customStartDate || CONFIG.startDate;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const startMs = new Date(sy, sm - 1, sd).getTime();

  let nowMs: number;
  if (date) {
    const [ny, nm, nd] = date.split('-').map(Number);
    nowMs = new Date(ny, nm - 1, nd).getTime();
  } else {
    // Get today in Germany as a clean date (no time component)
    const todayStr = getTodayStr();
    const [ny, nm, nd] = todayStr.split('-').map(Number);
    nowMs = new Date(ny, nm - 1, nd).getTime();
  }

  const diff = Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

export function getWeekNumber(date?: string, customStartDate?: string): number {
  return Math.ceil(getDayNumber(date, customStartDate) / 7);
}

export function getDateForDay(dayNumber: number): string {
  const [sy, sm, sd] = CONFIG.startDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  start.setDate(start.getDate() + dayNumber - 1);
  const mm = String(start.getMonth() + 1).padStart(2, '0');
  const dd = String(start.getDate()).padStart(2, '0');
  return `${start.getFullYear()}-${mm}-${dd}`;
}

export function getTodayStr(): string {
  // Use Germany timezone for day boundaries — robust across all browsers
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

// ── WEIGH-IN CALC ──

// Max weight loss allowed per week (anything beyond is capped — prevents accidental huge payouts)
export function calculateWeighInReward(currentWeight: number, previousWeight: number): {
  totalSats: number;
  qualified: boolean;
  weightLost: number;
} {
  const weightLost = Math.round((previousWeight - currentWeight) * 10) / 10;
  // Qualified if lost any weight OR maintained (only 0 if gained)
  const qualified = currentWeight <= previousWeight;
  const totalSats = qualified ? CONFIG.weighInPayout : 0;
  return { totalSats, qualified, weightLost };
}

export function checkMilestones(weight: number, alreadyHit: string[]): Milestone[] {
  // Must hit the milestone weight on the dot — floor to whole kg
  const wholeWeight = Math.floor(weight);
  return CONFIG.milestones.filter((m) => wholeWeight <= m.weight && !alreadyHit.includes(m.label));
}

export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

export function satsToUsd(sats: number, btcPrice: number = 70000): string {
  return ((sats / 100_000_000) * btcPrice).toFixed(2);
}
