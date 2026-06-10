'use client';
import {
  Bell, ChevronDown, Search, BarChart2, FlaskConical, Zap,
  Activity, PieChart, Star, ChevronRight,
} from 'lucide-react';
import { useMarketStore } from '@/store/useMarketStore';
import { useUIStore } from '@/store/useUIStore';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useAngelOneQuotes } from '@/hooks/useAngelOneData';
import { formatNumber, formatPercent, cn } from '@/lib/utils/format';
import Link from 'next/link';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MarketIndex } from '@/types';
import { MarketsMenu } from '@/components/markets/MarketsMenu';

const INDEX_EXCHANGE_TOKENS = { NSE: ['99926000', '99926009'], BSE: ['99919000'] };
const TOKEN_LABELS: Record<string, string> = {
  '99926000': 'NIFTY 50',
  '99926009': 'BANK NIFTY',
  '99919000': 'SENSEX',
};

const NAV_LINKS = [
  { id: 'markets',   label: 'Markets',   href: '/markets',   hasMenu: true },
  { id: 'watchlist', label: 'Watchlist', href: '/watchlist' },
  { id: 'portfolio', label: 'Portfolio', href: '/portfolio' },
  { id: 'orders',    label: 'Orders',    href: '/orders' },
  { id: 'positions', label: 'Positions', href: '/positions' },
  { id: 'tools',     label: 'Tools',     href: '/tools' },
];

// Quick-action menu shown on chip hover
const CHIP_ACTIONS = [
  { label: 'Option Chain',       href: '/markets?tab=option-chain', Icon: BarChart2 },
  { label: 'Charts',             href: '/markets?tab=charts',       Icon: Activity  },
  { label: 'Stock Composition',  href: '/markets?tab=composition',  Icon: PieChart  },
  { label: 'Favourite Strategies', href: '/markets?tab=strategies', Icon: Star      },
];

// ── useOutsideClick ────────────────────────────────────────────────────────────
function useOutsideClick(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, cb]);
}

