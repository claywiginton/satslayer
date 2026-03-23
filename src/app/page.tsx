'use client';

import { useState, useEffect } from 'react';
import {
  CONFIG, getChallengeForDay, getCurrentDayNumber, getCurrentWeekNumber,
  formatSats, satsToUsd, categoryIcons, categoryColors,
  type DailyChallenge, type PlayerStats, type WeighIn,
} from '@/lib/data';
import { getCompletedChallenges, completeChallenge, getWeighIns, saveWeighIn, getPlayerStats } from '@/lib/db';

export default function SatSlayer() {
  const [tab, setTab] = useState<'today' | 'weigh-in' | 'history' | 'stats'>('today');
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [completedDays, setCompletedDays] = useState<Set<number>>(new Set());
  const [weighIns, setWeighIns] = useState<WeighIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [showReward, setShowReward] = useState<number | null>(null);

  const dayNumber = getCurrentDayNumber();
  const weekNumber = getCurrentWeekNumber();

  useEffect(() => {
    Promise.all([getPlayerStats(), getCompletedChallenges(), getWeighIns()])
      .then(([s, c, w]) => {
        setStats(s);
        setCompletedDays(c);
        setWeighIns(w);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load data:', err);
        // Still show the app with defaults
        setStats({
          totalSatsEarned: 0, totalSatsAvailable: CONFIG.totalSats,
          currentWeight: CONFIG.startWeight, startWeight: CONFIG.startWeight,
          goalWeight: CONFIG.goalWeight, totalLost: 0, currentStreak: 0,
          longestStreak: 0, challengesCompleted: 0, challengesTotal: 365,
          weighInsLogged: 0, milestonesHit: [], comebackPool: 0,
        });
        setLoading(false);
      });
  }, []);

  const todayChallenge = getChallengeForDay(dayNumber);
  const todayCompleted = completedDays.has(dayNumber);

  const handleComplete = async () => {
    if (todayCompleted || completing) return;
    setCompleting(true);
    const ok = await completeChallenge(dayNumber, CONFIG.dailySatsBase);
    if (ok) {
      setCompletedDays((prev) => new Set([...prev, dayNumber]));
      setShowReward(CONFIG.dailySatsBase);
      setTimeout(() => setShowReward(null), 3000);
      const s = await getPlayerStats();
      setStats(s);
    }
    setCompleting(false);
  };

  // Weigh-in state
  const [wiWeight, setWiWeight] = useState('');
  const [wiSaving, setWiSaving] = useState(false);
  const [wiResult, setWiResult] = useState<{ sats: number; milestones: string[] } | null>(null);

  const lastWeight = weighIns.length > 0 ? weighIns[weighIns.length - 1].weight : CONFIG.startWeight;
  const alreadyWeighedThisWeek = weighIns.some((w) => w.weekNumber === weekNumber);

  const handleWeighIn = async () => {
    if (!wiWeight || wiSaving) return;
    setWiSaving(true);
    const weight = parseFloat(wiWeight);
    const result = await saveWeighIn(weekNumber, weight, lastWeight);
    if (result.success) {
      setWiResult({ sats: result.satsEarned, milestones: result.milestonesHit });
      const [s, w] = await Promise.all([getPlayerStats(), getWeighIns()]);
      setStats(s);
      setWeighIns(w);
    }
    setWiSaving(false);
  };

  const progressPct = stats ? Math.min((stats.totalSatsEarned / stats.totalSatsAvailable) * 100, 100) : 0;
  const weightPct = stats ? Math.min(((stats.startWeight - stats.currentWeight) / (stats.startWeight - stats.goalWeight)) * 100, 100) : 0;

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

  return (
    <div className="min-h-screen relative z-10 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--btc)] flex items-center justify-center text-black text-sm font-bold">₿</div>
            <div>
              <div className="text-base display">SATSLAYER</div>
              <div className="text-[9px] text-[var(--text-muted)] tracking-widest uppercase -mt-0.5">{CONFIG.playerName}&apos;s Bounty</div>
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-sm text-[var(--btc)]">{formatSats(stats?.totalSatsEarned || 0)}</div>
            <div className="text-[9px] text-[var(--text-muted)]">sats earned</div>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {/* Sat reward popup */}
        {showReward && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 sat-pop">
            <div className="bg-[var(--btc)] text-black px-6 py-3 rounded-2xl shadow-lg">
              <div className="text-center">
                <div className="text-2xl font-bold display">+{formatSats(showReward)} SATS</div>
                <div className="text-xs opacity-70">≈ ${satsToUsd(showReward)}</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'today' && (
          <div className="space-y-4 animate-in">
            {/* Progress overview */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Sats earned</div>
                  <div className="mono text-2xl text-[var(--btc)]">{formatSats(stats?.totalSatsEarned || 0)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">of {formatSats(CONFIG.totalSats)}</div>
                  <div className="mono text-sm text-[var(--text-secondary)]">≈ ${satsToUsd(stats?.totalSatsEarned || 0)}</div>
                </div>
              </div>
              <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--btc-dim), var(--btc))' }} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[var(--text-muted)]">
                <span>Day {dayNumber} of 365</span>
                <span>Week {weekNumber}</span>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="card p-3 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Weight</div>
                <div className="mono text-lg">{stats?.currentWeight || '—'}</div>
                {stats && stats.totalLost > 0 && <div className="text-[10px] text-[var(--green)]">↓{stats.totalLost} lbs</div>}
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Streak</div>
                <div className="mono text-lg">{stats?.currentStreak || 0}</div>
                <div className="text-[10px] text-[var(--text-muted)]">days</div>
              </div>
              <div className="card p-3 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Done</div>
                <div className="mono text-lg">{stats?.challengesCompleted || 0}</div>
                <div className="text-[10px] text-[var(--text-muted)]">challenges</div>
              </div>
            </div>

            {/* Today's challenge */}
            <div className="card overflow-hidden" style={!todayCompleted ? { border: `1px solid ${categoryColors[todayChallenge.category]}40` } : {}}>
              <div className="h-1" style={{ background: todayCompleted ? 'var(--green)' : categoryColors[todayChallenge.category] }} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{categoryIcons[todayChallenge.category]}</span>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: todayCompleted ? 'var(--green)' : categoryColors[todayChallenge.category] }}>
                        {todayCompleted ? 'Completed' : todayChallenge.category}
                      </div>
                      <div className="display text-lg">{todayChallenge.title}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-base text-[var(--btc)]">+{formatSats(todayChallenge.sats)}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">sats</div>
                  </div>
                </div>

                <p className="text-sm text-[var(--text-secondary)] mb-4">{todayChallenge.description}</p>

                <button
                  onClick={handleComplete}
                  disabled={todayCompleted || completing}
                  className={`w-full py-3.5 rounded-xl text-sm font-bold display tracking-wider transition-all active:scale-[0.98] ${
                    todayCompleted
                      ? 'bg-[var(--green-dim)] text-[var(--green)] cursor-default'
                      : 'bg-[var(--btc)] text-black hover:brightness-110'
                  } disabled:cursor-not-allowed`}
                >
                  {todayCompleted ? '✓ CHALLENGE COMPLETE' : completing ? 'CLAIMING...' : 'COMPLETE — CLAIM SATS'}
                </button>
              </div>
            </div>

            {/* Upcoming challenges preview */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Coming up</div>
              <div className="space-y-1.5">
                {[1, 2, 3].map((offset) => {
                  const future = getChallengeForDay(dayNumber + offset);
                  const done = completedDays.has(dayNumber + offset);
                  return (
                    <div key={offset} className={`card p-3 flex items-center gap-3 ${done ? 'opacity-40' : ''}`}>
                      <span className="text-lg">{categoryIcons[future.category]}</span>
                      <div className="flex-1">
                        <div className="text-xs font-semibold">{future.title}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">Day {dayNumber + offset} · {future.category}</div>
                      </div>
                      <div className="mono text-xs text-[var(--btc)]">+{formatSats(future.sats)}</div>
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
              <p className="text-xs text-[var(--text-muted)] mt-1">Step on the scale, log the number, earn sats</p>
            </div>

            {alreadyWeighedThisWeek && !wiResult ? (
              <div className="card p-6 text-center">
                <div className="text-2xl mb-2">✅</div>
                <div className="display text-lg text-[var(--green)]">ALREADY LOGGED THIS WEEK</div>
                <p className="text-xs text-[var(--text-muted)] mt-2">Come back next week for your next weigh-in</p>
              </div>
            ) : wiResult ? (
              <div className="card p-6 text-center">
                <div className="text-3xl mb-3">🎉</div>
                <div className="display text-xl text-[var(--btc)] mb-1">+{formatSats(wiResult.sats)} SATS</div>
                <div className="text-xs text-[var(--text-muted)]">≈ ${satsToUsd(wiResult.sats)}</div>
                {wiResult.milestones.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {wiResult.milestones.map((m) => (
                      <div key={m} className="bg-[var(--btc)] text-black rounded-xl px-4 py-2 text-sm font-bold display">
                        🏆 MILESTONE: {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="card p-4">
                  <div className="flex justify-between mb-3">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Last weight</div>
                      <div className="mono text-xl">{lastWeight} lbs</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Goal</div>
                      <div className="mono text-xl">{CONFIG.goalWeight} lbs</div>
                    </div>
                  </div>
                  <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(weightPct, 0)}%`, background: 'linear-gradient(90deg, var(--green-dim), var(--green))' }} />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1.5 text-center">
                    {Math.round(Math.max(weightPct, 0))}% to goal — {Math.round(Math.max((stats?.currentWeight || CONFIG.startWeight) - CONFIG.goalWeight, 0))} lbs to go
                  </div>
                </div>

                <div className="card p-4">
                  <label className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider block mb-2">Today&apos;s weight (lbs)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder={String(lastWeight)}
                    value={wiWeight}
                    onChange={(e) => setWiWeight(e.target.value)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-xl mono text-center focus:outline-none focus:border-[var(--btc)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />

                  {wiWeight && (
                    <div className="mt-3 p-3 rounded-lg bg-[var(--bg)]">
                      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Reward preview</div>
                      {parseFloat(wiWeight) < lastWeight ? (
                        <div>
                          <div className="mono text-lg text-[var(--btc)]">
                            +{formatSats(Math.min(CONFIG.weeklyWeighInBase + Math.round((lastWeight - parseFloat(wiWeight)) * CONFIG.weeklyPerPoundLost), CONFIG.maxWeeklyBonus))} sats
                          </div>
                          <div className="text-[10px] text-[var(--green)]">
                            ↓{Math.round((lastWeight - parseFloat(wiWeight)) * 10) / 10} lbs — nice work
                          </div>
                        </div>
                      ) : parseFloat(wiWeight) === lastWeight ? (
                        <div>
                          <div className="mono text-lg text-[var(--btc)]">+{formatSats(CONFIG.weeklyWeighInBase)} sats</div>
                          <div className="text-[10px] text-[var(--text-muted)]">Maintained — base reward</div>
                        </div>
                      ) : (
                        <div>
                          <div className="mono text-lg text-[var(--red)]">0 sats</div>
                          <div className="text-[10px] text-[var(--red)]">↑{Math.round((parseFloat(wiWeight) - lastWeight) * 10) / 10} lbs — no reward this week</div>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleWeighIn}
                    disabled={!wiWeight || wiSaving}
                    className="w-full mt-3 py-3.5 rounded-xl text-sm font-bold display tracking-wider bg-[var(--btc)] text-black disabled:opacity-30 active:scale-[0.98] transition-all"
                  >
                    {wiSaving ? 'SAVING...' : 'LOG WEIGH-IN'}
                  </button>
                </div>

                <div className="card p-4">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">How it pays</div>
                  <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                    <div className="flex justify-between"><span>Show up &amp; log weight</span><span className="mono text-[var(--btc)]">+{formatSats(CONFIG.weeklyWeighInBase)}</span></div>
                    <div className="flex justify-between"><span>Per pound lost</span><span className="mono text-[var(--btc)]">+{formatSats(CONFIG.weeklyPerPoundLost)}</span></div>
                    <div className="flex justify-between"><span>Max weekly payout</span><span className="mono">{formatSats(CONFIG.maxWeeklyBonus)}</span></div>
                    <div className="flex justify-between"><span>Weight gain</span><span className="mono text-[var(--red)]">0 sats</span></div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4 animate-in">
            <h2 className="display text-xl pt-2">WEIGH-IN HISTORY</h2>
            {weighIns.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-2xl mb-2">⚖️</div>
                <p className="text-sm text-[var(--text-muted)]">No weigh-ins yet. Log your first one!</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {[...weighIns].reverse().map((wi) => (
                  <div key={wi.weekNumber} className="card p-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold">Week {wi.weekNumber}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{wi.date}</div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div>
                          <div className="mono text-sm">{wi.weight} lbs</div>
                          <div className="text-[10px]" style={{ color: wi.change <= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {wi.change <= 0 ? '↓' : '↑'}{Math.abs(wi.change)} lbs
                          </div>
                        </div>
                        <div className="mono text-sm text-[var(--btc)]">+{formatSats(wi.satsEarned)}</div>
                      </div>
                    </div>
                    {wi.milestonesHit && wi.milestonesHit.length > 0 && (
                      <div className="mt-2 flex gap-1.5">
                        {wi.milestonesHit.map((m) => (
                          <span key={m} className="text-[9px] bg-[var(--btc)] text-black px-2 py-0.5 rounded font-bold">🏆 {m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Milestones */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2 px-0.5">Milestones</div>
              <div className="space-y-1.5">
                {CONFIG.milestones.map((m) => {
                  const hit = stats?.milestonesHit.includes(m.label);
                  return (
                    <div key={m.label} className={`card p-3 flex items-center justify-between ${hit ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{hit ? '✅' : '🎯'}</span>
                        <div>
                          <div className="text-xs font-semibold">{m.label}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">Reach {m.weight} lbs</div>
                        </div>
                      </div>
                      <div className="mono text-sm" style={{ color: hit ? 'var(--green)' : 'var(--btc)' }}>
                        {hit ? 'CLAIMED' : `+${formatSats(m.sats)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'stats' && stats && (
          <div className="space-y-4 animate-in">
            <h2 className="display text-xl pt-2">{CONFIG.playerName.toUpperCase()}&apos;S STATS</h2>

            {/* Big numbers */}
            <div className="card p-5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Total sats earned</div>
              <div className="mono text-4xl text-[var(--btc)]">{formatSats(stats.totalSatsEarned)}</div>
              <div className="text-sm text-[var(--text-muted)] mt-1">≈ ${satsToUsd(stats.totalSatsEarned)} at current rates</div>
              <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--btc-dim), var(--btc))' }} />
              </div>
              <div className="text-[10px] text-[var(--text-muted)] mt-1">{Math.round(progressPct)}% of {formatSats(CONFIG.totalSats)} total bounty</div>
            </div>

            {/* Weight progress */}
            <div className="card p-5 text-center">
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Weight</div>
              <div className="flex items-baseline justify-center gap-3">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Start</div>
                  <div className="mono text-lg">{stats.startWeight}</div>
                </div>
                <div className="text-2xl text-[var(--text-muted)]">→</div>
                <div>
                  <div className="text-[10px] text-[var(--green)]">Current</div>
                  <div className="mono text-2xl text-[var(--green)]">{stats.currentWeight}</div>
                </div>
                <div className="text-2xl text-[var(--text-muted)]">→</div>
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">Goal</div>
                  <div className="mono text-lg">{stats.goalWeight}</div>
                </div>
              </div>
              <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden mt-3">
                <div className="h-full rounded-full" style={{ width: `${Math.max(weightPct, 0)}%`, background: 'linear-gradient(90deg, var(--green-dim), var(--green))' }} />
              </div>
              <div className="mono text-xs text-[var(--text-muted)] mt-1.5">{stats.totalLost} lbs lost · {Math.round(Math.max(weightPct, 0))}% to goal</div>
            </div>

            {/* Grid stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="card p-3.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Current streak</div>
                <div className="mono text-xl mt-1">{stats.currentStreak} <span className="text-sm text-[var(--text-muted)]">days</span></div>
              </div>
              <div className="card p-3.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Best streak</div>
                <div className="mono text-xl mt-1">{stats.longestStreak} <span className="text-sm text-[var(--text-muted)]">days</span></div>
              </div>
              <div className="card p-3.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Challenges done</div>
                <div className="mono text-xl mt-1">{stats.challengesCompleted}<span className="text-sm text-[var(--text-muted)]">/365</span></div>
              </div>
              <div className="card p-3.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Weigh-ins</div>
                <div className="mono text-xl mt-1">{stats.weighInsLogged}<span className="text-sm text-[var(--text-muted)]">/52</span></div>
              </div>
              <div className="card p-3.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Milestones</div>
                <div className="mono text-xl mt-1">{stats.milestonesHit.length}<span className="text-sm text-[var(--text-muted)]">/4</span></div>
              </div>
              <div className="card p-3.5 text-center">
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Comeback pool</div>
                <div className="mono text-xl mt-1 text-[var(--btc)]">{formatSats(stats.comebackPool)}</div>
              </div>
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
            { id: 'history' as const, label: 'History', icon: '📊' },
            { id: 'stats' as const, label: 'Stats', icon: '🏆' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setWiResult(null); }}
              className={`flex flex-col items-center py-1.5 px-4 rounded-lg transition-all ${tab === t.id ? 'text-[var(--btc)]' : 'text-[var(--text-muted)]'}`}
            >
              <span className="text-lg">{t.icon}</span>
              <span className="text-[9px] mt-0.5 font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
