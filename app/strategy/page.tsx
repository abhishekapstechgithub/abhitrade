'use client';
import { useState } from 'react';
import { GitBranch, Plus, X } from 'lucide-react';
import {
  StrategyBuilder,
  StrategyList,
  StrategyFilterBar,
  useStrategies,
} from '@/features/strategy';

export default function StrategyPage() {
  const [showBuilder, setShowBuilder] = useState(false);
  const { strategies, total, loading, error, filters, setFilters, remove, clone, deploy, reload } = useStrategies();

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 flex flex-col gap-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,rgba(41,121,255,0.2),rgba(0,212,255,0.2))', border: '1px solid rgba(41,121,255,0.3)' }}>
            <GitBranch size={18} style={{ color: '#2979ff' }} />
          </div>
          <div>
            <h1 className="text-base font-bold" style={{ color: 'var(--text-bright)' }}>Strategy</h1>
            <p className="text-xs" style={{ color: 'var(--text-label)' }}>Build, save, and deploy options strategies</p>
          </div>
        </div>
        <button
          onClick={() => setShowBuilder(v => !v)}
          className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-xs font-semibold transition-all"
          style={{ background: showBuilder ? 'var(--card-inner-bg)' : 'linear-gradient(135deg,#2979ff,#00d4ff)', color: showBuilder ? 'var(--text-dim)' : '#fff', border: showBuilder ? '1px solid var(--card-inner-border)' : 'none' }}>
          {showBuilder ? <><X size={13} /> Close Builder</> : <><Plus size={13} /> New Strategy</>}
        </button>
      </div>

      {/* Builder — toggleable */}
      {showBuilder && (
        <StrategyBuilder onSaved={() => { setShowBuilder(false); reload(); }} />
      )}

      {/* Filters */}
      <StrategyFilterBar
        filters={filters}
        total={total}
        shown={strategies.length}
        onChange={patch => setFilters(prev => ({ ...prev, ...patch }))}
      />

      {/* List */}
      <StrategyList
        strategies={strategies}
        loading={loading}
        error={error}
        onClone={clone}
        onDeploy={deploy}
        onDelete={remove}
        onEdit={id => { void id; /* open edit modal — future */ }}
      />
    </main>
  );
}