export function Header() {
  const { indices } = useMarketStore();
  const { setSearchOpen, notificationsOpen, setNotificationsOpen, activeNav, setActiveNav,
          pinnedIndices, togglePinnedIndex, tradingMode, setTradingMode } = useUIStore();
  const { active: paperActive, toggle: paperToggle } = usePaperTradingStore();

  const handleModeToggle = () => {
    paperToggle();
    setTradingMode(paperActive ? 'live' : 'paper');
  };
  const { isConnected, mode } = useAngelOneStore();
  const isLive = isConnected && mode === 'live';
  const getInitials  = useAuthStore(s => s.getInitials);
  const getFirstName = useAuthStore(s => s.getFirstName);

  // Zustand persist rehydrates from localStorage only on the client.
  // Without this guard the server renders 'AT' but the client renders the
  // stored user's initials, causing a React hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [marketsMenuOpen, setMarketsMenuOpen] = useState(false);
  const [indicesListOpen, setIndicesListOpen] = useState(false);
  const indicesListRef = useRef<HTMLDivElement | null>(null);

  const { data: liveQuotesRaw } = useAngelOneQuotes(INDEX_EXCHANGE_TOKENS, isLive, 5_000);
  const liveQuotes = liveQuotesRaw ?? {};

  const closeIndicesList = useCallback(() => setIndicesListOpen(false), []);
  useOutsideClick(indicesListRef, closeIndicesList);

  // Resolve which indices to show as chips from the pinned list
  const pinnedIndexObjects = pinnedIndices
    .map(sym => indices.find(i => i.symbol === sym))
    .filter((i): i is MarketIndex => !!i);

  const atPinnedLimit = pinnedIndices.length >= 2;

  return (
    <header className="sticky top-0 z-40 glass-header" style={{ minHeight: '52px' }}>
      <div className="flex items-center h-[52px] px-4 gap-3 max-w-[1600px] mx-auto">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0" onClick={() => setActiveNav('dashboard')}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center glow-blue"
            style={{ background: 'linear-gradient(135deg,#2979ff,#00d4ff)' }}>
            <BarChart2 size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-base font-bold tracking-tight grad-blue">AbhiTrade</span>
        </Link>

        {/* LIVE badge */}
        <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs shrink-0"
          style={isLive
            ? { background:'rgba(var(--gain-rgb),0.15)', border:'1px solid rgba(var(--gain-rgb),0.4)' }
            : { background:'rgba(var(--gain-rgb),0.08)', border:'1px solid rgba(var(--gain-rgb),0.2)' }}>
          {isLive
            ? <><Zap size={9} style={{ color:'var(--accent-green)' }} /><span className="font-bold" style={{ color:'var(--accent-green)', fontSize:'10px' }}>LIVE</span></>
            : <><span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background:'var(--accent-green)' }} /><span className="font-semibold" style={{ color:'var(--accent-green)', fontSize:'10px' }}>LIVE</span></>
          }
        </div>

        {/* Index chips + dropdown trigger */}
        <div className="hidden md:flex items-center gap-1 relative" ref={indicesListRef}>
          {pinnedIndexObjects.map(idx => {
            // In live mode: use Angel One data only — never fall back to mock prices.
            // In paper mode: use the mock/simulated ticker values.
            const liveEntry = isLive
              ? Object.entries(liveQuotes).find(([tok]) => TOKEN_LABELS[tok] === idx.symbol)
              : null;
            const hasReal = !!liveEntry;
            const ltp = hasReal ? liveEntry![1].ltp : (isLive ? null : idx.ltp);
            const chg = hasReal ? liveEntry![1].change : (isLive ? null : idx.change);
            const pct = hasReal ? liveEntry![1].pct : (isLive ? null : idx.changePercent);
            return (
              <IndexChip
                key={idx.symbol}
                symbol={idx.symbol}
                ltp={ltp}
                change={chg}
                changePercent={pct}
                isLive={hasReal}
              />
            );
          })}

          {/* Dropdown arrow */}
          <button
            onClick={() => setIndicesListOpen(v => !v)}
            className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
            style={{
              background: indicesListOpen ? 'rgba(0,212,255,0.1)' : 'var(--card-inner-bg)',
              border: `1px solid ${indicesListOpen ? 'rgba(0,212,255,0.35)' : 'var(--card-inner-border)'}`,
              color: indicesListOpen ? 'var(--accent-cyan)' : 'var(--text-dim)',
            }}>
            <ChevronDown size={12} className={cn('transition-transform', indicesListOpen && 'rotate-180')} />
          </button>

          {/* Indices list dropdown */}
          {indicesListOpen && (
            <div className="absolute top-[calc(100%+6px)] left-0 z-[100] rounded-xl shadow-2xl overflow-hidden"
              style={{ width: 440, ...POPUP_STYLE }}>
              {/* Header */}
              <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: 'var(--panel-divider)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Indices List</span>
              </div>

              {/* Pin limit warning */}
              {atPinnedLimit && (
                <div className="mx-3 mt-2 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgb(239,68,68)' }}>
                  A maximum of two Indices can be shown in the header bar. Unpin one pinned indice first to pin new one.
                </div>
              )}

              {/* Rows */}
              <div className="py-1 max-h-72 overflow-y-auto">
                {indices.map(idx => {
                  const pinned = pinnedIndices.includes(idx.symbol);
                  // In live mode, look up real Angel One price for this index
                  const liveEntry = isLive
                    ? Object.entries(liveQuotes).find(([tok]) => TOKEN_LABELS[tok] === idx.symbol)
                    : null;
                  const hasReal  = !!liveEntry;
                  const rowLtp   = hasReal ? liveEntry![1].ltp   : (isLive ? null : idx.ltp);
                  const rowChg   = hasReal ? liveEntry![1].change : (isLive ? null : idx.change);
                  const rowPct   = hasReal ? liveEntry![1].pct   : (isLive ? null : idx.changePercent);
                  const pos      = rowChg !== null ? rowChg >= 0 : true;
                  const canPin   = pinned || !atPinnedLimit;
                  return (
                    <div key={idx.symbol}
                      className="flex items-center px-4 py-2.5 group transition-colors"
                      style={{ borderBottom: '1px solid var(--row-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>

                      {/* Pin icon */}
                      <button
                        onClick={() => canPin && togglePinnedIndex(idx.symbol)}
                        title={pinned ? 'Unpin' : atPinnedLimit ? 'Max 2 pinned' : 'Pin to header'}
                        className="mr-3 flex-shrink-0 transition-opacity"
                        style={{ opacity: (!canPin && !pinned) ? 0.3 : 1, cursor: canPin ? 'pointer' : 'not-allowed' }}>
                        {pinned ? <DiamondFilled /> : <DiamondOutline />}
                      </button>

                      {/* Symbol */}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{idx.symbol}</span>
                      </div>

                      {/* Price + change */}
                      <div className="flex items-center gap-3 shrink-0">
                        {rowLtp !== null ? (
                          <>
                            <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                              {formatNumber(rowLtp)}
                            </span>
                            <span className="text-[11px] font-semibold flex items-center gap-0.5 w-28 justify-end"
                              style={{ color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {pos ? '▲' : '▼'} {pos ? '+' : ''}{formatNumber(Math.abs(rowChg!))} ({pos ? '+' : ''}{rowPct!.toFixed(2)}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] w-44 text-right" style={{ color: 'var(--text-label)' }}>
                            — connect Angel One
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t text-center" style={{ borderColor: 'var(--panel-divider)' }}>
                <Link href="/markets" onClick={() => setIndicesListOpen(false)}
                  className="text-[11px] font-bold uppercase tracking-widest hover:opacity-75 transition-opacity"
                  style={{ color: 'var(--accent-cyan)' }}>
                  VIEW ALL INDICES
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-[420px] mx-2">
          <button onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 h-8 rounded-lg text-xs transition-all"
            style={{ background:'var(--search-bg)', border:'1px solid var(--search-border)', color:'var(--search-text)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor='rgba(0,212,255,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor='var(--search-border)')}>
            <Search size={12} />
            <span>Search symbol, F&amp;O, strategy…</span>
            <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background:'rgba(41,121,255,0.12)', color:'var(--text-dim)', border:'1px solid rgba(41,121,255,0.2)' }}>
              Ctrl+S
            </kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="hidden lg:flex items-center gap-0.5">
          {NAV_LINKS.map(link => (
            <div key={link.id} className="relative">
              {link.hasMenu ? (
                <button
                  onClick={() => setMarketsMenuOpen(!marketsMenuOpen)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all"
                  style={marketsMenuOpen
                    ? { background:'rgba(0,212,255,0.08)', color:'var(--accent-cyan)' }
                    : { color:'var(--text-dim)' }}>
                  {link.label}
                  <ChevronDown size={11} className={cn('opacity-60 transition-transform', marketsMenuOpen && 'rotate-180')} />
                </button>
              ) : (
                <Link href={link.href} onClick={() => setActiveNav(link.id)}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md transition-all block"
                  style={activeNav === link.id
                    ? { background:'rgba(0,212,255,0.08)', color:'var(--accent-cyan)' }
                    : { color:'var(--text-dim)' }}>
                  {link.label}
                </Link>
              )}
              {link.hasMenu && marketsMenuOpen && (
                <MarketsMenu onClose={() => setMarketsMenuOpen(false)} />
              )}
            </div>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-1.5 rounded-md transition-colors"
            style={{ color: notificationsOpen ? '#00d4ff' : 'var(--text-dim)', background: notificationsOpen ? 'rgba(0,212,255,0.08)' : undefined }}>
            <Bell size={15} />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full live-dot" style={{ background:'var(--accent-red)' }} />
          </button>

          {/* LIVE / PAPER toggle pill */}
          <button
            onClick={handleModeToggle}
            className="flex items-center rounded-lg overflow-hidden transition-all"
            style={{ border: '1px solid', borderColor: paperActive ? 'rgba(245,158,11,0.5)' : 'rgba(22,163,74,0.5)', fontSize: '10px', fontWeight: 700 }}
            title={paperActive ? 'Switch to Live trading' : 'Switch to Paper trading'}
          >
            <span className="flex items-center gap-1 px-2 py-1 transition-colors"
              style={{ background: !paperActive ? 'rgba(22,163,74,0.18)' : 'transparent', color: !paperActive ? '#16a34a' : 'var(--text-dim)' }}>
              <Zap size={10} /> LIVE
            </span>
            <span className="flex items-center gap-1 px-2 py-1 transition-colors"
              style={{ background: paperActive ? 'rgba(245,158,11,0.18)' : 'transparent', color: paperActive ? 'rgb(245,158,11)' : 'var(--text-dim)' }}>
              <FlaskConical size={10} /> PAPER
            </span>
          </button>

          <Link href="/profile" onClick={() => setActiveNav('profile')}
            className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-md transition-colors hover:bg-white/5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background:'linear-gradient(135deg,#2979ff,#aa00ff)' }}>
              {mounted ? getInitials() : 'AT'}
            </div>
            <span className="hidden xl:block text-xs font-medium" style={{ color:'var(--text-accent)' }}>{mounted ? getFirstName() : 'User'}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

// Indices that have weekly F&O expiries — show EXPIRY badge
const EXPIRY_SYMBOLS = new Set(['NIFTY 50', 'BANKNIFTY', 'SENSEX', 'BANKEX', 'MIDCPNIFTY', 'FINNIFTY']);

const POPUP_STYLE: React.CSSProperties = {
  background: 'var(--bg-surface, #081020)',
  border: '1px solid var(--border-med)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
};

// ── Index chip with hover quick-action menu ────────────────────────────────────
function IndexChip({ symbol, ltp, change, changePercent, isLive: live }: {
  symbol: string; ltp: number | null; change: number | null; changePercent: number | null; isLive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const hasData    = ltp !== null && change !== null && changePercent !== null;
  const pos        = hasData ? (change ?? 0) >= 0 : true;
  const color      = pos ? 'var(--accent-green)' : 'var(--accent-red)';
  const absChange  = hasData ? Math.abs(change!).toFixed(2) : '--';
  const absPct     = hasData ? Math.abs(changePercent!).toFixed(2) : '--';
  const showExpiry = EXPIRY_SYMBOLS.has(symbol);

  return (
    <div ref={ref} className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>

      {/* ── chip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col px-3 py-1.5 rounded-lg cursor-pointer select-none"
        style={{
          background: open ? 'rgba(41,121,255,0.08)' : 'var(--card-inner-bg)',
          border: `1px solid ${open ? 'rgba(41,121,255,0.35)' : 'var(--card-inner-border)'}`,
          minWidth: 140,
        }}>
        {/* Row 1 — symbol + optional badge */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-bold leading-none" style={{ color:'var(--text-accent)' }}>
            {symbol}
          </span>
          {showExpiry && (
            <span className="text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide leading-none"
              style={{ background:'rgba(239,68,68,0.15)', color:'rgb(239,68,68)', border:'1px solid rgba(239,68,68,0.3)' }}>
              EXPIRY
            </span>
          )}
          {live && <span className="w-1.5 h-1.5 rounded-full animate-pulse ml-auto flex-shrink-0" style={{ background:'var(--accent-green)' }} />}
        </div>
        {/* Row 2 — ltp + change */}
        <div className="flex items-center gap-1">
          {hasData ? (
            <>
              <span className="font-mono font-bold text-[12px]" style={{ color:'var(--text-bright)' }}>
                {formatNumber(ltp!)}
              </span>
              <span className="font-semibold text-[10px] flex items-center gap-0.5" style={{ color }}>
                {pos ? '▲' : '▼'} {pos ? '+' : '-'}{absChange} ({pos ? '+' : '-'}{absPct}%)
              </span>
            </>
          ) : (
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-label)' }}>
              Waiting for Angel One…
            </span>
          )}
        </div>
      </div>

      {/* ── hover quick-action dropdown ───────────────────────────────── */}
      {open && (
        <div className="absolute top-full left-0 z-[100] pt-1" style={{ minWidth: 220 }}>
          <div className="rounded-xl overflow-hidden py-1" style={POPUP_STYLE}>
            {CHIP_ACTIONS.map(({ label, href, Icon }) => (
              <Link key={label} href={`${href}&symbol=${encodeURIComponent(symbol)}`}
                className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <Icon size={14} style={{ color: 'var(--text-dim)' }} />
                {label}
                <ChevronRight size={10} className="ml-auto" style={{ color:'var(--text-label)' }} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Diamond icons for pin state ────────────────────────────────────────────────
function DiamondFilled() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L13 7L7 13L1 7L7 1Z" fill="#2979ff" stroke="#2979ff" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
function DiamondOutline() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L13 7L7 13L1 7L7 1Z" fill="none" stroke="var(--text-dim)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
