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
  const [profileExists, setProfileExists] = useState(false);
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

  const dw = (kg: number) => `${Math.round((weightUnit === 'lbs' ? kgToLbs(kg) : kg) * 10) / 10}`;
  const wu = weightUnit;

  useEffect(() => {
    getPlayerProfile().then((p) => { setProfile(p); setProfileExists(!!p); setProfileChecked(true); }).catch(() => setProfileChecked(true));
  }, []);

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
      setProfile({ strikeUsername: username, startWeight, goalWeight: CONFIG.goalWeight, startDate: getTodayStr(), createdAt: new Date().toISOString() });
    } else {
      throw new Error('Failed to save profile — check browser console for details');
    }
  };

  if (!profileChecked) return (
    <div className="min-h-screen flex items-center justify-center relative z-10">
      <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--btc)] rounded-full animate-spin" />
    </div>
  );

  if (!profile) return <Onboarding onComplete={handleOnboardingComplete} claimed={profileExists} onReset={() => { setProfile(null); setProfileExists(false); }} />;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center relative z-10">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--btc)] rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-[var(--text-muted)]">Loading...</p>
      </div>
    </div>
  );

  const dayNumber = getDayNumber();
  const weekNumber = getWeekNumber();
  const lastWeight = profile ? (weighIns.length > 0 ? weighIns[weighIns.length - 1].weight : profile.startWeight) : CONFIG.startWeight;
  const alreadyWeighed = weighIns.some((w) => w.weekNumber === weekNumber);
  const streaks = stats?.streaks || [];
  const totalDailyPotential = streaks.reduce((sum, s) => sum + s.satsPerCompletion, 0);
  const weightPct = stats ? Math.min(((profile.startWeight - stats.currentWeight) / (profile.startWeight - profile.goalWeight)) * 100, 100) : 0;

  const handleSubmitHabit = async (habit: HabitType) => {
    if (toggling) return;
    const alreadyDone = todayLog ? habitMet(habit, todayLog[habit]) : false;
    if (alreadyDone) return;
    let value: number;
    if (habit === 'workout') { value = 1; }
    else { value = parseFloat(habitInputs[habit]); if (isNaN(value) || value <= 0 || !habitMet(habit, value)) return; }
    setToggling(habit);
    const ok = await saveHabitValue(habit, value);
    if (ok) {
      const updatedLog: DayLog = { date: getTodayStr(), steps: habit === 'steps' ? value : (todayLog?.steps || 0), workout: habit === 'workout' ? value : (todayLog?.workout || 0), calories: habit === 'calories' ? value : (todayLog?.calories || 0) };
      const streakData = calculateStreaks([...dayLogs.filter(d => d.date !== getTodayStr()), updatedLog]);
      const sats = getSatsForHabit(streakData[habit].current);
      await logSats(getTodayStr(), habit, sats);
      fetch('/api/payout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: profile!.strikeUsername, sats, reason: `${habit} streak day ${streakData[habit].current}` }) }).catch(() => {});
      const [s, t, d] = await Promise.all([getPlayerStats(), getTodayLog(), getDayLogs()]);
      setStats(s); setTodayLog(t); setDayLogs(d);
      setShowReward({ sats, habit });
      setTimeout(() => setShowReward(null), 2500);
      setHabitInputs(prev => ({ ...prev, [habit]: '' }));

      // Check if all 3 habits are now complete — send Telegram congrats
      if (t) {
        const allDone = HABITS.every(h => habitMet(h.type, t[h.type]));
        if (allDone) {
          const todaySats = s?.totalSatsEarned || 0;
          fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'all_complete', data: { totalSats: sats } }) }).catch(() => {});
        }
      }
    }
    setToggling(null);
  };

  const handleWeighIn = async () => {
    if (!wiWeight || wiSaving) return;
    setWiSaving(true);
    const inputKg = weightUnit === 'lbs' ? lbsToKg(parseFloat(wiWeight)) : parseFloat(wiWeight);
    const result = await saveWeighIn(weekNumber, inputKg, lastWeight);
    if (result.success) {
      setWiResult({ sats: result.satsEarned, milestones: result.milestonesHit });
      if (result.satsEarned > 0) fetch('/api/payout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: profile.strikeUsername, sats: result.satsEarned, reason: `Week ${weekNumber} weigh-in` }) }).catch(() => {});
      const [s, w] = await Promise.all([getPlayerStats(), getWeighIns()]);
      setStats(s); setWeighIns(w);
    }
    setWiSaving(false);
  };

  const todayComplete = HABITS.every(h => todayLog ? habitMet(h.type, todayLog[h.type]) : false);
  const todayCount = HABITS.filter(h => todayLog ? habitMet(h.type, todayLog[h.type]) : false).length;

  return (
    <div className="min-h-screen relative z-10 pb-24">
      {/* Sat reward popup */}
      {showReward && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] sat-pop">
          <div className="px-8 py-4 rounded-2xl text-center" style={{ background: 'linear-gradient(135deg, var(--btc), #e8820e)', boxShadow: '0 8px 32px rgba(247,147,26,0.3)' }}>
            <div className="text-2xl font-bold display text-black">+{formatSats(showReward.sats)}</div>
            <div className="text-xs text-black/60">{showReward.habit}</div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'linear-gradient(135deg, var(--btc), #e8820e)', color: '#000' }}>₿</div>
            <div>
              <div className="text-[15px] display tracking-wider">SATSLAYER</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="mono text-sm text-[var(--btc)]">{formatSats(stats?.totalSatsEarned || 0)}</div>
              <div className="text-[9px] text-[var(--text-muted)] mono">sats earned</div>
            </div>
            <button onClick={() => setWeightUnit(wu === 'kg' ? 'lbs' : 'kg')}
              className="text-[10px] mono px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-hover)] active:scale-95 transition-all">
              {wu.toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-5">

        {/* ── TODAY TAB ── */}
        {tab === 'today' && (
          <div className="animate-in">
            {/* Hero stat */}
            <div className="mb-5">
              <div className="flex items-baseline justify-between mb-1">
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] font-semibold tracking-widest uppercase">Day {dayNumber}</span>
                  <span className="text-[10px] text-[var(--text-muted)] mx-2">·</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-semibold tracking-widest uppercase">Week {weekNumber}</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] font-semibold tracking-widest uppercase">{todayCount}/3 done</span>
              </div>
              {todayComplete && (
                <div className="mt-2 mb-3 py-2.5 px-4 rounded-xl text-center text-sm font-semibold" style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.15)' }}>
                  All habits complete today ✓
                </div>
              )}
            </div>

            {/* Habit cards */}
            <div className="space-y-3 mb-5">
              {HABITS.map((habit) => {
                const streak = streaks.find((s) => s.type === habit.type);
                const todayVal = todayLog ? todayLog[habit.type] : 0;
                const completed = habitMet(habit.type, todayVal);
                const isToggling = toggling === habit.type;
                const nextTier = streak ? getNextTier(streak.currentStreak) : null;
                const inputVal = habitInputs[habit.type];
                const meetsThreshold = habit.inputType === 'boolean' || (inputVal && habitMet(habit.type, parseFloat(inputVal)));
                const isWeekly = habit.streakMode === 'weekly';
                let weeklyCount = 0;
                if (isWeekly) {
                  const now = new Date(); const dow = now.getDay(); const mOff = dow === 0 ? -6 : 1 - dow;
                  const mon = new Date(now); mon.setDate(now.getDate() + mOff);
                  const monStr = mon.toISOString().split('T')[0];
                  weeklyCount = dayLogs.filter(d => d.date >= monStr && habitMet(habit.type, d[habit.type])).length;
                }
                const streakLabel = isWeekly
                  ? (streak && streak.currentStreak > 0 ? `${Math.floor(streak.currentStreak / 7)}w` : '')
                  : (streak && streak.currentStreak > 0 ? `${streak.currentStreak}d` : '');

                return (
                  <div key={habit.type} className={`card p-4 ${completed ? 'opacity-50' : ''}`}
                    style={!completed ? { borderColor: `${habit.color}20` } : {}}>
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${habit.color}12` }}>
                        {completed ? <span className="text-lg">✅</span> : habit.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[14px] font-semibold">{habit.label}</span>
                          {streakLabel && (
                            <span className="text-[9px] mono font-semibold px-1.5 py-0.5 rounded-md" style={{ background: `${habit.color}15`, color: habit.color }}>
                              {streakLabel} · {streak?.multiplier}×
                            </span>
                          )}
                          {isWeekly && (
                            <span className="text-[9px] mono px-1.5 py-0.5 rounded-md" style={{ background: weeklyCount >= (habit.weeklyTarget || 5) ? 'var(--green-soft)' : 'var(--bg-elevated)', color: weeklyCount >= (habit.weeklyTarget || 5) ? 'var(--green)' : 'var(--text-muted)' }}>
                              {weeklyCount}/{habit.weeklyTarget}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-[var(--text-muted)]">{habit.description}</div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        {completed ? (
                          <div className="text-[11px] mono text-[var(--text-muted)]">
                            {habit.type === 'steps' ? `${todayVal.toLocaleString()}` : habit.type === 'calories' ? `${todayVal.toLocaleString()} cal` : 'Done'}
                          </div>
                        ) : (
                          <div>
                            <div className="mono text-[13px] font-semibold text-[var(--btc)]">+{formatSats(streak?.satsPerCompletion || 500)}</div>
                            {nextTier && <div className="text-[9px] text-[var(--text-muted)] mono">{nextTier.nextMultiplier}× in {nextTier.daysUntil}d</div>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Input row */}
                    {!completed && (
                      <div className="mt-3.5 flex items-center gap-2.5">
                        {habit.inputType === 'number' ? (
                          <>
                            <input type="number" inputMode="numeric"
                              placeholder={habit.type === 'steps' ? '10000' : '1800'}
                              value={inputVal}
                              onChange={(e) => setHabitInputs(prev => ({ ...prev, [habit.type]: e.target.value }))}
                              className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-[14px] mono text-center focus:outline-none focus:border-[var(--btc)] transition-colors" />
                            <span className="text-[11px] text-[var(--text-muted)] w-8">{habit.unit}</span>
                            <button onClick={() => handleSubmitHabit(habit.type)} disabled={!meetsThreshold || isToggling}
                              className={`px-5 py-2.5 rounded-xl text-[13px] font-bold display tracking-wider transition-all active:scale-95 ${meetsThreshold ? 'text-black' : 'text-[var(--text-muted)] border border-[var(--border)]'}`}
                              style={meetsThreshold ? { background: 'linear-gradient(135deg, var(--btc), #e8820e)' } : { background: 'var(--bg)' }}>
                              {isToggling ? '...' : 'LOG'}
                            </button>
                          </>
                        ) : (
                          <button onClick={() => handleSubmitHabit(habit.type)} disabled={isToggling}
                            className="w-full py-3 rounded-xl text-[13px] font-bold display tracking-wider text-black active:scale-[0.98] transition-all disabled:opacity-40"
                            style={{ background: 'linear-gradient(135deg, var(--btc), #e8820e)' }}>
                            {isToggling ? 'LOGGING...' : "YES — I WORKED OUT"}
                          </button>
                        )}
                      </div>
                    )}

                    {!completed && habit.inputType === 'number' && inputVal && !meetsThreshold && (
                      <div className="mt-2 text-[10px] text-[var(--red)] pl-[58px]">
                        {habit.thresholdDir === 'gte' ? `Need at least ${habit.threshold.toLocaleString()} ${habit.unit}` : `Must be under ${habit.threshold.toLocaleString()} ${habit.unit}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Streak danger zone */}
            {streaks.some((s) => s.currentStreak >= 4) && (
              <div className="card p-4 mb-5" style={{ borderColor: 'var(--red-soft)' }}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--red)] font-semibold mb-2.5">Don&apos;t break the chain</div>
                {streaks.filter((s) => s.currentStreak >= 4).map((s) => {
                  const h = HABITS.find((h) => h.type === s.type)!;
                  return (
                    <div key={s.type} className="flex items-center justify-between text-[12px] py-1">
                      <span className="text-[var(--text-secondary)]">{h.icon} {h.label}: {h.streakMode === 'weekly' ? `${Math.floor(s.currentStreak / 7)}w` : `${s.currentStreak}d`}</span>
                      <span className="mono text-[var(--red)] text-[11px]">−{formatSats(s.satsPerCompletion - CONFIG.baseSatsPerHabit)}/day if broken</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              {[
                { label: 'Weight', value: `${dw(stats?.currentWeight || profile.startWeight)}`, sub: stats && stats.totalLost > 0 ? `↓${dw(stats.totalLost)} ${wu}` : wu, subColor: stats && stats.totalLost > 0 ? 'var(--green)' : 'var(--text-muted)' },
                { label: 'Days', value: `${stats?.totalDaysLogged || 0}`, sub: 'logged', subColor: 'var(--text-muted)' },
                { label: 'Earned', value: formatSats(stats?.totalSatsEarned || 0), sub: 'sats', subColor: 'var(--btc)' },
              ].map((item) => (
                <div key={item.label} className="card p-3.5 text-center">
                  <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">{item.label}</div>
                  <div className="mono text-[17px] font-semibold">{item.value}</div>
                  <div className="text-[9px] mono mt-0.5" style={{ color: item.subColor }}>{item.sub}</div>
                </div>
              ))}
            </div>

            {/* Multiplier tiers */}
            <div className="card p-4">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3">Streak multiplier</div>
              <div className="space-y-0.5">
                {CONFIG.streakTiers.map((tier, i) => {
                  const next = CONFIG.streakTiers[i + 1];
                  const range = next ? `${tier.minDays}–${next.minDays - 1}` : `${tier.minDays}+`;
                  const maxStreak = Math.max(...streaks.map((s) => s.currentStreak), 0);
                  const isActive = maxStreak >= tier.minDays && (!next || maxStreak < next.minDays);
                  return (
                    <div key={tier.minDays} className="flex items-center justify-between py-1.5 px-3 rounded-lg text-[12px]"
                      style={isActive ? { background: 'var(--btc-soft)', border: '1px solid var(--btc-medium)' } : {}}>
                      <span style={{ color: isActive ? 'var(--btc)' : 'var(--text-muted)' }}>{isActive ? '▸ ' : ''}Days {range}</span>
                      <span className="mono text-[11px]" style={{ color: isActive ? 'var(--btc)' : 'var(--text-muted)' }}>
                        {tier.multiplier}× · {formatSats(tier.multiplier * CONFIG.baseSatsPerHabit)}/habit
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── WEIGH-IN TAB ── */}
        {tab === 'weigh-in' && (
          <div className="animate-in">
            <div className="text-center pt-2 mb-6">
              <div className="text-3xl mb-3">⚖️</div>
              <h2 className="display text-[22px] mb-1">Week {weekNumber} Weigh-in</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Step on the scale, earn sats</p>
            </div>

            {alreadyWeighed && !wiResult ? (
              <div className="card p-8 text-center">
                <div className="text-2xl mb-3">✅</div>
                <div className="display text-[16px] text-[var(--green)] mb-1">Logged this week</div>
                <p className="text-[12px] text-[var(--text-muted)]">Next weigh-in: Week {weekNumber + 1}</p>
              </div>
            ) : wiResult ? (
              <div className="card p-8 text-center">
                <div className="text-3xl mb-3">🎉</div>
                <div className="display text-xl text-[var(--btc)] mb-1">+{formatSats(wiResult.sats)} sats</div>
                {wiResult.milestones.map((m) => (
                  <div key={m} className="mt-4 py-2.5 px-4 rounded-xl text-[13px] font-bold display text-black" style={{ background: 'linear-gradient(135deg, var(--btc), #e8820e)' }}>🏆 {m}</div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="card p-5">
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Last</div><div className="mono text-[18px]">{dw(lastWeight)}</div></div>
                    <div className="text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--green)] mb-1">Lost</div><div className="mono text-[18px] text-[var(--green)]">{dw(Math.max(profile.startWeight - lastWeight, 0))}</div></div>
                    <div className="text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Goal</div><div className="mono text-[18px]">{dw(profile.goalWeight)}</div></div>
                  </div>

                  <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-2">Today&apos;s weight ({wu})</div>
                  <input type="number" inputMode="decimal" step="0.1" placeholder={dw(lastWeight)} value={wiWeight} onChange={(e) => setWiWeight(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3.5 text-xl mono text-center focus:outline-none focus:border-[var(--btc)] transition-colors" />

                  {wiWeight && (() => {
                    const inputKg = weightUnit === 'lbs' ? lbsToKg(parseFloat(wiWeight)) : parseFloat(wiWeight);
                    const diff = Math.round(Math.abs(lastWeight - inputKg) * 10) / 10;
                    return (
                      <div className="mt-3 p-3.5 rounded-xl bg-[var(--bg)]">
                        <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Reward preview</div>
                        {inputKg < lastWeight ? (
                          <div><div className="mono text-[17px] text-[var(--btc)]">+{formatSats(Math.min(CONFIG.weighInBase + Math.round(diff * CONFIG.weighInPerUnit), CONFIG.weighInMaxPayout))}</div><div className="text-[11px] text-[var(--green)]">↓{dw(diff)} {wu}</div></div>
                        ) : inputKg === lastWeight ? (
                          <div><div className="mono text-[17px] text-[var(--btc)]">+{formatSats(CONFIG.weighInBase)}</div><div className="text-[11px] text-[var(--text-muted)]">Maintained</div></div>
                        ) : (
                          <div><div className="mono text-[17px] text-[var(--red)]">0 sats</div><div className="text-[11px] text-[var(--red)]">↑{dw(diff)} {wu} — no reward</div></div>
                        )}
                      </div>
                    );
                  })()}

                  <button onClick={handleWeighIn} disabled={!wiWeight || wiSaving}
                    className="w-full mt-4 py-3.5 rounded-xl text-[13px] font-bold display tracking-wider text-black disabled:opacity-30 active:scale-[0.98] transition-all"
                    style={{ background: 'linear-gradient(135deg, var(--btc), #e8820e)' }}>
                    {wiSaving ? 'SAVING...' : 'LOG WEIGH-IN'}
                  </button>
                </div>

                {weighIns.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-2 px-1">History</div>
                    <div className="space-y-1.5">
                      {[...weighIns].reverse().map((wi) => (
                        <div key={wi.weekNumber} className="card p-3.5 flex items-center justify-between">
                          <div><div className="text-[12px] font-semibold">Week {wi.weekNumber}</div><div className="text-[10px] text-[var(--text-muted)]">{wi.date}</div></div>
                          <div className="flex items-center gap-3">
                            <div className="text-right"><div className="mono text-[13px]">{dw(wi.weight)}</div><div className="text-[10px]" style={{ color: wi.change <= 0 ? 'var(--green)' : 'var(--red)' }}>{wi.change <= 0 ? '↓' : '↑'}{dw(Math.abs(wi.change))}</div></div>
                            <div className="mono text-[12px] text-[var(--btc)]">+{formatSats(wi.satsEarned)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STATS TAB ── */}
        {tab === 'stats' && stats && (
          <div className="animate-in space-y-4">
            {/* Total earned hero */}
            <div className="card p-6 text-center">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Total earned</div>
              <div className="mono text-[36px] font-bold text-[var(--btc)] leading-tight">{formatSats(stats.totalSatsEarned)}</div>
              <div className="text-[13px] text-[var(--text-muted)] mono mt-1">${satsToUsd(stats.totalSatsEarned)}</div>
            </div>

            {/* Weight journey */}
            <div className="card p-5">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3 text-center">Weight journey</div>
              <div className="flex items-baseline justify-center gap-5">
                <div className="text-center"><div className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Start</div><div className="mono text-[17px]">{dw(profile.startWeight)}</div></div>
                <div className="text-[var(--text-muted)]">→</div>
                <div className="text-center"><div className="text-[9px] text-[var(--green)] font-semibold uppercase">Now</div><div className="mono text-[22px] text-[var(--green)]">{dw(stats.currentWeight)}</div></div>
                <div className="text-[var(--text-muted)]">→</div>
                <div className="text-center"><div className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Goal</div><div className="mono text-[17px]">{dw(profile.goalWeight)}</div></div>
              </div>
              <div className="progress-bar mt-4"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(weightPct, 0)}%`, background: 'linear-gradient(90deg, var(--green-dim), var(--green))' }} /></div>
              <div className="mono text-[11px] text-center text-[var(--text-muted)] mt-2">{dw(stats.totalLost)} {wu} lost</div>
            </div>

            {/* Streaks */}
            <div className="card p-5">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3">Streaks</div>
              <div className="space-y-3">
                {streaks.map((s) => {
                  const h = HABITS.find((hab) => hab.type === s.type)!;
                  return (
                    <div key={s.type} className="flex items-center gap-3.5">
                      <span className="text-xl">{h.icon}</span>
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold">{h.label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="mono text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ background: `${h.color}12`, color: h.color }}>
                            {h.streakMode === 'weekly' ? `${Math.floor(s.currentStreak / 7)}w` : `${s.currentStreak}d`}
                          </span>
                          <span className="mono text-[10px] text-[var(--btc)] font-semibold">{s.multiplier}×</span>
                          <span className="text-[10px] text-[var(--text-muted)]">Best: {h.streakMode === 'weekly' ? `${Math.floor(s.longestStreak / 7)}w` : `${s.longestStreak}d`}</span>
                        </div>
                      </div>
                      <div className="mono text-[13px] text-[var(--btc)] font-semibold">{formatSats(s.satsPerCompletion)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Milestones */}
            <div className="card p-5">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3">Milestones</div>
              <div className="space-y-2">
                {CONFIG.milestones.map((m) => {
                  const hit = stats.milestonesHit.includes(m.label);
                  return (
                    <div key={m.label} className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl ${hit ? 'opacity-40' : ''}`} style={{ background: 'var(--bg)' }}>
                      <div className="flex items-center gap-2.5"><span className="text-base">{hit ? '✅' : '🎯'}</span><div><div className="text-[12px] font-semibold">{m.label}</div><div className="text-[10px] text-[var(--text-muted)]">{dw(m.weight)} {wu}</div></div></div>
                      <div className="mono text-[12px]" style={{ color: hit ? 'var(--green)' : 'var(--btc)' }}>{hit ? 'CLAIMED' : `+${formatSats(m.sats)}`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="card p-4 text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Days logged</div><div className="mono text-xl mt-1">{stats.totalDaysLogged}</div></div>
              <div className="card p-4 text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Weigh-ins</div><div className="mono text-xl mt-1">{stats.weighInsLogged}<span className="text-sm text-[var(--text-muted)]">/{CONFIG.totalWeeks}</span></div></div>
            </div>
          </div>
        )}
      </main>

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)]/90 backdrop-blur-xl border-t border-[var(--border)] safe-bottom">
        <div className="max-w-lg mx-auto flex justify-around py-2">
          {([
            { id: 'today' as const, label: 'Today', icon: '⚡' },
            { id: 'weigh-in' as const, label: 'Weigh-in', icon: '⚖️' },
            { id: 'stats' as const, label: 'Stats', icon: '🏆' },
          ]).map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setWiResult(null); }}
              className={`flex flex-col items-center py-1.5 px-5 transition-all ${tab === t.id ? 'text-[var(--btc)]' : 'text-[var(--text-muted)]'}`}>
              <span className="text-[18px]">{t.icon}</span>
              <span className="text-[9px] mt-0.5 font-semibold tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
