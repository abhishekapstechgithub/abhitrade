'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';

type Tab = 'signin' | 'signup';
type SignInStep = 'email' | 'otp';

// ─── OTP Input ─────────────────────────────────────────────────────────────
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const digits = value.padEnd(6, '').split('').slice(0, 6);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = raw;
    const joined = next.join('');
    onChange(joined);
    if (raw && i < 5) refs[i + 1].current?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      refs[Math.min(pasted.length, 5)].current?.focus();
    }
    e.preventDefault();
  }

  return (
    <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-11 h-12 text-center text-lg font-semibold rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors bg-gray-50 focus:bg-white"
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

// ─── Countdown ─────────────────────────────────────────────────────────────
function Countdown({ seconds, onComplete }: { seconds: number; onComplete: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const t = setInterval(() => setLeft((s) => {
      if (s <= 1) { clearInterval(t); onComplete(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (left === 0) return null;
  const m = String(Math.floor(left / 60)).padStart(2, '0');
  const s = String(left % 60).padStart(2, '0');
  return <span className="text-blue-600 font-medium">{m}:{s}</span>;
}

// ─── Brand Panel ───────────────────────────────────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white p-10 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-20 right-0 w-80 h-80 rounded-full bg-indigo-300/20 blur-3xl" />
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice">
          <path d="M0 200 Q100 150 200 200 T400 200" stroke="white" strokeWidth="1" fill="none" opacity="0.1"/>
          <path d="M0 300 Q100 250 200 300 T400 300" stroke="white" strokeWidth="1" fill="none" opacity="0.1"/>
          <path d="M0 400 Q100 350 200 400 T400 400" stroke="white" strokeWidth="1" fill="none" opacity="0.1"/>
        </svg>
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
              <path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z"/>
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight">AbhiTrade</span>
        </div>
        <p className="text-blue-200 text-sm">India&apos;s smartest trading platform</p>
      </div>

      <div className="relative z-10 space-y-8">
        <div>
          <h2 className="text-3xl font-bold leading-tight mb-3">
            Trade smarter.<br />Earn better.
          </h2>
          <p className="text-blue-100 text-sm leading-relaxed">
            Options, equities, futures — all in one powerful workspace
            designed for the active Indian trader.
          </p>
        </div>

        <div className="space-y-3">
          {[
            { icon: '⚡', text: 'Real-time option chain with live OI & IV' },
            { icon: '📊', text: 'Advanced charting with 20+ indicators' },
            { icon: '🧠', text: 'Strategy builder with P&L simulation' },
            { icon: '🔒', text: 'Bank-grade security, OTP authentication' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <span className="text-lg mt-0.5">{icon}</span>
              <span className="text-blue-100 text-sm">{text}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
          {[
            { val: '2M+', label: 'Traders' },
            { val: '₹50B+', label: 'Volume/day' },
            { val: '4.8★', label: 'Rating' },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <div className="text-xl font-bold">{val}</div>
              <div className="text-blue-200 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 text-blue-300 text-xs">
        © 2025 AbhiTrade. SEBI Registered. NSE/BSE Member.
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';
  const setUser = useAuthStore(s => s.setUser);

  const [tab, setTab] = useState<Tab>('signin');

  // Sign-in state (name-based)
  const [siName, setSiName]           = useState('');
  const [siStep, setSiStep]           = useState<SignInStep>('email');
  const [siOtp, setSiOtp]             = useState('');
  const [siLoading, setSiLoading]     = useState(false);
  const [siError, setSiError]         = useState('');
  const [siCanResend, setSiCanResend] = useState(false);
  const [siResendKey, setSiResendKey] = useState(0);

  // Sign-up state
  const [suName, setSuName]           = useState('');
  const [suEmail, setSuEmail]         = useState('');
  const [suPhone, setSuPhone]         = useState('');
  const [suStep, setSuStep]           = useState<SignInStep>('email');
  const [suOtp, setSuOtp]             = useState('');
  const [suLoading, setSuLoading]     = useState(false);
  const [suError, setSuError]         = useState('');
  const [suDevOtp, setSuDevOtp]       = useState('');
  const [suCanResend, setSuCanResend] = useState(false);
  const [suResendKey, setSuResendKey] = useState(0);

  // ── Sign In handlers ─────────────────────────────────────────────────────

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setSiError('');
    setSiLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSiError(data.error || 'Failed to send OTP');
        return;
      }
      if (!data.userExists) {
        setSiError('No account found with this name. Please sign up first.');
        return;
      }
      setSiCanResend(false);
      setSiResendKey((k) => k + 1);
      setSiStep('otp');
    } catch {
      setSiError('Network error. Please try again.');
    } finally {
      setSiLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (siOtp.length < 6) return;
    setSiError('');
    setSiLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siName, otp: siOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSiError(data.error || 'Verification failed');
        return;
      }
      if (data.user) setUser(data.user);
      router.push(from);
    } catch {
      setSiError('Network error. Please try again.');
    } finally {
      setSiLoading(false);
    }
  }

  const handleResendSignIn = useCallback(async () => {
    setSiCanResend(false);
    setSiError('');
    await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: siName }),
    });
    setSiResendKey((k) => k + 1);
    setSiOtp('');
  }, [siName]);

  // ── Sign Up handlers ─────────────────────────────────────────────────────

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setSuError('');
    setSuLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: suName, email: suEmail, phone: suPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setSuError('Account already exists. Please sign in.');
          setTimeout(() => setTab('signin'), 1500);
        } else {
          setSuError(data.error || 'Registration failed');
        }
        return;
      }
      setSuDevOtp(data.devOtp || '');
      setSuCanResend(false);
      setSuResendKey((k) => k + 1);
      setSuStep('otp');
    } catch {
      setSuError('Network error. Please try again.');
    } finally {
      setSuLoading(false);
    }
  }

  async function handleVerifySignUp(e: React.FormEvent) {
    e.preventDefault();
    if (suOtp.length < 6) return;
    setSuError('');
    setSuLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: suEmail, otp: suOtp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSuError(data.error || 'Verification failed');
        return;
      }
      if (data.user) setUser(data.user);
      router.push(from);
    } catch {
      setSuError('Network error. Please try again.');
    } finally {
      setSuLoading(false);
    }
  }

  const handleResendSignUp = useCallback(async () => {
    setSuCanResend(false);
    setSuError('');
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: suEmail }),
    });
    const data = await res.json();
    if (data.devOtp) setSuDevOtp(data.devOtp);
    setSuResendKey((k) => k + 1);
    setSuOtp('');
  }, [suEmail]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white" style={{ color: '#111827' }}>
      <BrandPanel />

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900">AbhiTrade</span>
          </div>

          {/* Tabs */}
          <div className="flex border border-gray-200 rounded-xl p-1 mb-8 bg-gray-50">
            {(['signin', 'signup'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* ── SIGN IN ─────────────────────────────────────────────────── */}
          {tab === 'signin' && (
            <div>
              {siStep === 'email' ? (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h1>
                    <p className="text-sm text-gray-500">Sign in with your registered name</p>
                  </div>

                  {siError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                      {siError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Your name
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      value={siName}
                      onChange={(e) => setSiName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={siLoading || !siName.trim()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {siLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Sending OTP...
                      </>
                    ) : (
                      <>Send OTP <span className="text-base">→</span></>
                    )}
                  </button>

                  <p className="text-center text-sm text-gray-500">
                    Don&apos;t have an account?{' '}
                    <button type="button" onClick={() => setTab('signup')} className="text-blue-600 font-medium hover:underline">
                      Create one
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div>
                    <button
                      type="button"
                      onClick={() => { setSiStep('email'); setSiError(''); setSiOtp(''); }}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-3"
                    >
                      ← Back
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Enter OTP</h1>
                    <p className="text-sm text-gray-500">
                      Signing in as{' '}
                      <span className="font-medium text-gray-700">{siName}</span>
                    </p>
                  </div>

                  {/* Default OTP hint — always shown */}
                  <div className="text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
                    <span className="font-semibold">Default OTP:</span>{' '}
                    <button
                      type="button"
                      onClick={() => setSiOtp('000000')}
                      className="font-mono font-bold underline cursor-pointer"
                    >
                      000000
                    </button>
                    <span className="text-blue-500 ml-1">(click to fill)</span>
                  </div>

                  {siError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                      {siError}
                    </div>
                  )}

                  <OtpInput value={siOtp} onChange={setSiOtp} />

                  <button
                    type="submit"
                    disabled={siLoading || siOtp.length < 6}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {siLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Verifying...
                      </>
                    ) : (
                      'Verify & Sign In'
                    )}
                  </button>

                  <div className="text-center text-sm text-gray-500">
                    {siCanResend ? (
                      <button type="button" onClick={handleResendSignIn} className="text-blue-600 font-medium hover:underline">
                        Resend OTP
                      </button>
                    ) : (
                      <>
                        Resend in{' '}
                        <Countdown
                          key={siResendKey}
                          seconds={120}
                          onComplete={() => setSiCanResend(true)}
                        />
                      </>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── SIGN UP ─────────────────────────────────────────────────── */}
          {tab === 'signup' && (
            <div>
              {suStep === 'email' ? (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Create account</h1>
                    <p className="text-sm text-gray-500">Start trading in under 2 minutes</p>
                  </div>

                  {suError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                      {suError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      value={suName}
                      onChange={(e) => setSuName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Mobile number</label>
                    <div className="flex">
                      <span className="flex items-center px-3 bg-gray-50 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500 font-medium">
                        +91
                      </span>
                      <input
                        type="tel"
                        required
                        autoComplete="tel"
                        value={suPhone}
                        onChange={(e) => setSuPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="98765 43210"
                        maxLength={10}
                        className="flex-1 px-4 py-3 rounded-r-xl border border-gray-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={suLoading || !suName || !suEmail || suPhone.length < 10}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {suLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Creating account...
                      </>
                    ) : (
                      <>Create Account & Send OTP <span className="text-base">→</span></>
                    )}
                  </button>

                  <p className="text-xs text-center text-gray-400">
                    By creating an account, you agree to our{' '}
                    <a href="#" className="text-blue-500 hover:underline">Terms</a>{' '}
                    and{' '}
                    <a href="#" className="text-blue-500 hover:underline">Privacy Policy</a>
                  </p>

                  <p className="text-center text-sm text-gray-500">
                    Already have an account?{' '}
                    <button type="button" onClick={() => setTab('signin')} className="text-blue-600 font-medium hover:underline">
                      Sign in
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={handleVerifySignUp} className="space-y-5">
                  <div>
                    <button
                      type="button"
                      onClick={() => { setSuStep('email'); setSuError(''); setSuOtp(''); }}
                      className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-3"
                    >
                      ← Back
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">Verify your email</h1>
                    <p className="text-sm text-gray-500">
                      We sent a 6-digit code to<br />
                      <span className="font-medium text-gray-700">{suEmail}</span>
                    </p>
                  </div>

                  {suDevOtp && (
                    <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-700">
                      <span className="font-semibold">Dev mode OTP:</span>{' '}
                      <button
                        type="button"
                        onClick={() => setSuOtp(suDevOtp)}
                        className="font-mono font-bold underline cursor-pointer"
                      >
                        {suDevOtp}
                      </button>
                      <span className="text-amber-500 ml-1">(click to fill)</span>
                    </div>
                  )}

                  {suError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                      {suError}
                    </div>
                  )}

                  <OtpInput value={suOtp} onChange={setSuOtp} />

                  <button
                    type="submit"
                    disabled={suLoading || suOtp.length < 6}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    {suLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Verifying...
                      </>
                    ) : (
                      'Verify & Start Trading'
                    )}
                  </button>

                  <div className="text-center text-sm text-gray-500">
                    {suCanResend ? (
                      <button type="button" onClick={handleResendSignUp} className="text-blue-600 font-medium hover:underline">
                        Resend OTP
                      </button>
                    ) : (
                      <>
                        Resend in{' '}
                        <Countdown
                          key={suResendKey}
                          seconds={120}
                          onComplete={() => setSuCanResend(true)}
                        />
                      </>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              Protected by bank-grade encryption • Sessions expire in 12 hours
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <LoginContent />
    </Suspense>
  );
}
