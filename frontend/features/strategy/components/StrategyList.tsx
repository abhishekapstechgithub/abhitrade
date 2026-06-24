'use client';
import { Loader2, AlertCircle, LayoutGrid } from 'lucide-react';
import { Strategy } from '../types/strategy.types';
import { StrategyCard } from './StrategyCard';

interface Props {
  strategies: Strategy[];
  loading:    boolean;
  error:      string | null;
  onClone:    (id: string) => void;
  onDeploy:   (id: string) => void;
  onDelete:   (id: string) => void;
  onEdit:     (id: string) => void;
}

export function StrategyList({ strategies, loading, error, onClone, onDeploy, onDelete, onEdit }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2" style={{ color: 'var(--text-dim)' }}>
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Loading strategies…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 gap-2" style={{ color: 'var(--accent-red)' }}>
        <AlertCircle size={18} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (!strategies.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <LayoutGrid size={40} style={{ color: 'var(--text-label)' }} strokeWidth={1} />
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No strategies found</p>
        <p className="text-xs" style={{ color: 'var(--text-label)' }}>Use the builder above to create your first strategy</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {strategies.map(s => (
        <StrategyCard key={s.id} strategy={s} onClone={onClone} onDeploy={onDeploy} onDelete={onDelete} onEdit={onEdit} />
      ))}
    </div>
  );
}
