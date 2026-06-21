'use client';

import { Save, Trash2, CheckCircle, AlertCircle, AlertTriangle, Code2, RotateCcw } from 'lucide-react';
import type { CanvasMeta, ValidationResult } from '../types/builder.types';

const SYMBOLS   = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK'];
const EXCHANGES = ['NSE', 'BSE'] as const;
const CATS      = ['bullish', 'bearish', 'neutral', 'income', 'hedged'] as const;
const CAT_COLOR: Record<string, string> = {
  bullish: '#10b981', bearish: '#ef4444', neutral: '#2979ff', income: '#f59e0b', hedged: '#aa00ff',
};

interface Props {
  meta:         CanvasMeta;
  blockCount:   number;
  connCount:    number;
  dirty:        boolean;
  validation:   ValidationResult | null;
  showJson:     boolean;
  onMetaChange: (patch: Partial<CanvasMeta>) => void;
  onValidate:   () => void;
  onClear:      () => void;
  onSave:       () => void;
  onToggleJson: () => void;
}

export function BuilderToolbar({
  meta, blockCount, connCount, dirty, validation,
  showJson, onMetaChange, onValidate, onClear, onSave, onToggleJson,
}: Props) {
  const errCount  = validation?.errors.filter(e => e.severity === 'error').length ?? 0;
  const warnCount = validation?.errors.filter(e => e.severity === 'warning').length ?? 0;

  const selectStyle: React.CSSProperties = {
    height: 30,
    padding: '0 8px',
    borderRadius: 8,
    fontSize: 11,
    outline: 'none',
    background: 'var(--card-inner-bg)',
    border: '1px solid var(--card-inner-border)',
    color: 'var(--text-secondary)',
  };

  return (
    <div
      className="flex items-center gap-2 px-3 shrink-0"
      style={{
        height: 48,
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--panel-divider)',
      }}
    >
      {/* Strategy name */}
      <input
        value={meta.name}
        onChange={e => onMetaChange({ name: e.target.value })}
        placeholder="Strategy name…"
        className="h-8 px-3 rounded-lg text-sm font-semibold outline-none"
        style={{
          width: 220,
          background: 'var(--card-inner-bg)',
          border: `1px solid ${dirty ? 'rgba(41,121,255,0.4)' : 'var(--card-inner-border)'}`,
          color: 'var(--text-bright)',
        }}
      />

      {/* Symbol */}
      <select value={meta.symbol} onChange={e => onMetaChange({ symbol: e.target.value })} style={selectStyle}>
        {SYMBOLS.map(s => <option key={s}>{s}</option>)}
      </select>

      {/* Exchange */}
      <select value={meta.exchange} onChange={e => onMetaChange({ exchange: e.target.value as 'NSE' | 'BSE' })} style={selectStyle}>
        {EXCHANGES.map(x => <option key={x}>{x}</option>)}
      </select>

      {/* Category */}
      <select
        value={meta.category}
        onChange={e => onMetaChange({ category: e.target.value as CanvasMeta['category'] })}
        style={{ ...selectStyle, color: CAT_COLOR[meta.category] ?? 'var(--text-secondary)' }}
      >
        {CATS.map(c => <option key={c} value={c} style={{ color: CAT_COLOR[c] }}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
      </select>

      {/* Stats */}
      <div className="flex items-center gap-3 ml-2 px-3 py-1 rounded-lg"
        style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
        <StatChip label="Blocks" value={blockCount} />
        <div className="w-px h-4" style={{ background: 'var(--panel-divider)' }} />
        <StatChip label="Wires"  value={connCount}  />
      </div>

      {/* Validation badge */}
      {validation && (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]"
          style={{
            background: validation.valid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${validation.valid ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: validation.valid ? '#10b981' : '#ef4444',
          }}>
          {validation.valid
            ? <><CheckCircle size={12} /> Valid</>
            : <><AlertCircle size={12} /> {errCount} error{errCount !== 1 ? 's' : ''}</>
          }
          {warnCount > 0 && (
            <span className="ml-1 flex items-center gap-0.5" style={{ color: '#f59e0b' }}>
              <AlertTriangle size={11} /> {warnCount}
            </span>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={onToggleJson}
        className="flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] transition-all"
        style={{
          background: showJson ? 'rgba(41,121,255,0.12)' : 'var(--card-inner-bg)',
          border: `1px solid ${showJson ? 'rgba(41,121,255,0.35)' : 'var(--card-inner-border)'}`,
          color: showJson ? '#2979ff' : 'var(--text-dim)',
        }}
      >
        <Code2 size={12} /> JSON
      </button>

      <button
        onClick={onValidate}
        className="flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] transition-all"
        style={{
          background: 'var(--card-inner-bg)',
          border: '1px solid var(--card-inner-border)',
          color: 'var(--text-dim)',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#f59e0b'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--card-inner-border)'; }}
      >
        <CheckCircle size={12} /> Validate
      </button>

      <button
        onClick={onClear}
        className="flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] transition-all"
        style={{
          background: 'var(--card-inner-bg)',
          border: '1px solid var(--card-inner-border)',
          color: 'var(--text-dim)',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--card-inner-border)'; }}
      >
        <RotateCcw size={12} /> Clear
      </button>

      <button
        onClick={onSave}
        className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] font-semibold transition-all"
        style={{
          background: dirty
            ? 'linear-gradient(135deg,rgb(41,121,255),rgb(0,212,255))'
            : 'var(--card-inner-bg)',
          color: dirty ? '#fff' : 'var(--text-dim)',
          border: dirty ? 'none' : '1px solid var(--card-inner-border)',
        }}
      >
        <Save size={12} /> {dirty ? 'Save' : 'Saved'}
      </button>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{label}</span>
      <span className="text-[11px] font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}
