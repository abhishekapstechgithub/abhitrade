'use client';
import { useState, useEffect, useCallback } from 'react';
import { BarChart2, TrendingUp, PieChart, Calculator, Zap, Bell, BookOpen, FileText,
         Filter, Activity, Globe, Calendar, AlignLeft, Layers, RefreshCw,
         Database, CheckCircle, AlertCircle, Clock, Wifi } from 'lucide-react';
import Link from 'next/link';
import { ElementType } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_STRATEGY_API_URL ?? '';

function authHeaders() {
  if (typeof window === 'undefined') return {};
  const t = sessionStorage.getItem('tk_access_token') ?? localStorage.getItem('tk_access_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const TOOL_GROUPS: { title: string; col: string; tools: { label: string; icon: ElementType; href: string; desc: string }[] }[] = [
  {
    title: 'Trading Tools', col: '41,121,255',
    tools: [
      { label:'Option Chain',      icon:BarChart2,    href:'/?tab=option-chain',   desc:'Live OI, IV, Greeks' },
      { label:'Strategy Builder',  icon:Layers,       href:'/strategy/builder',    desc:'Build option strategies' },
      { label:'OI Charts',         icon:Activity,     href:'#',                    desc:'Open interest analysis' },
      { label:'IV Chart',          icon:TrendingUp,   href:'#',                    desc:'Implied volatility trends' },
      { label:'Greeks Calculator', icon:Calculator,   href:'/tools/calculators',   desc:'Delta, Gamma, Theta, Vega' },
      { label:'P&L Calculator',    icon:Calculator,   href:'/tools/calculators',   desc:'Strategy P&L scenarios' },
      { label:'Brokerage Calc',    icon:Calculator,   href:'/tools/calculators',   desc:'Calculate trading costs' },
      { label:'Margin Calculator', icon:Calculator,   href:'/tools/calculators',   desc:'F&O margin requirements' },
      { label:'Risk-Reward',       icon:BarChart2,    href:'#',                    desc:'Trade risk analysis' },
      { label:'Payoff Chart',      icon:TrendingUp,   href:'#',                    desc:'Options payoff visualization' },
      { label:'Volatility Surface',icon:Globe,        href:'#',                    desc:'3D IV surface' },
      { label:'Market Depth',      icon:AlignLeft,    href:'#',                    desc:'Level 2 order book' },
    ],
  },
  {
    title: 'Screening & Analysis', col: '0,212,255',
    tools: [
      { label:'Stock Screener',    icon:Filter,       href:'/tools/screener',      desc:'Filter stocks by criteria' },
      { label:'Options Screener',  icon:Filter,       href:'#',                    desc:'Screen option contracts' },
      { label:'Market Heatmap',    icon:PieChart,     href:'/tools/heatmap',       desc:'Visualize market movement' },
      { label:'Sector Heatmap',    icon:PieChart,     href:'/?tab=composition',    desc:'Sector performance map' },
      { label:'Technical Signals', icon:Zap,          href:'#',                    desc:'RSI, MACD signals' },
      { label:'Event Calendar',    icon:Calendar,     href:'/tools/calendar',      desc:'Upcoming market events' },
      { label:'Earnings Calendar', icon:Calendar,     href:'/tools/calendar',      desc:'Company results schedule' },
      { label:'FII/DII Flow',      icon:Activity,     href:'#',                    desc:'Institutional activity' },
    ],
  },
  {
    title: 'Trading Utilities', col: '170,0,255',
    tools: [
      { label:'Basket Creator',  icon:Layers,   href:'/tools/basket',     desc:'Multi-leg order baskets' },
      { label:'Alert Manager',   icon:Bell,     href:'/tools/alerts',     desc:'Price & event alerts' },
      { label:'Trade Journal',   icon:BookOpen, href:'/tools/journal',    desc:'Log and review trades' },
      { label:'Export Report',   icon:FileText, href:'#',                 desc:'Download trade reports' },
      { label:'Security Master', icon:FileText, href:'/security-master',  desc:'Upload NSE/BSE files' },
    ],
  },
];

interface SyncStatus {
  total_instruments: number;
  last_sync: string | null;
  sync_running: boolean;
}

function MarketDataPanel() {
  const [status, setStatus]     = useState<SyncStatus | null>(null);
  const [syncing, setSyncing]   = useState(false);
  const [message, setMessage]   = useState<{ text: string; ok: boolean } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/scrip/sync/status`, { headers: authHeaders() });
      if (res.ok) setStatus(await res.json());
    } catch { /* strategy-api offline */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const triggerSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/scrip/sync`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      setMessage({ text: data.message ?? data.status, ok: res.ok });
      setTimeout(fetchStatus, 3000);
    } catch (e) {
      setMessage({ text: (e as Error).message, ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const lastSync = status?.last_sync
    ? new Date(status.last_sync).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
    : 'Never';

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(41,121,255,0.12)', border: '1px solid rgba(41,121,255,0.25)' }}>
            <Wifi size={16} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>Angel One Market Data</div>
            <div className="text-[11px]" style={{ color: 'var(--text-label)' }}>
              Instrument master — NSE, BSE, NFO, BFO, MCX
            </div>
          </div>
        </div>
        <button onClick={fetchStatus}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Stats + button */}
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl p-3" style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Database size={11} style={{ color: 'var(--accent-blue)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Instruments</span>
            </div>
            <div className="text-lg font-bold font-mono" style={{ color: 'var(--text-bright)' }}>
              {status ? status.total_instruments.toLocaleString('en-IN') : '—'}
            </div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={11} style={{ color: 'var(--text-label)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Last Sync</span>
            </div>
            <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{lastSync}</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Activity size={11} style={{ color: 'var(--text-label)' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Status</span>
            </div>
            <div className="flex items-center gap-1.5">
              {status?.sync_running ? (
                <>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f59e0b' }} />
                  <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>Syncing…</span>
                </>
              ) : status ? (
                <>
                  <span className="w-2 h-2 rounded-full" style={{ background: '#16a34a' }} />
                  <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>Ready</span>
                </>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-label)' }}>—</span>
              )}
            </div>
          </div>
        </div>

        {/* Sync button */}
        <button
          onClick={triggerSync}
          disabled={syncing || status?.sync_running}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg,#2979ff,#0043ca)' }}>
          <RefreshCw size={14} className={(syncing || status?.sync_running) ? 'animate-spin' : ''} />
          {syncing ? 'Starting sync…' : status?.sync_running ? 'Sync in progress…' : 'Sync Angel One Instruments'}
        </button>

        {message && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-xs"
            style={{
              background: message.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: message.ok ? '#16a34a' : '#dc2626',
              border: `1px solid ${message.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}>
            {message.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {message.text}
          </div>
        )}

        <p className="text-[10px] mt-3 leading-relaxed" style={{ color: 'var(--text-label)' }}>
          Downloads the instrument master from Angel One CDN (no API key needed) —
          populates all NSE/BSE/NFO equities, futures, and options into the database.
          Runs automatically every day at <strong>08:30 IST</strong> on weekdays.
          Use this button to force a manual refresh anytime.
        </p>
      </div>
    </div>
  );
}

export default function ToolsPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-6">
      <div>
        <h1 className="text-lg font-bold" style={{ color:'var(--text-bright)' }}>Tools</h1>
        <p className="text-xs mt-0.5" style={{ color:'var(--text-label)' }}>Analytics, calculators, screeners, and utilities</p>
      </div>

      {/* Angel One Market Data — top of page */}
      <MarketDataPanel />

      {TOOL_GROUPS.map(group => (
        <div key={group.title}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1" style={{ background:`rgba(${group.col},0.2)` }} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest px-2" style={{ color:`rgb(${group.col})` }}>{group.title}</h2>
            <div className="h-px flex-1" style={{ background:`rgba(${group.col},0.2)` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
            {group.tools.map(tool => {
              const Icon = tool.icon;
              return (
                <Link key={tool.label} href={tool.href}>
                  <div className="glass card-hover rounded-xl p-3 h-full cursor-pointer transition-all"
                    style={{ borderColor:`rgba(${group.col},0.15)` }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor=`rgba(${group.col},0.4)`)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor=`rgba(${group.col},0.15)`)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                      style={{ background:`rgba(${group.col},0.12)`, border:`1px solid rgba(${group.col},0.2)` }}>
                      <Icon size={16} style={{ color:`rgb(${group.col})` }} />
                    </div>
                    <div className="text-xs font-bold" style={{ color:'var(--text-secondary)' }}>{tool.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color:'var(--text-label)' }}>{tool.desc}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
