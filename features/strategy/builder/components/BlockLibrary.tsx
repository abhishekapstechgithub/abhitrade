'use client';

import { useState } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { BLOCK_LIBRARY, BLOCK_GROUPS } from '../constants/builder.constants';
import type { BlockSubtype, BlockDef } from '../types/builder.types';

interface Props {
  onDragStart: (subtype: BlockSubtype, e: React.DragEvent) => void;
}

export function BlockLibrary({ onDragStart }: Props) {
  const [query,    setQuery]    = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    indicator:  true,
    condition:  false,
    entry_rule: false,
    exit_rule:  false,
    option_leg: false,
    filter:     false,
  });

  const toggle = (type: string) =>
    setExpanded(prev => ({ ...prev, [type]: !prev[type] }));

  const filtered = query.trim()
    ? BLOCK_LIBRARY.filter(
        d =>
          d.label.toLowerCase().includes(query.toLowerCase()) ||
          d.description.toLowerCase().includes(query.toLowerCase()),
      )
    : null;

  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: 232,
        background: 'var(--card-bg)',
        borderRight: '1px solid var(--panel-divider)',
      }}
    >
      {/* Header */}
      <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: 'var(--text-label)' }}>
          Block Library
        </p>
        <div className="flex items-center gap-2 h-7 px-2 rounded-md"
          style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
          <Search size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search blocks…"
            className="flex-1 text-[11px] bg-transparent outline-none"
            style={{ color: 'var(--text-secondary)' }}
          />
        </div>
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-1">

        {/* Flat search results */}
        {filtered ? (
          <>
            {filtered.length === 0 && (
              <p className="text-[11px] text-center py-6" style={{ color: 'var(--text-dim)' }}>
                No blocks match
              </p>
            )}
            {filtered.map(def => (
              <LibraryItem key={def.subtype} def={def} onDragStart={onDragStart} />
            ))}
          </>
        ) : (
          /* Grouped view */
          BLOCK_GROUPS.map(group => {
            const items = BLOCK_LIBRARY.filter(d => d.type === group.type);
            const open  = expanded[group.type];
            return (
              <div key={group.type}>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors"
                  style={{ borderBottom: '1px solid var(--row-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => toggle(group.type)}
                >
                  {open
                    ? <ChevronDown  size={11} style={{ color: group.color, flexShrink: 0 }} />
                    : <ChevronRight size={11} style={{ color: group.color, flexShrink: 0 }} />
                  }
                  <span className="flex-1 text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {group.label}
                  </span>
                  <span className="text-[9px] px-1.5 py-px rounded-full"
                    style={{ background: `${group.color}22`, color: group.color }}>
                    {items.length}
                  </span>
                </button>
                {open && items.map(def => (
                  <LibraryItem key={def.subtype} def={def} onDragStart={onDragStart} />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 text-[10px]" style={{ borderTop: '1px solid var(--panel-divider)', color: 'var(--text-dim)' }}>
        Drag blocks onto the canvas
      </div>
    </aside>
  );
}

// ─── Single draggable library item ───────────────────────────────────────────

function LibraryItem({ def, onDragStart }: { def: BlockDef; onDragStart: Props['onDragStart'] }) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('blockSubtype', def.subtype);
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart(def.subtype, e);
      }}
      className="flex items-center gap-2.5 px-3 py-2 mx-1 my-0.5 rounded-lg cursor-grab active:cursor-grabbing select-none transition-all"
      style={{ border: '1px solid transparent' }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `${def.color}12`;
        e.currentTarget.style.border     = `1px solid ${def.color}30`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.border     = '1px solid transparent';
      }}
    >
      {/* Icon badge */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold"
        style={{ background: `${def.color}1a`, color: def.color }}
      >
        {def.icon}
      </div>

      {/* Label + description */}
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-tight truncate"
          style={{ color: 'var(--text-secondary)' }}>
          {def.label}
        </p>
        <p className="text-[10px] leading-tight truncate"
          style={{ color: 'var(--text-dim)' }}>
          {def.inputCount}→{def.outputCount} · {def.paramDefs.length} param{def.paramDefs.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  );
}
