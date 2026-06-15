'use client';
import { Copy, Play, Pencil, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Strategy } from '../types/strategy.types';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../constants/strategy.constants';
import { formatPnl } from '../utils/strategy.utils';

interface Props {
  strategy: Strategy;
  onClone:  (id: string) => void;
  onDeploy: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit:   (id: string) => void;
}

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--card-bg)',
  border:     '1px solid var(--card-border)',
  borderRadius: 12,
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  transition: 'border-color 0.15s',
};

export function StrategyCard({ strategy: s, onClone, onDeploy, onDelete, onEdit }: Props) {
  const cat     = CATEGORY_COLORS[s.category];
  const isProfit = (s.netPremium ?? 0) >= 0;

  const PnlIcon = s.maxProfit === null
    ? TrendingUp
    : s.maxLoss === null
    ? TrendingDown
    : Minus;

  return (
    <div style={CARD_STYLE}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(41,121,255,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-border)')}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm font-bold truncate" style={{ color: 'var(--text-bright)' }}>{s.name}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-accent)' }}>{s.symbol}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>·</span>
            <span className="text-[11px]" style={{ color: 'var(--text-label)' }}>{s.legs.length} leg{s.legs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: cat.bg, color: cat.text, border: `1px solid ${cat.border}` }}>
          {CATEGORY_LABELS[s.category]}
        </span>
      </div>

      {/* P&L grid */}
      <div className="grid grid-cols-2 gap-2">
        <PnlCell label="Max Profit" value={formatPnl(s.maxProfit)}  positive />
        <PnlCell label="Max Loss"   value={formatPnl(s.maxLoss)}    positive={false} />
        <PnlCell label="BEP Lower"  value={s.breakevenLow  != null ? `₹${s.breakevenLow.toFixed(0)}`  : '—'} />
        <PnlCell label="BEP Upper"  value={s.breakevenHigh != null ? `₹${s.breakevenHigh.toFixed(0)}` : '—'} />
      </div>

      {/* Net premium */}
      <div className="flex items-center gap-1.5 text-xs">
        <PnlIcon size={12} style={{ color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        <span style={{ color: 'var(--text-label)' }}>Net Premium:</span>
        <span className="font-bold" style={{ color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isProfit ? '+' : ''}{formatPnl(s.netPremium)}
        </span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-label)' }}>
          {new Date(s.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--panel-divider)' }}>
        <ActionBtn icon={<Play size={12} />}   label="Deploy" onClick={() => onDeploy(s.id)} accent />
        <ActionBtn icon={<Pencil size={12} />} label="Edit"   onClick={() => onEdit(s.id)} />
        <ActionBtn icon={<Copy size={12} />}   label="Clone"  onClick={() => onClone(s.id)} />
        <ActionBtn icon={<Trash2 size={12} />} label="Delete" onClick={() => onDelete(s.id)} danger />
      </div>
    </div>
  );
}

function PnlCell({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined
    ? 'var(--text-secondary)'
    : positive
    ? 'var(--accent-green)'
    : 'var(--accent-red)';
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'var(--card-inner-bg)' }}>
      <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-label)' }}>{label}</div>
      <div className="text-xs font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, accent, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; danger?: boolean;
}) {
  const color = danger ? 'var(--accent-red)' : accent ? 'var(--accent-cyan)' : 'var(--text-dim)';
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all"
      style={{ color, background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      {icon}{label}
    </button>
  );
}
