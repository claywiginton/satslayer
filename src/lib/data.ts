// ── SATSLAYER CORE DATA ──

export const CONFIG = {
  playerName: 'Eddy',
  startWeight: 300,
  goalWeight: 250,
  totalSats: 2_000_000,
  totalWeeks: 52,
  startDate: '2026-04-01', // Adjust to actual start

  // Reward structure
  dailySatsBase: 3_300, // per daily challenge completed
  weeklyWeighInBase: 5_000, // just for logging weight
  weeklyPerPoundLost: 5_000, // bonus per lb lost
  maxWeeklyBonus: 50_000, // cap weekly payout

  // Milestone bonuses
  milestones: [
    { weight: 290, label: 'First 10 Down', sats: 25_000 },
    { weight: 275, label: 'Halfway There', sats: 50_000 },
    { weight: 260, label: 'Almost There', sats: 75_000 },
    { weight: 250, label: 'GOAL WEIGHT', sats: 100_000 },
  ] as Milestone[],
};

export interface Milestone {
  weight: number;
  label: string;
  sats: number;
}

export type ChallengeCategory = 'workout' | 'steps' | 'nutrition' | 'recovery';

export interface DailyChallenge {
  id: string;
  day: number; // day of the year (1-365)
  date: string;
  category: ChallengeCategory;
  title: string;
  description: string;
  sats: number;
  completed: boolean;
  completedAt?: string;
}

export interface WeighIn {
  id?: number;
  weekNumber: number;
  date: string;
  weight: number;
  photoUrl?: string;
  previousWeight: number;
  change: number;
  satsEarned: number;
  milestonesHit: string[];
}

export interface PlayerStats {
  totalSatsEarned: number;
  totalSatsAvailable: number;
  currentWeight: number;
  startWeight: number;
  goalWeight: number;
  totalLost: number;
  currentStreak: number;
  longestStreak: number;
  challengesCompleted: number;
  challengesTotal: number;
  weighInsLogged: number;
  milestonesHit: string[];
  comebackPool: number;
}

// ── CHALLENGE GENERATOR ──

const workoutChallenges = [
  { title: '30 Min Walk', description: 'Walk for 30 minutes — outside or treadmill, just move' },
  { title: 'Bodyweight Circuit', description: '3 rounds: 10 push-ups, 15 squats, 10 lunges, 30s plank' },
  { title: '20 Min HIIT', description: '30s on / 30s off — jumping jacks, burpees, mountain climbers, high knees' },
  { title: 'Dumbbell Full Body', description: 'Goblet squats, DB rows, DB press, DB curls — 3×12 each' },
  { title: 'Stair Climber', description: '20 minutes on the stair climber or walk stairs for 20 min' },
  { title: 'Swimming / Pool', description: '30 minutes of swimming or pool exercises' },
  { title: 'Bike Ride', description: '30+ minutes on a bike — stationary or outdoor' },
];

const stepsChallenges = [
  { title: '8,000 Steps', description: 'Hit 8,000 steps today — check your phone' },
  { title: '10,000 Steps', description: 'The classic — 10,000 steps. Walk during lunch, after dinner' },
  { title: '12,000 Steps', description: 'Push it — 12,000 steps. Take the long route everywhere' },
  { title: '6,000 Steps + Stairs', description: '6,000 steps plus take the stairs every chance you get' },
  { title: 'Walking Meeting', description: 'Take at least one call or meeting while walking. Plus hit 8k steps' },
];

const nutritionChallenges = [
  { title: 'No Sugar', description: 'Zero added sugar today — read labels, skip dessert, no soda' },
  { title: 'Protein Goal', description: 'Hit 150g+ protein today — chicken, fish, eggs, protein shake' },
  { title: 'Gallon of Water', description: 'Drink a full gallon of water today. Fill it up in the morning' },
  { title: 'No Eating After 8pm', description: 'Kitchen closes at 8pm. Dinner done, no snacking' },
  { title: 'Meal Prep Day', description: 'Prep at least 3 healthy meals for the week' },
  { title: 'Veggie Load', description: 'Eat vegetables with every meal today — breakfast included' },
  { title: 'Calorie Track', description: 'Log every single thing you eat today in an app. Full accountability' },
];

const recoveryChallenges = [
  { title: '15 Min Stretch', description: 'Full body stretching routine — hamstrings, hips, shoulders, back' },
  { title: 'Yoga Session', description: '20+ min yoga — YouTube is fine, just follow along and breathe' },
  { title: 'Foam Roll', description: '15 minutes of foam rolling — legs, back, glutes' },
  { title: 'Cold Shower Finish', description: 'End your shower with 60 seconds of cold water. Wake up' },
  { title: 'Sleep by 10pm', description: 'In bed, lights out, phone down by 10pm tonight' },
  { title: 'No Phone Walk', description: '20 min walk with zero phone. Just you and your thoughts' },
];

const challengesByCategory: Record<ChallengeCategory, { title: string; description: string }[]> = {
  workout: workoutChallenges,
  steps: stepsChallenges,
  nutrition: nutritionChallenges,
  recovery: recoveryChallenges,
};

const categoryRotation: ChallengeCategory[] = ['workout', 'steps', 'nutrition', 'recovery'];
const categoryIcons: Record<ChallengeCategory, string> = {
  workout: '💪',
  steps: '👟',
  nutrition: '🥗',
  recovery: '🧘',
};
const categoryColors: Record<ChallengeCategory, string> = {
  workout: 'var(--btc)',
  steps: 'var(--green)',
  nutrition: 'var(--purple)',
  recovery: 'var(--btc-light)',
};

export { categoryIcons, categoryColors };

// Deterministic challenge for a given day number
export function getChallengeForDay(dayNumber: number): Omit<DailyChallenge, 'id' | 'completed' | 'completedAt'> {
  const category = categoryRotation[(dayNumber - 1) % 4];
  const options = challengesByCategory[category];
  const pick = options[(dayNumber - 1) % options.length];
  const startDate = new Date(CONFIG.startDate);
  startDate.setDate(startDate.getDate() + dayNumber - 1);

  return {
    day: dayNumber,
    date: startDate.toISOString().split('T')[0],
    category,
    title: pick.title,
    description: pick.description,
    sats: CONFIG.dailySatsBase,
  };
}

// Calculate what day number it is
export function getCurrentDayNumber(): number {
  const start = new Date(CONFIG.startDate);
  const now = new Date();
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.min(diff + 1, 365));
}

// Calculate what week it is
export function getCurrentWeekNumber(): number {
  return Math.ceil(getCurrentDayNumber() / 7);
}

// Calculate weigh-in reward
export function calculateWeighInReward(currentWeight: number, previousWeight: number): {
  baseSats: number;
  bonusSats: number;
  totalSats: number;
  poundsLost: number;
} {
  const poundsLost = Math.max(0, previousWeight - currentWeight);
  const baseSats = CONFIG.weeklyWeighInBase;
  const bonusSats = Math.round(poundsLost * CONFIG.weeklyPerPoundLost);
  const totalSats = Math.min(baseSats + bonusSats, CONFIG.maxWeeklyBonus);

  return { baseSats, bonusSats, totalSats, poundsLost };
}

// Check milestones
export function checkMilestones(weight: number, alreadyHit: string[]): Milestone[] {
  return CONFIG.milestones.filter(
    (m) => weight <= m.weight && !alreadyHit.includes(m.label)
  );
}

// Format sats with comma separators
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

// Approximate USD value
export function satsToUsd(sats: number, btcPrice: number = 70000): string {
  const usd = (sats / 100_000_000) * btcPrice;
  return usd.toFixed(2);
}
