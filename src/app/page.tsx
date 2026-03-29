'use client';

import { useState, useEffect, useRef } from 'react';
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
import KettlebellLogo from '@/components/KettlebellLogo';

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mb-4 py-2.5 px-4 rounded-xl flex items-center justify-between" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)' }}>
      <span className="text-[11px] text-[var(--red)]">⏰ Streak resets in</span>
      <span className="mono text-[13px] font-bold text-[var(--red)]">{timeLeft}</span>
    </div>
  );
}

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
  const [showTiers, setShowTiers] = useState(false);

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

  const handleOnboardingComplete = async (username: string, startWeight: number, telegramChatId?: string, startDate?: string) => {
    const saved = await savePlayerProfile(username, startWeight, CONFIG.goalWeight, telegramChatId, startDate);
    if (saved) {
      setProfile({ strikeUsername: username, startWeight, goalWeight: CONFIG.goalWeight, startDate: startDate || getTodayStr(), createdAt: new Date().toISOString() });
    } else {
      throw new Error('Failed to save profile — check browser console for details');
    }
  };

  if (!profileChecked) return <div className="min-h-screen flex items-center justify-center relative z-10"><div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--btc)] rounded-full animate-spin" /></div>;
  if (!profile) return <Onboarding onComplete={handleOnboardingComplete} claimed={profileExists} onReset={() => { setProfile(null); setProfileExists(false); }} />;
  if (loading) return <div className="min-h-screen flex items-center justify-center relative z-10"><div className="text-center"><div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--btc)] rounded-full animate-spin mx-auto mb-3" /><p className="text-xs text-[var(--text-muted)]">Loading...</p></div></div>;

  const dayNumber = getDayNumber(undefined, profile.startDate);
  const weekNumber = getWeekNumber(undefined, profile.startDate);
  const lastWeight = profile ? (weighIns.length > 0 ? weighIns[weighIns.length - 1].weight : profile.startWeight) : CONFIG.startWeight;
  const alreadyWeighed = weighIns.some((w) => w.weekNumber === weekNumber);
  const streaks = stats?.streaks || [];
  const totalDailyPotential = streaks.reduce((sum, s) => sum + s.satsPerCompletion, 0);
  const weightPct = stats ? Math.min(((profile.startWeight - stats.currentWeight) / (profile.startWeight - profile.goalWeight)) * 100, 100) : 0;
  const todayComplete = HABITS.every(h => todayLog ? habitMet(h.type, todayLog[h.type]) : false);
  const todayCount = HABITS.filter(h => todayLog ? habitMet(h.type, todayLog[h.type]) : false).length;

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
      if (t) {
        const allDone = HABITS.every(h => habitMet(h.type, t[h.type]));
        if (allDone) fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'all_complete', data: { totalSats: sats } }) }).catch(() => {});
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
      // Notify sponsor of weigh-in
      const change = Math.round((inputKg - lastWeight) * 10) / 10;
      fetch('/api/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'weigh_in', data: { weight: inputKg, change, sats: result.satsEarned } }) }).catch(() => {});
      const [s, w] = await Promise.all([getPlayerStats(), getWeighIns()]);
      setStats(s); setWeighIns(w);
    }
    setWiSaving(false);
  };

  return (
    <div className="min-h-screen relative z-10 pb-24">
      {/* Sat reward popup */}
      {showReward && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] sat-pop">
          <div className="px-8 py-4 rounded-2xl text-center" style={{ background: 'linear-gradient(135deg, var(--btc), #e8820e)', boxShadow: '0 8px 32px rgba(247,147,26,0.35)' }}>
            <div className="text-2xl font-bold display text-black">+{formatSats(showReward.sats)}</div>
            <div className="text-xs text-black/50 font-medium">{showReward.habit}</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-lg mx-auto px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KettlebellLogo size={32} />
            <div className="display text-[13px] tracking-wider">PROOF OF WORK</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="mono text-[14px] font-semibold text-[var(--btc)]">{formatSats(stats?.totalSatsEarned || 0)}</div>
              <div className="text-[9px] text-[var(--text-muted)]">sats earned</div>
            </div>
            <button onClick={() => setWeightUnit(wu === 'kg' ? 'lbs' : 'kg')}
              className="text-[10px] mono px-2 py-1 rounded-md border border-[var(--border)] text-[var(--text-muted)] active:scale-95 transition-all">
              {wu.toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 pt-4">

        {/* ═══ TODAY TAB ═══ */}
        {tab === 'today' && (
          <div className="animate-in">
            {/* Day header + completion ring */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="display text-[20px]">Day {dayNumber}</div>
                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Week {weekNumber} · {todayCount}/3 complete</div>
              </div>
              {/* Mini completion ring */}
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="24" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle cx="28" cy="28" r="24" fill="none" stroke={todayComplete ? 'var(--green)' : 'var(--btc)'} strokeWidth="3"
                    strokeDasharray={`${(todayCount / 3) * 150.8} 150.8`} strokeLinecap="round" className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="mono text-[13px] font-bold" style={{ color: todayComplete ? 'var(--green)' : 'var(--btc)' }}>{todayCount}/3</span>
                </div>
              </div>
            </div>

            {todayComplete && (
              <div className="mb-5 py-3 px-4 rounded-2xl text-center" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--green)' }}>✨ All habits complete — you earned {formatSats(totalDailyPotential)} sats today</div>
              </div>
            )}

            {/* Streak countdown timer — shows when habits are incomplete */}
            {!todayComplete && (
              <CountdownTimer />
            )}

            {/* Pace tracker */}
            <div className="card p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Bounty progress</span>
                <span className="mono text-[11px] text-[var(--btc)]">{Math.round(((stats?.totalSatsEarned || 0) / CONFIG.totalSats) * 100)}%</span>
              </div>
              <div className="h-[6px] bg-[var(--bg)] rounded-full overflow-hidden mb-2">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(((stats?.totalSatsEarned || 0) / CONFIG.totalSats) * 100, 100)}%`, background: 'linear-gradient(90deg, var(--btc), #e8820e)' }} />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                <span className="mono">{formatSats(stats?.totalSatsEarned || 0)} earned</span>
                <span className="mono">{formatSats(CONFIG.totalSats)} total</span>
              </div>
              {stats && stats.totalSatsEarned > 0 && dayNumber > 1 && (
                <div className="text-[10px] text-[var(--text-muted)] text-center mt-2">
                  Pace: ~{formatSats(Math.round((stats.totalSatsEarned / dayNumber) * 7))} sats/week · projected total: {formatSats(Math.min(Math.round((stats.totalSatsEarned / dayNumber) * CONFIG.totalWeeks * 7), CONFIG.totalSats))}
                </div>
              )}
            </div>

            {/* Habit cards — each is its own big card */}
            <div className="space-y-3 mb-6">
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
                  weeklyCount = dayLogs.filter(d => d.date >= mon.toISOString().split('T')[0] && habitMet(habit.type, d[habit.type])).length;
                }

                return (
                  <div key={habit.type} className="card overflow-hidden">
                    {/* Color accent bar */}
                    <div className="h-[3px]" style={{ background: completed ? 'var(--green)' : habit.color, opacity: completed ? 0.5 : 1 }} />

                    <div className={`p-5 ${completed ? 'opacity-60' : ''}`}>
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{completed ? '✅' : habit.icon}</span>
                          <div>
                            <div className="text-[15px] font-semibold">{habit.label}</div>
                            <div className="text-[11px] text-[var(--text-muted)]">{habit.description}</div>
                          </div>
                        </div>
                      </div>

                      {/* Streak + reward info */}
                      <div className="flex items-center gap-2 mt-2.5 mb-1">
                        {streak && streak.currentStreak > 0 && (
                          <span className="text-[10px] mono font-semibold px-2 py-1 rounded-lg" style={{ background: `${habit.color}12`, color: habit.color }}>
                            🔥 {isWeekly ? `${Math.floor(streak.currentStreak / 7)}w` : `${streak.currentStreak}d`} streak · {streak.multiplier}×
                          </span>
                        )}
                        {isWeekly && (
                          <span className="text-[10px] mono px-2 py-1 rounded-lg" style={{ background: weeklyCount >= (habit.weeklyTarget || 5) ? 'var(--green-soft)' : 'var(--bg-elevated)', color: weeklyCount >= (habit.weeklyTarget || 5) ? 'var(--green)' : 'var(--text-muted)' }}>
                            {weeklyCount}/{habit.weeklyTarget} this week
                          </span>
                        )}
                        {!completed && (
                          <span className="text-[10px] mono font-semibold text-[var(--btc)] ml-auto">+{formatSats(streak?.satsPerCompletion || 500)} sats</span>
                        )}
                      </div>

                      {/* Completed state */}
                      {completed && (
                        <div className="mt-3 py-2.5 px-4 rounded-xl text-center" style={{ background: 'rgba(52,211,153,0.06)' }}>
                          <span className="mono text-[13px] text-[var(--green)]">
                            {habit.type === 'steps' ? `${todayVal.toLocaleString()} steps logged` : habit.type === 'calories' ? `${todayVal.toLocaleString()} cal logged` : 'Workout complete'}
                          </span>
                        </div>
                      )}

                      {/* Input area — big, prominent, mobile-friendly */}
                      {!completed && habit.inputType === 'number' && (
                        <div className="mt-4">
                          <div className="relative">
                            <input
                              type="number"
                              inputMode="numeric"
                              placeholder={habit.type === 'steps' ? '8000' : '2500'}
                              value={inputVal}
                              onChange={(e) => setHabitInputs(prev => ({ ...prev, [habit.type]: e.target.value }))}
                              className="w-full bg-[var(--bg)] border-2 border-[var(--border)] rounded-2xl px-5 py-4 text-[20px] mono text-center font-semibold focus:outline-none focus:border-[var(--btc)] transition-colors"
                              style={meetsThreshold ? { borderColor: `${habit.color}60` } : {}}
                            />
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-muted)]">{habit.unit}</span>
                          </div>

                          {inputVal && !meetsThreshold && (
                            <div className="mt-2 text-[11px] text-[var(--red)] text-center">
                              {habit.thresholdDir === 'gte' ? `Need at least ${habit.threshold.toLocaleString()}` : `Must be under ${habit.threshold.toLocaleString()}`}
                            </div>
                          )}

                          <button
                            onClick={() => handleSubmitHabit(habit.type)}
                            disabled={!meetsThreshold || isToggling}
                            className="w-full mt-3 py-3.5 rounded-2xl text-[14px] font-bold display tracking-wider transition-all active:scale-[0.98] disabled:opacity-25"
                            style={meetsThreshold ? { background: `linear-gradient(135deg, ${habit.color}, ${habit.color}dd)`, color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                            {isToggling ? 'LOGGING...' : meetsThreshold ? `LOG ${habit.label.toUpperCase()}` : `ENTER ${habit.unit.toUpperCase()}`}
                          </button>
                        </div>
                      )}

                      {/* Workout — big tap button */}
                      {!completed && habit.inputType === 'boolean' && (
                        <button
                          onClick={() => handleSubmitHabit(habit.type)}
                          disabled={isToggling}
                          className="w-full mt-4 py-4 rounded-2xl text-[15px] font-bold display tracking-wider text-black active:scale-[0.98] transition-all disabled:opacity-40"
                          style={{ background: `linear-gradient(135deg, ${habit.color}, ${habit.color}cc)` }}>
                          {isToggling ? 'LOGGING...' : "YES — I WORKED OUT 💪"}
                        </button>
                      )}

                      {/* Next tier hint */}
                      {!completed && nextTier && (
                        <div className="mt-2 text-center text-[10px] text-[var(--text-muted)]">
                          {nextTier.daysUntil === 1 ? 'Tomorrow' : `${nextTier.daysUntil} days`} until {nextTier.nextMultiplier}× multiplier
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Streak danger zone */}
            {streaks.some((s) => s.currentStreak >= 4) && !todayComplete && (
              <div className="card p-4 mb-5" style={{ borderColor: 'rgba(248,113,113,0.15)' }}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--red)] font-semibold mb-2">⚠️ Don&apos;t break the chain</div>
                {streaks.filter((s) => s.currentStreak >= 4).map((s) => {
                  const h = HABITS.find((h) => h.type === s.type)!;
                  return (
                    <div key={s.type} className="flex items-center justify-between text-[12px] py-1">
                      <span className="text-[var(--text-secondary)]">{h.icon} {h.label}: {h.streakMode === 'weekly' ? `${Math.floor(s.currentStreak / 7)}w` : `${s.currentStreak}d`}</span>
                      <span className="mono text-[var(--red)] text-[11px]">−{formatSats(s.satsPerCompletion - CONFIG.baseSatsPerHabit)}/day</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              {[
                { label: 'Weight', value: `${dw(stats?.currentWeight || profile.startWeight)}`, sub: stats && stats.totalLost > 0 ? `↓${dw(stats.totalLost)} ${wu}` : wu, color: stats && stats.totalLost > 0 ? 'var(--green)' : 'var(--text-muted)' },
                { label: 'Days', value: `${stats?.totalDaysLogged || 0}`, sub: 'logged', color: 'var(--text-muted)' },
                { label: 'Earned', value: formatSats(stats?.totalSatsEarned || 0), sub: 'sats', color: 'var(--btc)' },
              ].map((item) => (
                <div key={item.label} className="card p-3.5 text-center">
                  <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">{item.label}</div>
                  <div className="mono text-[16px] font-semibold">{item.value}</div>
                  <div className="text-[9px] mono mt-0.5" style={{ color: item.color }}>{item.sub}</div>
                </div>
              ))}
            </div>

            {/* Collapsible multiplier tiers */}
            <button onClick={() => setShowTiers(!showTiers)} className="w-full card p-3.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Streak multiplier tiers</span>
              <span className="text-[var(--text-muted)] text-sm">{showTiers ? '▾' : '▸'}</span>
            </button>
            {showTiers && (
              <div className="card mt-1 p-4">
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
            )}
          </div>
        )}

        {/* ═══ WEIGH-IN TAB ═══ */}
        {tab === 'weigh-in' && (
          <div className="animate-in">
            <div className="text-center pt-2 mb-6">
              <div className="text-3xl mb-2">⚖️</div>
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
                  {/* Weight overview */}
                  <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Last</div><div className="mono text-[18px]">{dw(lastWeight)}</div></div>
                    <div className="text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--green)] mb-1">Lost</div><div className="mono text-[18px] text-[var(--green)]">{dw(Math.max(profile.startWeight - lastWeight, 0))}</div></div>
                    <div className="text-center"><div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Goal</div><div className="mono text-[18px]">{dw(profile.goalWeight)}</div></div>
                  </div>

                  {/* Big weight input */}
                  <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-2">Today&apos;s weight ({wu})</div>
                  <input type="number" inputMode="decimal" step="0.1" placeholder={dw(lastWeight)} value={wiWeight} onChange={(e) => setWiWeight(e.target.value)}
                    className="w-full bg-[var(--bg)] border-2 border-[var(--border)] rounded-2xl px-5 py-4 text-[24px] mono text-center font-semibold focus:outline-none focus:border-[var(--btc)] transition-colors" />

                  {/* Reward preview */}
                  {wiWeight && (() => {
                    const inputKg = weightUnit === 'lbs' ? lbsToKg(parseFloat(wiWeight)) : parseFloat(wiWeight);
                    const loss = Math.round((lastWeight - inputKg) * 10) / 10;
                    const qualified = loss >= CONFIG.weighInMinLoss;
                    return (
                      <div className="mt-3 p-4 rounded-2xl bg-[var(--bg)]">
                        {qualified ? (
                          <div className="text-center"><div className="mono text-[20px] text-[var(--btc)]">+{formatSats(CONFIG.weighInPayout)}</div><div className="text-[11px] text-[var(--green)] mt-1">↓{dw(Math.abs(loss))} {wu} — nice work</div></div>
                        ) : loss > 0 ? (
                          <div className="text-center"><div className="mono text-[20px] text-[var(--text-muted)]">0 sats</div><div className="text-[11px] text-[var(--text-muted)] mt-1">↓{dw(loss)} {wu} — need at least {CONFIG.weighInMinLoss} {wu} loss to qualify</div></div>
                        ) : (
                          <div className="text-center"><div className="mono text-[20px] text-[var(--red)]">0 sats</div><div className="text-[11px] text-[var(--red)] mt-1">{loss === 0 ? 'No change' : `↑${dw(Math.abs(loss))} ${wu}`} — no reward</div></div>
                        )}
                      </div>
                    );
                  })()}

                  <button onClick={handleWeighIn} disabled={!wiWeight || wiSaving}
                    className="w-full mt-4 py-4 rounded-2xl text-[14px] font-bold display tracking-wider text-black disabled:opacity-25 active:scale-[0.98] transition-all"
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

        {/* ═══ STATS TAB ═══ */}
        {tab === 'stats' && stats && (
          <div className="animate-in space-y-4">
            <div className="card p-6 text-center">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Total earned</div>
              <div className="mono text-[36px] font-bold text-[var(--btc)] leading-tight">{formatSats(stats.totalSatsEarned)}</div>
              <div className="text-[13px] text-[var(--text-muted)] mono mt-1">${satsToUsd(stats.totalSatsEarned)}</div>
            </div>

            <div className="card p-5">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3 text-center">Weight journey</div>
              <div className="flex items-baseline justify-center gap-5">
                <div className="text-center"><div className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Start</div><div className="mono text-[17px]">{dw(profile.startWeight)}</div></div>
                <div className="text-[var(--text-muted)]">→</div>
                <div className="text-center"><div className="text-[9px] text-[var(--green)] font-semibold uppercase">Now</div><div className="mono text-[22px] text-[var(--green)]">{dw(stats.currentWeight)}</div></div>
                <div className="text-[var(--text-muted)]">→</div>
                <div className="text-center"><div className="text-[9px] text-[var(--text-muted)] font-semibold uppercase">Goal</div><div className="mono text-[17px]">{dw(profile.goalWeight)}</div></div>
              </div>
              <div className="h-[5px] bg-[var(--bg)] rounded-full overflow-hidden mt-4"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(weightPct, 0)}%`, background: 'linear-gradient(90deg, var(--green-dim), var(--green))' }} /></div>
              <div className="mono text-[11px] text-center text-[var(--text-muted)] mt-2">{dw(stats.totalLost)} {wu} lost</div>
            </div>

            <div className="card p-5">
              <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3">Streaks</div>
              <div className="space-y-3.5">
                {streaks.map((s) => {
                  const h = HABITS.find((hab) => hab.type === s.type)!;
                  return (
                    <div key={s.type} className="flex items-center gap-3.5">
                      <span className="text-xl">{h.icon}</span>
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold">{h.label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="mono text-[10px] px-2 py-0.5 rounded-lg font-semibold" style={{ background: `${h.color}12`, color: h.color }}>
                            🔥 {h.streakMode === 'weekly' ? `${Math.floor(s.currentStreak / 7)}w` : `${s.currentStreak}d`}
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

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg)]/90 backdrop-blur-xl border-t border-[var(--border)]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
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
