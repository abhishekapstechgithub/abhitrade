'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import {
  X, ChevronRight, ChevronLeft, BarChart2, Search, TrendingUp,
  Shield, Database, Bell, PieChart, Layers, CheckCircle,
} from 'lucide-react';

const STORAGE_KEY = 'at:onboarding:seen';

interface Step {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tip: string;
  color: string;
  bg: string;
}

const STEPS: Step[] = [
  {
    icon: <Search size={28} />,
    title: 'Search Any Instrument',
    desc: 'Press Ctrl+S anywhere to open the global search. Find equities, F&O contracts, indices, and ETFs across NSE and BSE instantly.',
    tip: 'Try searching "RELIANCE", "NIFTY", or "BANKNIFTY 26 Jun"',
    color: '#2979ff',
    bg: 'rgba(41,121,255,0.08)',
  },
  {
    icon: <TrendingUp size={28} />,
    title: 'Option Chain & Charts',
    desc: 'Open the Markets menu to access the live Option Chain, advanced TradingView-style charts, and strategy tools.',
    tip: 'Option chain updates live every second via AngelOne WebSocket',
    color: '#00c853',
    bg: 'rgba(0,200,83,0.08)',
  },
  {
    icon: <Layers size={28} />,
    title: 'Watchlist',
    desc: 'Add instruments to your watchlist and monitor LTP, change%, volume and OI in real time. Multiple watchlists supported.',
    tip: 'Click any search result to add it to your active watchlist',
    color: '#ff6d00',
    bg: 'rgba(255,109,0,0.08)',
  },
  {
    icon: <PieChart size={28} />,
    title: 'Portfolio & Positions',
    desc: 'Track holdings, grouped positions, P&L and margin usage. Paper trading mode lets you practice without real money.',
    tip: 'Switch LIVE ↔ PAPER using the toggle in the top-right header',
    color: '#aa00ff',
    bg: 'rgba(170,0,255,0.08)',
  },
  {
    icon: <Database size={28} />,
    title: 'Load EOD Prices',
    desc: 'Go to Data Management (/security-master) to upload NSE/BSE bhavcopy CSV files. This updates LTP and change% for all instruments.',
    tip: 'Use the "Index Prices" tab to load NIFTY/SENSEX EOD data too',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
  },
  {
    icon: <Bell size={28} />,
    title: 'Alerts & Notifications',
    desc: 'Set price alerts on any instrument from the watchlist or option chain. Get notified when your target is hit.',
    tip: 'Bell icon in the header shows all active and triggered alerts',
    color: '#0097a7',
    bg: 'rgba(0,151,167,0.08)',
  },
  {
    icon: <Shield size={28} />,
    title: 'You\'re All Set!',
    desc: 'AbhiTrade is ready. All features work best with AngelOne credentials configured in your .env.local. Market data syncs every 60 seconds.',
    tip: 'This guide won\'t show again — find it anytime in Profile → Help',
    color: '#00c853',
    bg: 'rgba(0,200,83,0.08)',
  },
];

export function FirstLoginGuide() {
  const user     = useAuthStore(s => s.user);
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  // Only show on dashboard pages, never on login/auth pages
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/auth');

  useEffect(() => {
    if (!user || isAuthPage) return;
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setVisible(true);
    } catch { /* ignore */ }
  }, [user, isAuthPage]);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>

      <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--bg-surface, #0d1117)', border: '1px solid var(--border-med, rgba(255,255,255,0.1))' }}>

        {/* Close */}
        <button onClick={dismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors z-10"
          style={{ color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)' }}>
          <X size={14} />
        </button>

        {/* Step indicator */}
        <div className="flex gap-1.5 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)}
              className="h-1 rounded-full cursor-pointer transition-all"
              style={{
                flex: i === step ? 2 : 1,
                background: i <= step ? current.color : 'rgba(255,255,255,0.1)',
              }} />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-6 pb-4">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: current.bg, color: current.color }}>
            {current.icon}
          </div>

          {/* Step number */}
          <div className="text-xs font-semibold mb-1" style={{ color: current.color }}>
            Step {step + 1} of {STEPS.length}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary, #f1f5f9)' }}>
            {current.title}
          </h2>

          {/* Description */}
          <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary, #94a3b8)' }}>
            {current.desc}
          </p>

          {/* Tip */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: current.bg, border: `1px solid ${current.color}30` }}>
            <CheckCircle size={13} className="mt-0.5 shrink-0" style={{ color: current.color }} />
            <span style={{ color: 'var(--text-secondary, #94a3b8)' }}>{current.tip}</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2 px-6 pb-6 pt-2">
          <button onClick={() => setStep(s => s - 1)}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
            style={{ border: '1px solid var(--border-med, rgba(255,255,255,0.1))', color: 'var(--text-secondary, #94a3b8)' }}>
            <ChevronLeft size={14} /> Back
          </button>

          <div className="flex-1" />

          {isLast ? (
            <button onClick={dismiss}
              className="flex items-center gap-1.5 px-5 h-9 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: current.color }}>
              <BarChart2 size={14} /> Start Trading
            </button>
          ) : (
            <button onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1.5 px-5 h-9 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: current.color }}>
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// Resets the guide so it shows again on next page load (for testing / profile help)
export function resetOnboardingGuide() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
