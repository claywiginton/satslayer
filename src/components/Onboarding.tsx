'use client';

import { useState } from 'react';
import { CONFIG, formatSats, satsToUsd } from '@/lib/data';
import KettlebellLogo from '@/components/KettlebellLogo';

interface Props {
  onComplete: (username: string, startWeight: number, telegramChatId?: string, startDate?: string) => Promise<void> | void;
  claimed?: boolean; // true if someone already onboarded
  onReset?: () => void;
}

export default function Onboarding({ onComplete, claimed = false, onReset }: Props) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [startWeight, setStartWeight] = useState('');
  const [goalWeight, setGoalWeight] = useState(String(CONFIG.goalWeight));
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verified, setVerified] = useState(false);
  const [showAdminReset, setShowAdminReset] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [tgChecking, setTgChecking] = useState(false);
  const [tgConnected, setTgConnected] = useState(false);
  const [tgName, setTgName] = useState('');
  const [tgError, setTgError] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [startDate, setStartDate] = useState('');

  const handleReset = async () => {
    if (!adminPin) return;
    setResetting(true);
    setResetError('');
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin }),
      });
      const data = await res.json();
      if (data.success) {
        if (onReset) onReset();
      } else {
        setResetError(data.error || 'Reset failed');
      }
    } catch {
      setResetError('Connection error');
    }
    setResetting(false);
  };

  const handleVerify = async () => {
    if (!username.trim()) return;
    setVerifying(true);
    setVerifyError('');
    try {
      const res = await fetch('/api/verify-strike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.valid) {
        setVerified(true);
      } else {
        setVerifyError('Account not found on Strike. Check the username and try again.');
      }
    } catch {
      setVerifyError('Connection error. Try again.');
    }
    setVerifying(false);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleFinish = async () => {
    setSaving(true);
    setSaveError('');
    const sw = parseFloat(startWeight) || CONFIG.startWeight;
    console.log('handleFinish called with:', username.trim().toLowerCase(), sw);
    try {
      await onComplete(username.trim().toLowerCase(), sw, telegramChatId || undefined, startDate || undefined);
      console.log('onComplete finished successfully');
    } catch (e: any) {
      console.error('Finish error:', e);
      setSaveError(e?.message || 'Something went wrong. Try again.');
    }
    setSaving(false);
  };

  // ── STEP 0: LANDING ──
  if (step === 0) {
    return (
      <div className="min-h-screen relative z-10 flex flex-col items-center justify-center px-6">
        {/* Background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full opacity-20" style={{ background: 'radial-gradient(circle, var(--btc), transparent 70%)' }} />

        <div className="relative text-center max-w-sm">
          <div className="flex justify-center mb-5">
            <KettlebellLogo size={72} />
          </div>
          <h1 className="display text-4xl leading-tight mb-2" style={{ color: 'var(--btc)' }}>
            PROOF OF WORK
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mb-1 tracking-wide">
            mine bitcoin with your body
          </p>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-8">
            Complete daily habits. Build streaks. Earn sats. Miss a day and watch your multiplier reset.
          </p>

          <div className="card p-5 mb-8 text-center">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Total bounty pool</div>
            <div className="mono text-4xl text-[var(--btc)]">{formatSats(CONFIG.totalSats)}</div>
            <div className="text-sm text-[var(--text-muted)] mt-1">sats · waiting for you</div>
          </div>

          {claimed ? (
            <>
              <div className="card p-5 mb-4 text-center" style={{ borderColor: 'var(--red)40' }}>
                <div className="text-lg mb-1">🔒</div>
                <div className="text-sm font-semibold text-[var(--text-secondary)]">This bounty has been claimed</div>
                <p className="text-xs text-[var(--text-muted)] mt-1">Someone has already accepted this challenge.</p>
              </div>

              {/* Hidden admin reset — tap the lock icon 5 times or show PIN input */}
              {!showAdminReset ? (
                <button onClick={() => setShowAdminReset(true)} className="text-[10px] text-[var(--text-muted)] mt-4 opacity-30">
                  Admin
                </button>
              ) : (
                <div className="card p-4 mt-4">
                  <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Admin reset</div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      placeholder="PIN"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm mono text-center focus:outline-none focus:border-[var(--btc)]"
                      maxLength={8}
                    />
                    <button onClick={handleReset} disabled={resetting || !adminPin}
                      className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--red)] text-white disabled:opacity-30 active:scale-95 transition-all">
                      {resetting ? '...' : 'Wipe'}
                    </button>
                  </div>
                  {resetError && <p className="text-xs text-[var(--red)] mt-1.5">{resetError}</p>}
                  <p className="text-[10px] text-[var(--text-muted)] mt-1.5">This permanently deletes all data</p>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setStep(1)}
                className="w-full py-4 rounded-2xl text-lg font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all"
              >
                ACCEPT THE BOUNTY
              </button>
              <p className="text-[10px] text-[var(--text-muted)] mt-3">{CONFIG.totalWeeks} weeks · 3 daily habits · unlimited potential</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── STEP 1: STRIKE USERNAME + WEIGHT ──
  if (step === 1) {
    return (
      <div className="min-h-screen relative z-10 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          <button onClick={() => setStep(0)} className="text-xs text-[var(--text-muted)] mb-6 flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5m7-7l-7 7 7 7" /></svg>
            Back
          </button>

          <div className="text-3xl mb-2">⚡</div>
          <h2 className="display text-2xl mb-1">CONNECT STRIKE</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Your sats will be sent directly to your Strike wallet when you complete challenges.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] block mb-2">Strike username</label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden focus-within:border-[var(--btc)] transition-colors">
                  <input
                    type="text"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value.replace(/\s/g, '').toLowerCase()); setVerified(false); setVerifyError(''); }}
                    className="flex-1 bg-transparent px-4 py-3 text-base focus:outline-none"
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                  <span className="text-[12px] text-[var(--text-muted)] pr-3 mono">@strike.me</span>
                </div>
                <button
                  onClick={handleVerify}
                  disabled={!username.trim() || verifying || verified}
                  className={`px-4 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                    verified ? 'bg-[var(--green)] text-white' : 'bg-[var(--btc)] text-black'
                  } disabled:opacity-40`}
                >
                  {verified ? '✓' : verifying ? '...' : 'Verify'}
                </button>
              </div>
              {verifyError && <p className="text-xs text-[var(--red)] mt-1.5">{verifyError}</p>}
              {verified && <p className="text-xs text-[var(--green)] mt-1.5">✓ Account verified — sats will go to {username}@strike.me</p>}
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">Don&apos;t have Strike? Download at <span className="text-[var(--btc)]">strike.me</span></p>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] block mb-2">Current weight (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="129"
                value={startWeight}
                onChange={(e) => setStartWeight(e.target.value)}
                className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-base mono focus:outline-none focus:border-[var(--btc)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] block mb-2">Goal weight (kg)</label>
              <div className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl px-4 py-3 text-base mono text-[var(--text-secondary)]">
                {CONFIG.goalWeight} kg
                <span className="text-[10px] text-[var(--text-muted)] ml-2">fixed target</span>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] block mb-2">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-xl px-4 py-3 text-base mono focus:outline-none focus:border-[var(--btc)] [color-scheme:dark]"
              />
              <p className="text-[10px] text-[var(--text-muted)] mt-1.5">Challenge ends {CONFIG.totalWeeks} weeks from this date</p>
            </div>
          </div>

          <button
            onClick={() => verified && startWeight && startDate && setStep(2)}
            disabled={!verified || !startWeight || !startDate}
            className="w-full mt-6 py-4 rounded-2xl text-base font-bold display tracking-wider bg-[var(--btc)] text-black disabled:opacity-30 active:scale-[0.98] transition-all"
          >
            CONTINUE
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 2: CONNECT TELEGRAM ──
  if (step === 2) {
    const checkTelegram = async () => {
      setTgChecking(true);
      setTgError('');
      try {
        const res = await fetch('/api/telegram-register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        if (data.connected) {
          setTgConnected(true);
          setTgName(data.firstName || '');
          setTelegramChatId(String(data.chatId || ''));
        } else {
          setTgError(data.error || 'Not connected yet. Send /start to the bot and try again.');
        }
      } catch {
        setTgError('Connection check failed. Try again.');
      }
      setTgChecking(false);
    };

    return (
      <div className="min-h-screen relative z-10 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex gap-1.5 mb-8 justify-center">
            {[0,1,2,3,4,5,6].map((i) => <div key={i} className="h-1 rounded-full w-5" style={{ background: i <= 2 ? 'var(--btc)' : 'var(--border)' }} />)}
          </div>

          <div className="text-3xl mb-2">📬</div>
          <h2 className="display text-2xl mb-1">CONNECT TELEGRAM</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            Get daily reminders, streak warnings, and milestone alerts.
          </p>

          <div className="card p-5 mb-4">
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-3">3 quick steps</div>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[var(--btc)] text-black flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                <div className="text-[13px] text-[var(--text-secondary)]">Open Telegram on your phone</div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[var(--btc)] text-black flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                <div>
                  <div className="text-[13px] text-[var(--text-secondary)]">Search for the bot and open it:</div>
                  <div className="mono text-[13px] text-[var(--btc)] mt-1 select-all">@ProofOfWorkBot</div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-[var(--btc)] text-black flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                <div className="text-[13px] text-[var(--text-secondary)]">Send <span className="mono text-[var(--text)]">/start</span> to the bot</div>
              </div>
            </div>
          </div>

          {tgConnected ? (
            <div className="card p-4 mb-4 text-center" style={{ borderColor: 'rgba(52,211,153,0.3)' }}>
              <div className="text-lg mb-1">✅</div>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--green)' }}>Connected{tgName ? ` as ${tgName}` : ''}!</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">You&apos;ll get reminders via Telegram</div>
            </div>
          ) : (
            <>
              <button onClick={checkTelegram} disabled={tgChecking}
                className="w-full py-3.5 rounded-xl text-[13px] font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all disabled:opacity-50 mb-3">
                {tgChecking ? 'CHECKING...' : 'I SENT /START — VERIFY'}
              </button>
              {tgError && <p className="text-[11px] text-[var(--red)] text-center mb-3">{tgError}</p>}
            </>
          )}

          <button onClick={() => setStep(3)}
            className={`w-full py-4 rounded-2xl text-base font-bold display tracking-wider active:scale-[0.98] transition-all ${tgConnected ? 'bg-[var(--btc)] text-black' : 'border border-[var(--border)] text-[var(--text-muted)]'}`}>
            {tgConnected ? 'CONTINUE' : 'SKIP FOR NOW'}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 3: HOW DAILY HABITS WORK ──
  if (step === 3) {
    return (
      <div className="min-h-screen relative z-10 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex gap-1.5 mb-8 justify-center">
            {[0,1,2,3,4,5,6].map((i) => <div key={i} className="h-1 rounded-full w-5" style={{ background: i <= 3 ? 'var(--btc)' : 'var(--border)' }} />)}
          </div>

          <h2 className="display text-2xl mb-2 text-center">3 DAILY HABITS</h2>
          <p className="text-sm text-[var(--text-muted)] text-center mb-6">Complete these every day to earn sats</p>

          <div className="space-y-3">
            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#22c55e15' }}>👟</div>
              <div>
                <div className="font-semibold">8,000 Steps</div>
                <div className="text-xs text-[var(--text-muted)]">Walk, move, get outside</div>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#f7931a15' }}>💪</div>
              <div>
                <div className="font-semibold">Workout 5×/Week</div>
                <div className="text-xs text-[var(--text-muted)]">30+ min exercise, 5 days per week (Mon-Sun)</div>
              </div>
            </div>
            <div className="card p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#a855f715' }}>🍽</div>
              <div>
                <div className="font-semibold">Under {CONFIG.calorieTarget.toLocaleString()} Calories</div>
                <div className="text-xs text-[var(--text-muted)]">Track it, stay under the line</div>
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--text-secondary)] text-center mt-5 leading-relaxed">
            Each habit earns sats independently. Complete all three every day for maximum earnings.
          </p>

          <button onClick={() => setStep(4)} className="w-full mt-6 py-4 rounded-2xl text-base font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all">
            NEXT
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 4: THE STREAK MULTIPLIER ──
  if (step === 4) {
    return (
      <div className="min-h-screen relative z-10 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex gap-1.5 mb-8 justify-center">
            {[0,1,2,3,4,5,6].map((i) => <div key={i} className="h-1 rounded-full w-5" style={{ background: i <= 4 ? 'var(--btc)' : 'var(--border)' }} />)}
          </div>

          <h2 className="display text-2xl mb-2 text-center" style={{ color: 'var(--btc)' }}>THE STREAK MULTIPLIER</h2>
          <p className="text-sm text-[var(--text-muted)] text-center mb-6">This is where it gets dangerous</p>

          <div className="card p-4 mb-4">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3">The longer your streak, the more you earn</div>
            <div className="space-y-1">
              {CONFIG.streakTiers.map((tier, i) => {
                const next = CONFIG.streakTiers[i + 1];
                const range = next ? `${tier.minDays}-${next.minDays - 1}` : `${tier.minDays}+`;
                const daily = tier.multiplier * CONFIG.baseSatsPerHabit * 3;
                return (
                  <div key={tier.minDays} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: i >= 4 ? 'var(--btc)08' : 'transparent' }}>
                    <span className="text-xs text-[var(--text-secondary)]">Days {range}</span>
                    <div className="flex items-center gap-3">
                      <span className="mono text-xs font-bold" style={{ color: 'var(--btc)' }}>{tier.multiplier}×</span>
                      <span className="mono text-xs text-[var(--text-muted)]">{formatSats(daily)}/day</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-4" style={{ borderColor: 'var(--red)40' }}>
            <div className="text-[10px] uppercase tracking-widest text-[var(--red)] mb-2">The catch</div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Miss a day and that habit&apos;s multiplier <span className="text-[var(--red)] font-semibold">resets to 1×</span>. At a 60-day streak, you&apos;re earning 10,000 sats per habit. Miss one day? Back to 500.
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
              Each habit has its own streak — so if you skip a workout but hit steps and calories, only the workout resets.
            </p>
          </div>

          <button onClick={() => setStep(5)} className="w-full mt-6 py-4 rounded-2xl text-base font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all">
            NEXT
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 5: THE PLAN — SCIENCE & MATH ──
  if (step === 5) {
    const sw = parseFloat(startWeight) || CONFIG.startWeight;
    const gw = parseFloat(goalWeight) || CONFIG.goalWeight;
    const toLose = Math.round((sw - gw) * 10) / 10;
    const weeksToGoal = CONFIG.totalWeeks;
    const chosenStart = startDate ? new Date(startDate) : new Date();
    const endDate = new Date(chosenStart);
    endDate.setDate(endDate.getDate() + weeksToGoal * 7);
    const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const ratePerWeek = Math.round((toLose / weeksToGoal) * 100) / 100;

    return (
      <div className="min-h-screen relative z-10 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex gap-1.5 mb-8 justify-center">
            {[0,1,2,3,4,5,6].map((i) => <div key={i} className="h-1 rounded-full w-5" style={{ background: i <= 5 ? 'var(--btc)' : 'var(--border)' }} />)}
          </div>

          <h2 className="display text-2xl mb-2 text-center">THE PLAN</h2>
          <p className="text-sm text-[var(--text-muted)] text-center mb-6">The math behind your transformation</p>

          {/* The numbers */}
          <div className="card p-5 mb-4">
            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div>
                <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Now</div>
                <div className="mono text-xl">{sw} kg</div>
              </div>
              <div>
                <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">Target</div>
                <div className="mono text-xl text-[var(--btc)]">{gw} kg</div>
              </div>
              <div>
                <div className="text-[9px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-1">To lose</div>
                <div className="mono text-xl text-[var(--green)]">{toLose} kg</div>
              </div>
            </div>
            <div className="h-[1px] bg-[var(--border)] my-3" />
            <div className="flex justify-between text-[12px] text-[var(--text-secondary)]">
              <span>Challenge</span>
              <span className="mono font-semibold">{weeksToGoal} weeks → {endStr}</span>
            </div>
            <div className="flex justify-between text-[12px] text-[var(--text-secondary)] mt-1.5">
              <span>Required rate</span>
              <span className="mono font-semibold text-[var(--btc)]">{ratePerWeek} kg/week</span>
            </div>
          </div>

          {/* The science */}
          <div className="card p-5 mb-4">
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--btc)] mb-3">How this works</div>
            <div className="space-y-3 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              <div className="flex gap-3">
                <span className="text-base shrink-0 mt-0.5">🍽</span>
                <div><span className="text-[var(--text)] font-semibold">2,500 cal/day</span> creates a 300–500 cal deficit from your maintenance (~3,000 cal). That alone = 0.3–0.5 kg/week.</div>
              </div>
              <div className="flex gap-3">
                <span className="text-base shrink-0 mt-0.5">👟</span>
                <div><span className="text-[var(--text)] font-semibold">8,000 steps/day</span> burns ~300–500 additional calories. Combined with diet = 0.4–0.7 kg/week.</div>
              </div>
              <div className="flex gap-3">
                <span className="text-base shrink-0 mt-0.5">💪</span>
                <div><span className="text-[var(--text)] font-semibold">5 workouts/week</span> adds another 200–400 cal burn per session and builds muscle, which increases metabolism. Total projected = <span className="text-[var(--green)] font-semibold">0.7–1.0 kg/week</span>.</div>
              </div>
            </div>
          </div>

          {/* The verdict */}
          <div className="card p-5 mb-4" style={{ borderColor: 'var(--green)20' }}>
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--green)] mb-2">The verdict</div>
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
              You need <span className="mono font-semibold text-[var(--text)]">{ratePerWeek} kg/week</span>. The plan delivers <span className="mono font-semibold text-[var(--green)]">0.7–1.0 kg/week</span>. 
              {ratePerWeek <= 1.0 ? (
                <span> This is <span className="text-[var(--green)] font-semibold">achievable</span>. Stay consistent and the math works.</span>
              ) : (
                <span> This is aggressive but doable with consistency. The first few weeks will show larger drops. Stay locked in.</span>
              )}
            </p>
          </div>

          <div className="card p-5 mb-4" style={{ borderColor: 'rgba(248,113,113,0.15)' }}>
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--red)] mb-2">Cheat days</div>
            <div className="space-y-2 text-[12px] text-[var(--text-secondary)]">
              <div className="flex gap-2"><span className="text-[var(--red)]">✕</span><span><span className="text-[var(--text)] font-semibold">Days 1–30:</span> Zero cheat days. No exceptions. Build the foundation.</span></div>
              <div className="flex gap-2"><span className="text-[var(--btc)]">→</span><span><span className="text-[var(--text)] font-semibold">After day 30:</span> You earn 1 cheat day every 30 days. A cheat day means your streaks don&apos;t break — but you earn 0 sats that day.</span></div>
            </div>
          </div>

          <div className="card p-4" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-semibold tracking-widest uppercase text-[var(--text-muted)] mb-2">The non-negotiables</div>
            <div className="space-y-1.5 text-[12px] text-[var(--text-secondary)]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--btc)]" />
                <span>Track every calorie — MyFitnessPal, Lose It, whatever works</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--btc)]" />
                <span>Weigh yourself weekly, same day, same time, same conditions</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--btc)]" />
                <span>Water: 3+ liters per day — hunger is often dehydration</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--btc)]" />
                <span>Sleep: 7+ hours — poor sleep kills fat loss and willpower</span>
              </div>
            </div>
          </div>

          <button onClick={() => setStep(6)} className="w-full mt-6 py-4 rounded-2xl text-base font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all">
            NEXT
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 6: WEIGH-INS + MILESTONES + LAUNCH ──
  if (step === 6) {
    return (
      <div className="min-h-screen relative z-10 flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full">
          <div className="flex gap-1.5 mb-8 justify-center">
            {[0,1,2,3,4,5,6].map((i) => <div key={i} className="h-1 rounded-full w-5" style={{ background: 'var(--btc)' }} />)}
          </div>

          <h2 className="display text-2xl mb-2 text-center">WEEKLY WEIGH-INS</h2>
          <p className="text-sm text-[var(--text-muted)] text-center mb-6">Step on the scale once a week for bonus sats</p>

          <div className="card p-4 mb-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Log your weight</span>
                <span className="mono text-[var(--btc)]">+{formatSats(CONFIG.weighInBase)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Per kg lost</span>
                <span className="mono text-[var(--btc)]">+{formatSats(CONFIG.weighInPerUnit)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Gained weight</span>
                <span className="mono text-[var(--red)]">0 sats</span>
              </div>
            </div>
          </div>

          <div className="card p-4 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-[var(--btc)] mb-3">Milestone jackpots</div>
            <div className="space-y-2">
              {CONFIG.milestones.map((m) => (
                <div key={m.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>🏆</span>
                    <span className="text-sm text-[var(--text-secondary)]">{m.label} — {m.weight} kg</span>
                  </div>
                  <span className="mono text-sm text-[var(--btc)]">+{formatSats(m.sats)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* The big launch button */}
          <div className="text-center mb-4">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2">Your bounty is funded</div>
            <div className="mono text-3xl text-[var(--btc)]">{formatSats(CONFIG.totalSats)} sats</div>
            <div className="text-sm text-[var(--text-muted)] mt-1">waiting for you</div>
          </div>

          {saveError && <p className="text-xs text-[var(--red)] text-center mb-3">{saveError}</p>}

          <button
            onClick={handleFinish}
            disabled={saving}
            className="w-full py-5 rounded-2xl text-lg font-bold display tracking-wider bg-[var(--btc)] text-black active:scale-[0.98] transition-all glow-btc disabled:opacity-50"
          >
            {saving ? 'SETTING UP...' : "LET'S GO — DAY 1 STARTS NOW"}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
