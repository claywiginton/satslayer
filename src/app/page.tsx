'use client';

import { useState, useEffect } from 'react';
import {
  CONFIG, HABITS, formatSats, satsToUsd, getMultiplier, getSatsForHabit, getNextTier,
  getDayNumber, getWeekNumber, getTodayStr, calculateWeighInReward,
  type HabitType, type HabitStreak, type PlayerStats, type WeighIn, type DayLog, type WeightUnit,
  habitMet, kgToLbs, lbsToKg, formatWeight,
} from '@/lib/data';
import {
  getDayLogs, getTodayLog, saveHabitValue, logSats, calculateStreaks,
  getWeighIns, saveWeighIn, getPlayerStats,
  getPlayerProfile, savePlayerProfile, type PlayerProfile,
} from '@/lib/db';
import Onboarding from '@/components/Onboarding';

export default function SatSlayer() {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [profileExists, setProfileExists] = useState(false); // someone already onboarded
  const [tab, setTab] = useState<'today' | 'weigh-in' | 'stats'>('today');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [todayLog, setTodayLog] = useState<DayLog | null>(null);
  const [dayLogs, setDayLogs] = useState<DayLog[]>([]);
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<HabitType | null>(null);
  const [showReward, setShowReward] = useState<{ sats: number; habit: string } | null>(null);
  const [wiWeight, setWiWeight] = useState('');
  const [wiSaving, setWiSaving] = useState(false);
  const [wiResult, setWiResult] = useState<{ sats: number; milestones: string[] } | null>(null);
  const [habitInputs, setHabitInputs] = useState<Record<HabitType, string>>({ steps: '', workout: '', calories: '' });
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(CONFIG.defaultUnit);

  // Display weight in user's chosen unit (DB stores kg)
  const dw = (kg: number) => {
    const val = weightUnit === 'lbs' ? kgToLbs(kg) : kg;
    return `${Math.round(val * 10) / 10}`;
  };
  const wu = weightUnit; // shorthand for unit label

  // Check if player has completed onboarding
  useEffect(() => {
    getPlayerProfile().then((p) => {
      setProfile(p);
      setProfileExists(!!p);
      setProfileChecked(true);
    }).catch(() => setProfileChecked(true));
  }, []);

  // Load app data once profile exists
  useEffect(() => {
    if (!profile) return;
    Promise.all([getPlayerStats(), getTodayLog(), getDayLogs(), getWeighIns()])
      .then(([s, t, d, w]) => { setStats(s); setTodayLog(t); setDayLogs(d); setWeighIns(w); setLoading(false); })
      .catch(() => {
        setStats({ totalSatsEarned: 0, currentWeight: profile.startWeight, totalLost: 0, streaks: HABITS.map((h) => ({ type: h.type, currentStreak: 0, multiplier: 1, satsPerCompletion: 500, longestStreak: 0 })), totalDaysLogged: 0, weighInsLogged: 0, milestonesHit: [] });
        setLoading(false);
      });
  }, [profile]);

  const handleOnboardingComplete = async (username: string, startWeight: number) => {
    console.log('handleOnboardingComplete called:', username, startWeight);
    const saved = await savePlayerProfile(username, startWeight, CONFIG.goalWeight);
    console.log('Profile save result:', saved);
    if (saved) {
      const newProfile = {
        strikeUsername: username,
        startWeight,
        goalWeight: CONFIG.goalWeight,
        startDate: getTodayStr(),
        createdAt: new Date().toISOString(),
      };
      console.log('Setting profile:', newProfile);
      setProfile(newProfile);
    } else {
      throw new Error('Failed to save profile — check browser console for details');
    }
  };

  // Show loading while checking profile
  if (!profileChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center relative z-10">
        <div className="w-10 h-10 border-2 border-[var(--border)] border-t-[var(--btc)] rounded-full animate-spin" />
      </div>
    );
  }

  // Show onboarding if no profile (or show claimed state for strangers)
  if (!profile) {
    return <Onboarding
      onComplete={handleOnboardingComplete}
      claimed={profileExists}
      onReset={() => {
        setProfile(null);
        setProfileExists(false);
      }}
    />;
  }

  // Show loading while fetching data
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative z-10">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[var(--border)] border-t-[var(--btc)] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[var(--text-muted)]">Loading bounties...</p>
        </div>
      </div>
    );
  }

  const dayNumber = getDayNumber();
  const weekNumber = getWeekNumber();
  const lastWeight = profile ? (weighIns.length > 0 ? weighIns[weighIns.length - 1].weight : profile.startWeight) : CONFIG.startWeight;
  const alreadyWeighed = weighIns.some((w) => w.weekNumber === weekNumber);

  const handleSubmitHabit = async (habit: HabitType) => {
    if (toggling) return;
    const alreadyDone = todayLog ? habitMet(habit, todayLog[habit]) : false;
    if (alreadyDone) return;

    // Get the value to save
    let value: number;
    if (habit === 'workout') {
      value = 1;
    } else {
      value = parseFloat(habitInputs[habit]);
      if (isNaN(value) || value <= 0) return;
      if (!habitMet(habit, value)) return; // doesn't meet threshold
    }

    setToggling(habit);
    const ok = await saveHabitValue(habit, value);
    console.log('saveHabitValue result:', ok, 'habit:', habit, 'value:', value);
    if (ok) {
      const updatedLog: DayLog = {
        date: getTodayStr(),
        steps: habit === 'steps' ? value : (todayLog?.steps || 0),
        workout: habit === 'workout' ? value : (todayLog?.workout || 0),
        calories: habit === 'calories' ? value : (todayLog?.calories || 0),
      };
      const streakData = calculateStreaks([...dayLogs.filter(d => d.date !== getTodayStr()), updatedLog]);
      const sats = getSatsForHabit(streakData[habit].current);
      console.log('Streak data:', habit, streakData[habit], 'sats:', sats);
      await logSats(getTodayStr(), habit, sats);

      fetch('/api/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: profile!.strikeUsername, sats, reason: `${habit} streak day ${streakData[habit].current}` }),
      }).catch(() => {});

      const [s, t, d] = await Promise.all([getPlayerStats(), getTodayLog(), getDayLogs()]);
      setStats(s); setTodayLog(t); setDayLogs(d);
      setShowReward({ sats, habit });
      setTimeout(() => setShowReward(null), 2500);
      setHabitInputs(prev => ({ ...prev, [habit]: '' }));
    }
    setToggling(null);
  };

  const handleWeighIn = async () => {
    if (!wiWeight || wiSaving) return;
    setWiSaving(true);
    // Convert input to kg if user is entering in lbs
    const inputVal = parseFloat(wiWeight);
    const weightInKg = weightUnit === 'lbs' ? lbsToKg(inputVal) : inputVal;
    const result = await saveWeighIn(weekNumber, weightInKg, lastWeight);
    if (result.success) {
      setWiResult({ sats: result.satsEarned, milestones: result.milestonesHit });

      if (result.satsEarned > 0) {
        fetch('/api/payout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: profile.strikeUsername, sats: result.satsEarned, reason: `Week ${weekNumber} weigh-in` }),
        }).catch(() => {});
      }

      const [s, w] = await Promise.all([getPlayerStats(), getWeighIns()]);
      setStats(s); setWeighIns(w);
    }
    setWiSaving(false);
  };

  const streaks = stats?.streaks || [];
  const totalDailyPotential = streaks.reduce((sum, s) => sum + s.satsPerCompletion, 0);
  const weightPct = stats ? Math.min(((profile.startWeight - stats.currentWeight) / (profile.startWeight - profile.goalWeight)) * 100, 100) : 0;

  return (
    <div className="min-h-screen relative z-10 pb-20">
      {/* Sat reward popup */}
      {showReward && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] sat-pop">
          <div className="bg-[var(--btc)] text-black px-6 py-3 rounded-2xl shadow-2xl text-center">
            <div className="text-2xl font-bold display">+{formatSats(showReward.sats)} SATS</div>
            <div className="text-xs opacity-70">{showReward.habit} · ≈${satsToUsd(showReward.sats)}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--btc)] flex items-center justify-center text-black text-sm font-bold">₿</div>
            <div>
              <div className="text-base display">SATSLAYER</div>
              <div className="text-[9px] text-[var(--text-muted)] tracking-widest uppercase -mt-0.5">{profile.strikeUsername}&apos;s Bounty</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="mono text-sm text-[var(--btc)]">{formatSats(stats?.totalSatsEarned || 0)}</div>
            <button
              onClick={() => setWeightUnit(weightUnit === 'kg' ? 'lbs' : 'kg')}
              className="text-[9px] mono px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-muted)] active:scale-95 transition-all"
            >
              {weightUnit.toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {tab === 'today' && (
          <div className="space-y-4 animate-in">
            {/* Progress overview */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Today&apos;s potential</div>
                  <div className="mono text-sm text-[var(--btc)]">{formatSats(totalDailyPotential)} sats</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Day {dayNumber}</div>
                  <div className="mono text-sm text-[var(--text-secondary)]">Week {weekNumber}</div>
                </div>
              </div>

              {/* Three habit cards */}
              <div className="space-y-2">
                {HABITS.map((habit) => {
                  const streak = streaks.find((s) => s.type === habit.type);
                  const todayVal = todayLog ? todayLog[habit.type] : 0;
                  const completed = habitMet(habit.type, todayVal);
                  const isToggling = toggling === habit.type;
                  const nextTier = streak ? getNextTier(streak.currentStreak) : null;
                  const inputVal = habitInputs[habit.type];
                  const meetsThreshold = habit.inputType === 'boolean' || (inputVal && habitMet(habit.type, parseFloat(inputVal)));

                  // Weekly workout counter
                  const isWeekly = habit.streakMode === 'weekly';
                  let weeklyCount = 0;
                  if (isWeekly) {
                    const now = new Date();
                    const dayOfWeek = now.getDay();
                    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                    const monday = new Date(now);
                    monday.setDate(now.getDate() + mondayOffset);
                    const mondayStr = monday.toISOString().split('T')[0];
                    weeklyCount = dayLogs.filter(d => d.date >= mondayStr && habitMet(habit.type, d[habit.type])).length;
                  }

                  // For weekly habits, "completed today" means logged today. But streak is weekly.
                  const streakLabel = isWeekly
                    ? (streak && streak.currentStreak > 0 ? `${Math.floor(streak.currentStreak / 7)}w · ${streak.multiplier}×` : '')
                    : (streak && streak.currentStreak > 0 ? `${streak.currentStreak}d · ${streak.multiplier}×` : '');

                  return (
                    <div
                      key={habit.type}
                      className={`rounded-xl p-3.5 transition-all ${completed ? 'opacity-60' : ''}`}
                      style={{
                        background: completed ? 'var(--bg-elevated)' : 'var(--bg)',
                        border: completed ? '1px solid var(--border)' : `1px solid ${habit.color}30`,
                      }}
                    >
                      {/* Top row: icon, label, streak, sats */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{ background: `${habit.color}15` }}>
                          {completed ? '✅' : habit.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{habit.label}</span>
                            {streakLabel && (
                              <span className="text-[9px] mono px-1.5 py-0.5 rounded" style={{ background: `${habit.color}20`, color: habit.color }}>
                                {streakLabel}
                              </span>
                            )}
                            {isWeekly && (
                              <span className="text-[9px] mono px-1.5 py-0.5 rounded" style={{ background: weeklyCount >= (habit.weeklyTarget || 5) ? 'rgba(34,197,94,0.2)' : 'var(--bg-elevated)', color: weeklyCount >= (habit.weeklyTarget || 5) ? 'var(--green)' : 'var(--text-muted)' }}>
                                {weeklyCount}/{habit.weeklyTarget}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">{habit.description}</div>
                        </div>
                        <div className="text-right shrink-0">
                          {completed ? (
                            <div>
                              <div className="mono text-sm text-[var(--green)]">✓</div>
                              <div className="text-[9px] text-[var(--text-muted)] mono">
                                {habit.type === 'steps' ? `${todayVal.toLocaleString()} steps` : habit.type === 'calories' ? `${todayVal.toLocaleString()} cal` : 'Done'}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="mono text-sm text-[var(--btc)]">+{formatSats(streak?.satsPerCompletion || 500)}</div>
                              {nextTier && <div className="text-[9px] text-[var(--text-muted)]">{nextTier.nextMultiplier}× in {nextTier.daysUntil}d</div>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Input row — only show if not completed */}
                      {!completed && (
                        <div className="mt-3 flex items-center gap-2">
                          {habit.inputType === 'number' ? (
                            <>
                              <input
                                type="number"
                                inputMode="numeric"
                                placeholder={habit.type === 'steps' ? '10000' : '1800'}
                                value={inputVal}
                                onChange={(e) => setHabitInputs(prev => ({ ...prev, [habit.type]: e.target.value }))}
                                className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm mono text-center focus:outline-none focus:border-[var(--btc)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <span className="text-[11px] text-[var(--text-muted)] w-10">{habit.unit}</span>
                              <button
                                onClick={() => handleSubmitHabit(habit.type)}
                                disabled={!meetsThreshold || isToggling}
                                className={`px-4 py-2.5 rounded-lg text-sm font-bold display tracking-wider transition-all active:scale-95 ${
                                  meetsThreshold ? 'bg-[var(--btc)] text-black' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border)]'
                                } disabled:opacity-40`}
                              >
                                {isToggling ? '...' : 'LOG'}
                              </button>
                            </>
                          ) : (
                            /* Workout: just a yes button */
                            <button
                              onClick={() => handleSubmitHabit(habit.type)}
                              disabled={isToggling}
                              className="w-full py-2.5 rounded-lg text-sm font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all disabled:opacity-40"
                            >
                              {isToggling ? 'LOGGING...' : 'YES — I WORKED OUT'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Threshold hint for number inputs */}
                      {!completed && habit.inputType === 'number' && inputVal && !meetsThreshold && (
                        <div className="mt-1.5 text-[10px] text-[var(--red)] ml-[52px]">
                          {habit.thresholdDir === 'gte'
                            ? `Need at least ${habit.threshold.toLocaleString()} ${habit.unit}`
                            : `Must be under ${habit.threshold.toLocaleString()} ${habit.unit}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Streak danger */}
            {streaks.some((s) => s.currentStreak >= 4) && (
              <div className="card p-4" style={{ borderColor: 'var(--red)30' }}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--red)] mb-2">Don&apos;t break the chain</div>
                <div className="space-y-1.5">
                  {streaks.filter((s) => s.currentStreak >= 4).map((s) => {
                    const habitInfo = HABITS.find((h) => h.type === s.type)!;
                    const loss = s.satsPerCompletion - CONFIG.baseSatsPerHabit;
                    return (
                      <div key={s.type} className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)]">{habitInfo.icon} {habitInfo.label}: {habitInfo.streakMode === 'weekly' ? `${Math.floor(s.currentStreak / 7)} weeks` : `${s.currentStreak} days`}</span>
                        <span className="mono text-[var(--red)]">−{formatSats(loss)}/day if broken</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="card p-3 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Weight</div>
                <div className="mono text-lg">{stats?.currentWeight || profile.startWeight}</div>
                {stats && stats.totalLost > 0 && <div className="text-[10px] text-[var(--green)]">↓{dw(stats.totalLost)}</div>}
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Days</div>
                <div className="mono text-lg">{stats?.totalDaysLogged || 0}</div>
                <div className="text-[10px] text-[var(--text-muted)]">logged</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Earned</div>
                <div className="mono text-lg text-[var(--btc)]">${satsToUsd(stats?.totalSatsEarned || 0)}</div>
                <div className="text-[10px] text-[var(--text-muted)]">USD</div>
              </div>
            </div>

            {/* Multiplier tiers */}
            <div className="card p-4">
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3">Streak multiplier tiers</div>
              <div className="space-y-1">
                {CONFIG.streakTiers.map((tier, i) => {
                  const next = CONFIG.streakTiers[i + 1];
                  const range = next ? `${tier.minDays}-${next.minDays - 1}` : `${tier.minDays}+`;
                  const maxStreak = Math.max(...streaks.map((s) => s.currentStreak), 0);
                  const isActive = maxStreak >= tier.minDays && (!next || maxStreak < next.minDays);
                  return (
                    <div key={tier.minDays} className={`flex items-center justify-between py-1.5 px-2.5 rounded-lg text-xs`}
                      style={isActive ? { background: 'var(--btc)10', border: '1px solid var(--btc)30' } : {}}>
                      <span className={isActive ? 'text-[var(--btc)] font-semibold' : 'text-[var(--text-secondary)]'}>
                        {isActive && '▸ '}Days {range}
                      </span>
                      <span className="mono" style={{ color: isActive ? 'var(--btc)' : 'var(--text-muted)' }}>
                        {tier.multiplier}× = {formatSats(tier.multiplier * CONFIG.baseSatsPerHabit)}/habit
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'weigh-in' && (
          <div className="space-y-4 animate-in">
            <div className="text-center pt-2 pb-1">
              <div className="text-3xl mb-2">⚖️</div>
              <h2 className="display text-2xl">WEEK {weekNumber} WEIGH-IN</h2>
            </div>

            {alreadyWeighed && !wiResult ? (
              <div className="card p-6 text-center">
                <div className="text-2xl mb-2">✅</div>
                <div className="display text-lg text-[var(--green)]">LOGGED THIS WEEK</div>
                <p className="text-xs text-[var(--text-muted)] mt-2">Next weigh-in: Week {weekNumber + 1}</p>
              </div>
            ) : wiResult ? (
              <div className="card p-6 text-center">
                <div className="text-3xl mb-3">🎉</div>
                <div className="display text-xl text-[var(--btc)] mb-1">+{formatSats(wiResult.sats)} SATS</div>
                <div className="text-xs text-[var(--text-muted)]">≈${satsToUsd(wiResult.sats)}</div>
                {wiResult.milestones.map((m) => (
                  <div key={m} className="mt-3 bg-[var(--btc)] text-black rounded-xl px-4 py-2 text-sm font-bold display">🏆 {m}</div>
                ))}
              </div>
            ) : (
              <>
                <div className="card p-4">
                  <div className="flex justify-between mb-3">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Last</div>
                      <div className="mono text-xl">{dw(lastWeight)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Lost</div>
                      <div className="mono text-xl text-[var(--green)]">{dw(Math.max(profile.startWeight - lastWeight, 0))}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Goal</div>
                      <div className="mono text-xl">{dw(profile.goalWeight)}</div>
                    </div>
                  </div>

                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-2">Today&apos;s weight ({wu})</label>
                  <input type="number" inputMode="decimal" step="0.1" placeholder={dw(lastWeight)} value={wiWeight} onChange={(e) => setWiWeight(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-xl mono text-center focus:outline-none focus:border-[var(--btc)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />

                  {wiWeight && (() => {
                    const inputVal = parseFloat(wiWeight);
                    const inputKg = weightUnit === 'lbs' ? lbsToKg(inputVal) : inputVal;
                    const diff = Math.round(Math.abs(lastWeight - inputKg) * 10) / 10;
                    return (
                    <div className="mt-3 p-3 rounded-lg bg-[var(--bg)]">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Reward preview</div>
                      {inputKg < lastWeight ? (
                        <div>
                          <div className="mono text-lg text-[var(--btc)]">+{formatSats(Math.min(CONFIG.weighInBase + Math.round(diff * CONFIG.weighInPerUnit), CONFIG.weighInMaxPayout))}</div>
                          <div className="text-[10px] text-[var(--green)]">↓{dw(diff)} {wu}</div>
                        </div>
                      ) : inputKg === lastWeight ? (
                        <div><div className="mono text-lg text-[var(--btc)]">+{formatSats(CONFIG.weighInBase)}</div><div className="text-[10px] text-[var(--text-muted)]">Maintained</div></div>
                      ) : (
                        <div><div className="mono text-lg text-[var(--red)]">0 sats</div><div className="text-[10px] text-[var(--red)]">↑{dw(diff)} {wu} — no reward</div></div>
                      )}
                    </div>
                    );
                  })()}

                  <button onClick={handleWeighIn} disabled={!wiWeight || wiSaving}
                    className="w-full mt-3 py-3.5 rounded-xl text-sm font-bold display tracking-wider bg-[var(--btc)] text-black disabled:opacity-30 active:scale-[0.98] transition-all">
                    {wiSaving ? 'SAVING...' : 'LOG WEIGH-IN'}
                  </button>
                </div>

                <div className="card p-4">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Payout structure</div>
                  <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                    <div className="flex justify-between"><span>Log weight</span><span className="mono text-[var(--btc)]">+{formatSats(CONFIG.weighInBase)}</span></div>
                    <div className="flex justify-between"><span>Per {wu} lost</span><span className="mono text-[var(--btc)]">+{formatSats(CONFIG.weighInPerUnit)}</span></div>
                    <div className="flex justify-between"><span>Gained weight</span><span className="mono text-[var(--red)]">0 sats</span></div>
                  </div>
                </div>

                {weighIns.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">History</div>
                    <div className="space-y-1.5">
                      {[...weighIns].reverse().map((wi) => (
                        <div key={wi.weekNumber} className="card p-3 flex items-center justify-between">
                          <div><div className="text-xs font-semibold">Week {wi.weekNumber}</div><div className="text-[10px] text-[var(--text-muted)]">{wi.date}</div></div>
                          <div className="flex items-center gap-3">
                            <div className="text-right"><div className="mono text-sm">{dw(wi.weight)}</div><div className="text-[10px]" style={{ color: wi.change <= 0 ? 'var(--green)' : 'var(--red)' }}>{wi.change <= 0 ? '↓' : '↑'}{dw(Math.abs(wi.change))}</div></div>
                            <div className="mono text-sm text-[var(--btc)]">+{formatSats(wi.satsEarned)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'stats' && stats && (
          <div className="space-y-4 animate-in">
            <div className="card p-5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Total earned</div>
              <div className="mono text-4xl text-[var(--btc)]">{formatSats(stats.totalSatsEarned)}</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">≈${satsToUsd(stats.totalSatsEarned)}</div>
            </div>

            <div className="card p-5">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-3 text-center">Weight journey</div>
              <div className="flex items-baseline justify-center gap-4">
                <div className="text-center"><div className="text-[10px] text-[var(--text-muted)]">Start</div><div className="mono text-lg">{dw(profile.startWeight)}</div></div>
                <div className="text-xl text-[var(--text-muted)]">→</div>
                <div className="text-center"><div className="text-[10px] text-[var(--green)]">Now</div><div className="mono text-2xl text-[var(--green)]">{dw(stats.currentWeight)}</div></div>
                <div className="text-xl text-[var(--text-muted)]">→</div>
                <div className="text-center"><div className="text-[10px] text-[var(--text-muted)]">Goal</div><div className="mono text-lg">{dw(profile.goalWeight)}</div></div>
              </div>
              <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
                <div className="h-full rounded-full" style={{ width: `${Math.max(weightPct, 0)}%`, background: 'linear-gradient(90deg, var(--green-dim), var(--green))' }} />
              </div>
              <div className="mono text-xs text-center text-[var(--text-muted)] mt-1.5">{dw(stats.totalLost)} {wu} lost</div>
            </div>

            <div className="card p-4">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-3">Streak details</div>
              <div className="space-y-3">
                {streaks.map((s) => {
                  const habit = HABITS.find((h) => h.type === s.type)!;
                  return (
                    <div key={s.type} className="flex items-center gap-3">
                      <span className="text-xl">{habit.icon}</span>
                      <div className="flex-1">
                        <div className="text-xs font-semibold">{habit.label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${habit.color}15`, color: habit.color }}>
                            {habit.streakMode === 'weekly' ? `${Math.floor(s.currentStreak / 7)}w` : `${s.currentStreak}d`}
                          </span>
                          <span className="mono text-[10px] text-[var(--btc)]">{s.multiplier}×</span>
                          <span className="text-[10px] text-[var(--text-muted)]">Best: {habit.streakMode === 'weekly' ? `${Math.floor(s.longestStreak / 7)}w` : `${s.longestStreak}d`}</span>
                        </div>
                      </div>
                      <div className="mono text-sm text-[var(--btc)]">{formatSats(s.satsPerCompletion)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-4">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-3">Milestones</div>
              <div className="space-y-1.5">
                {CONFIG.milestones.map((m) => {
                  const hit = stats.milestonesHit.includes(m.label);
                  return (
                    <div key={m.label} className={`flex items-center justify-between py-2 px-3 rounded-lg ${hit ? 'opacity-40' : ''}`} style={{ background: 'var(--bg)' }}>
                      <div className="flex items-center gap-2"><span>{hit ? '✅' : '🎯'}</span><div><div className="text-xs font-semibold">{m.label}</div><div className="text-[10px] text-[var(--text-muted)]">{dw(m.weight)} {wu}</div></div></div>
                      <div className="mono text-sm" style={{ color: hit ? 'var(--green)' : 'var(--btc)' }}>{hit ? 'CLAIMED' : `+${formatSats(m.sats)}`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="card p-3.5 text-center"><div className="text-[10px] text-[var(--text-muted)] uppercase">Days logged</div><div className="mono text-xl mt-1">{stats.totalDaysLogged}</div></div>
              <div className="card p-3.5 text-center"><div className="text-[10px] text-[var(--text-muted)] uppercase">Weigh-ins</div><div className="mono text-xl mt-1">{stats.weighInsLogged}<span className="text-sm text-[var(--text-muted)]">/52</span></div></div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)]/95 backdrop-blur-md border-t border-[var(--border)] px-2 pb-[env(safe-area-inset-bottom,4px)] pt-1.5">
        <div className="max-w-lg mx-auto flex justify-around">
          {([
            { id: 'today' as const, label: 'Today', icon: '⚡' },
            { id: 'weigh-in' as const, label: 'Weigh-in', icon: '⚖️' },
            { id: 'stats' as const, label: 'Stats', icon: '🏆' },
          ]).map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setWiResult(null); }}
              className={`flex flex-col items-center py-1.5 px-5 rounded-lg transition-all ${tab === t.id ? 'text-[var(--btc)]' : 'text-[var(--text-muted)]'}`}>
              <span className="text-lg">{t.icon}</span>
              <span className="text-[9px] mt-0.5 font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
