'use client';
import { StrategyFilters } from '../types/strategy.types';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../constants/strategy.constants';

interface Props {
  filters: StrategyFilters;
  total:   number;
  shown:   number;
  onChange: (f: Partial<StrategyFilters>) => void;
}

const STATUS_OPTS = ['all', 'saved', 'deployed', 'simulating', 'expired'] as const;

export function StrategyFilterBar({ filters, total, shown, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Symbol search */}
      <input
        type="text"
        placeholder="Filter by symbol…"
        value={filters.symbol}
        onChange={e => onChange({ symbol: e.target.value })}
        className="h-8 px-3 rounded-lg text-xs outline-none"
        style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)', width: 160 }}
      />

      {/* Category pills */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange({ category: 'all' })}
          className="h-7 px-3 rounded-full text-[11px] font-semibold transition-all"
          style={filters.category === 'all'
            ? { background: 'rgba(41,121,255,0.15)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.4)' }
            : { background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--card-inner-border)' }}>
          All
        </button>
        {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map(cat => {
          const c = CATEGORY_COLORS[cat];
          const active = filters.category === cat;
          return (
            <button key={cat}
              onClick={() => onChange({ category: cat })}
              className="h-7 px-3 rounded-full text-[11px] font-semibold transition-all"
              style={active
                ? { background: c.bg, color: c.text, border: `1px solid ${c.border}` }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--card-inner-border)' }}>
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* Status select */}
      <select
        value={filters.status}
        onChange={e => onChange({ status: e.target.value as StrategyFilters['status'] })}
        className="h-8 px-2 rounded-lg text-xs outline-none"
        style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}>
        {STATUS_OPTS.map(s => (
          <option key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>

      {/* Count */}
      <span className="ml-auto text-[11px]" style={{ color: 'var(--text-label)' }}>
        {shown} of {total}
      </span>
    </div>
  );
}
