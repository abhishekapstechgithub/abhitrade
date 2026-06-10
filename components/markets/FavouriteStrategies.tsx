'use client';
import { useState } from 'react';
import { Plus, Copy, Trash2, Play, Edit, BarChart2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

const STRATEGIES = [
  {
    id: '1', name: 'Bull Call Spread', symbol: 'NIFTY', expiry: '26 Jun 2026', category: 'bullish',
    legs: 2, maxProfit: 4500, maxLoss: 500, breakevenPoints: [24650], pnlSnapshot: 1200,
  },
  {
    id: '2', name: 'Iron Condor', symbol: 'BANKNIFTY', expiry: '26 Jun 2026', category: 'neutral',
    legs: 4, maxProfit: 3200, maxLoss: 1800, breakevenPoints: [51200, 53400], pnlSnapshot: 800,
  },
  {
    id: '3', name: 'Protective Put', symbol: 'RELIANCE', expiry: '31 Jul 2026', category: 'hedged',
    legs: 2, maxProfit: Infinity, maxLoss: 450, breakevenPoints: [2900], pnlSnapshot: -120,
  },
  {
    id: '4', name: 'Bear Put Spread', symbol: 'NIFTY', expiry: '03 Jul 2026', category: 'bearish',
    legs: 2, maxProfit: 3800, maxLoss: 700, breakevenPoints: [24200], pnlSnapshot: 560,
  },
  {
    id: '5', name: 'Covered Call', symbol: 'TCS', expiry: '26 Jun 2026', category: 'income',
    legs: 2, maxProfit: 2100, maxLoss: Infinity, breakevenPoints: [4080], pnlSnapshot: 650,
  },
];

const CATEGORIES = ['All', 'Bullish', 'Bearish', 'Neutral', 'Hedged', 'Income'];

const B = '41,121,255';
const C = '0,212,255';

const categoryStyle: Record<string, { bg: string; color: string }> = {
  bullish: { bg: 'rgba(var(--gain-rgb),0.12)', color: 'var(--accent-green)'  },
  bearish: { bg: 'rgba(var(--loss-rgb),0.12)', color: 'var(--accent-red)'    },
  neutral: { bg: 'rgba(249,115,22,0.12)',      color: 'rgb(249,115,22)'      },
  hedged:  { bg: 'rgba(139,92,246,0.12)',      color: 'rgb(139,92,246)'      },
  income:  { bg: `rgba(${B},0.12)`,            color: `rgb(${C})`            },
};

const glass = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-divider)',
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
} as const;

export function FavouriteStrategies() {
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = STRATEGIES.filter(s =>
    activeCategory === 'All' || s.category === activeCategory.toLowerCase()
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setActiveCategory(c)}
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-all"
              style={activeCategory === c
                ? { background: `rgba(${B},0.25)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.3)` }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
              {c}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: `rgba(${B},0.25)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.3)` }}>
          <Plus size={13} /> Build New Strategy
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((strategy) => (
          <StrategyCard key={strategy.id} strategy={strategy} />
        ))}
      </div>
    </div>
  );
}

function StrategyCard({ strategy }: { strategy: typeof STRATEGIES[0] }) {
  const isProfit = strategy.pnlSnapshot >= 0;
  const catStyle = categoryStyle[strategy.category] ?? categoryStyle.neutral;

  return (
    <div className="rounded-xl p-4 transition-all" style={glass}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>{strategy.name}</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold"
              style={{ background: catStyle.bg, color: catStyle.color, border: `1px solid ${catStyle.color}30` }}>
              {strategy.category.charAt(0).toUpperCase() + strategy.category.slice(1)}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-label)' }}>
            {strategy.symbol} · {strategy.expiry} · {strategy.legs} legs
          </div>
        </div>
        <div className="text-sm font-bold text-right"
          style={{ color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isProfit ? '+' : ''}{formatCurrency(strategy.pnlSnapshot, true)}
          <div className="text-[10px] font-normal mt-0.5" style={{ color: 'var(--text-label)' }}>P&L</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(var(--gain-rgb),0.08)', border: '1px solid rgba(var(--gain-rgb),0.15)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-label)' }}>Max Profit</div>
          <div className="text-xs font-bold" style={{ color: 'var(--accent-green)' }}>
            {strategy.maxProfit === Infinity ? '∞' : formatCurrency(strategy.maxProfit as number, true)}
          </div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: 'rgba(var(--loss-rgb),0.08)', border: '1px solid rgba(var(--loss-rgb),0.15)' }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-label)' }}>Max Loss</div>
          <div className="text-xs font-bold" style={{ color: 'var(--accent-red)' }}>
            {strategy.maxLoss === Infinity ? '∞' : formatCurrency(strategy.maxLoss as number, true)}
          </div>
        </div>
        <div className="rounded-lg p-2 text-center" style={{ background: `rgba(${B},0.08)`, border: `1px solid rgba(${B},0.2)` }}>
          <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-label)' }}>Breakeven</div>
          <div className="text-xs font-bold" style={{ color: `rgb(${C})` }}>
            {strategy.breakevenPoints.map(b => b.toLocaleString('en-IN')).join(' / ')}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-3" style={{ borderTop: '1px solid var(--panel-divider)' }}>
        <button className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: `rgba(${B},0.2)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.25)` }}>
          <Play size={11} /> Deploy
        </button>
        {[
          { icon: Edit, label: 'Edit' },
          { icon: BarChart2, label: 'Sim' },
          { icon: Copy, label: '' },
        ].map(({ icon: Icon, label }) => (
          <button key={label || 'copy'}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
            <Icon size={11} /> {label}
          </button>
        ))}
        <button className="flex items-center justify-center p-1.5 rounded-lg text-xs"
          style={{ background: 'rgba(var(--loss-rgb),0.08)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
