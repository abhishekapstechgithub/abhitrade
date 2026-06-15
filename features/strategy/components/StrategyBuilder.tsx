'use client';
import { Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import { useStrategyBuilder } from '../hooks/useStrategyBuilder';
import { CATEGORY_LABELS, FO_SYMBOLS, PRESET_STRATEGIES } from '../constants/strategy.constants';
import { formatPnl } from '../utils/strategy.utils';
import { StrategyCategory } from '../types/strategy.types';

interface Props {
  onSaved?: () => void;
}

export function StrategyBuilder({ onSaved }: Props) {
  const {
    name, setName, category, setCategory,
    legs, addLeg, removeLeg, updateLeg,
    analytics, saving, error, save, reset,
  } = useStrategyBuilder();

  const handleSave = async () => {
    await save();
    onSaved?.();
  };

  return (
    <div className="rounded-xl p-5 flex flex-col gap-5"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>

      {/* Title row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>Strategy Builder</h3>
        <button onClick={reset} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md"
          style={{ color: 'var(--text-dim)', background: 'var(--card-inner-bg)' }}>
          <RotateCcw size={11} /> Reset
        </button>
      </div>

      {/* Name + Category */}
      <div className="flex flex-wrap gap-3">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Strategy name…"
          className="flex-1 min-w-[180px] h-9 px-3 rounded-lg text-sm outline-none"
          style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value as StrategyCategory)}
          className="h-9 px-3 rounded-lg text-sm outline-none"
          style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}>
          {(Object.keys(CATEGORY_LABELS) as StrategyCategory[]).map(c => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {/* Preset quick-fill */}
      <div>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-label)' }}>Quick presets</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_STRATEGIES.map(p => (
            <button key={p.name}
              onClick={() => { setName(p.name); setCategory(p.category); }}
              className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,121,255,0.4)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Legs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold" style={{ color: 'var(--text-label)' }}>LEGS</p>
          <button onClick={addLeg}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors"
            style={{ background: 'rgba(41,121,255,0.1)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.25)' }}>
            <Plus size={11} /> Add Leg
          </button>
        </div>

        {legs.map((leg, i) => (
          <div key={leg.id} className="grid gap-2 p-3 rounded-lg"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', gridTemplateColumns: 'auto auto 1fr auto auto auto auto' }}>

            {/* Leg index */}
            <span className="flex items-center text-[11px] font-bold w-5" style={{ color: 'var(--text-label)' }}>L{i + 1}</span>

            {/* BUY/SELL */}
            <select value={leg.action} onChange={e => updateLeg(leg.id, { action: e.target.value as 'BUY' | 'SELL' })}
              className="h-7 px-2 rounded text-xs outline-none font-bold"
              style={{ background: leg.action === 'BUY' ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)', color: leg.action === 'BUY' ? '#16a34a' : '#dc2626', border: 'none' }}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>

            {/* Symbol */}
            <select className="h-7 px-2 rounded text-xs outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }}>
              {FO_SYMBOLS.map(s => <option key={s}>{s}</option>)}
            </select>

            {/* CE/PE */}
            <select value={leg.optionType} onChange={e => updateLeg(leg.id, { optionType: e.target.value as 'CE' | 'PE' })}
              className="h-7 px-2 rounded text-xs outline-none font-semibold"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: leg.optionType === 'CE' ? '#2979ff' : '#aa00ff' }}>
              <option value="CE">CE</option>
              <option value="PE">PE</option>
            </select>

            {/* Strike */}
            <input type="number" placeholder="Strike" value={leg.strike || ''}
              onChange={e => updateLeg(leg.id, { strike: Number(e.target.value) })}
              className="h-7 w-24 px-2 rounded text-xs outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }} />

            {/* Premium */}
            <input type="number" placeholder="Premium" value={leg.premium || ''}
              onChange={e => updateLeg(leg.id, { premium: Number(e.target.value) })}
              className="h-7 w-20 px-2 rounded text-xs outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-secondary)' }} />

            {/* Remove */}
            {legs.length > 1 && (
              <button onClick={() => removeLeg(leg.id)} className="flex items-center justify-center w-7 h-7 rounded"
                style={{ color: 'var(--accent-red)', background: 'rgba(220,38,38,0.08)' }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Analytics summary */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Net Premium',  value: formatPnl(analytics.netPremium),   pos: analytics.netPremium >= 0 },
          { label: 'Max Profit',   value: formatPnl(analytics.maxProfit),    pos: true  },
          { label: 'Max Loss',     value: formatPnl(analytics.maxLoss),      pos: false },
          { label: 'BEP',          value: analytics.breakevenLow != null ? `₹${analytics.breakevenLow.toFixed(0)}` : '—', pos: undefined },
        ].map(({ label, value, pos }) => (
          <div key={label} className="rounded-lg px-3 py-2 text-center" style={{ background: 'var(--card-inner-bg)' }}>
            <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-label)' }}>{label}</div>
            <div className="text-xs font-bold"
              style={{ color: pos === undefined ? 'var(--text-secondary)' : pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Error + Save */}
      {error && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>}
      <button onClick={handleSave} disabled={saving}
        className="flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#2979ff,#00d4ff)', color: '#fff' }}>
        <Save size={14} />{saving ? 'Saving…' : 'Save Strategy'}
      </button>
    </div>
  );
}
