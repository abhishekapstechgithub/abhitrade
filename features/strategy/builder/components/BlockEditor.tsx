'use client';

import { X, Trash2 } from 'lucide-react';
import { BLOCK_LIBRARY, TYPE_BG } from '../constants/builder.constants';
import type { CanvasBlock, ParamDef } from '../types/builder.types';

interface Props {
  block:          CanvasBlock;
  onChange:       (params: Record<string, string | number | boolean>) => void;
  onLabelChange:  (label: string) => void;
  onDelete:       () => void;
  onClose:        () => void;
}

export function BlockEditor({ block, onChange, onLabelChange, onDelete, onClose }: Props) {
  const def = BLOCK_LIBRARY.find(d => d.subtype === block.subtype);
  if (!def) return null;

  const updateParam = (key: string, value: string | number | boolean) => {
    onChange({ [key]: value });
  };

  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: 272,
        background: 'var(--card-bg)',
        borderLeft: '1px solid var(--panel-divider)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{
          background: TYPE_BG[block.type],
          borderBottom: `1px solid ${block.color}28`,
        }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0"
          style={{ background: `${block.color}22`, color: block.color }}
        >
          {def.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: block.color }}>
            {block.type.replace(/_/g, ' ')}
          </p>
          <p className="text-xs font-bold truncate" style={{ color: 'var(--text-bright)' }}>
            {block.label}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
        >
          <X size={13} />
        </button>
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-4">

        {/* Description */}
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          {def.description}
        </p>

        {/* Custom label */}
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1.5"
            style={{ color: 'var(--text-label)' }}>
            Display name
          </label>
          <input
            value={block.customLabel}
            onChange={e => onLabelChange(e.target.value)}
            className="w-full h-8 px-2.5 rounded-lg text-xs outline-none"
            style={{
              background: 'var(--card-inner-bg)',
              border: '1px solid var(--card-inner-border)',
              color: 'var(--text-secondary)',
            }}
          />
        </div>

        {/* Params */}
        {def.paramDefs.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide mb-2"
              style={{ color: 'var(--text-label)' }}>
              Parameters
            </p>
            <div className="space-y-2.5">
              {def.paramDefs.map(pd => (
                <ParamField
                  key={pd.key}
                  def={pd}
                  value={block.params[pd.key] ?? pd.defaultValue}
                  onChange={val => updateParam(pd.key, val)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Port info */}
        <div className="rounded-lg p-2.5" style={{ background: 'var(--card-inner-bg)' }}>
          <p className="text-[10px] font-semibold mb-1.5" style={{ color: 'var(--text-label)' }}>
            Ports
          </p>
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full border-2" style={{ borderColor: block.color, background: 'transparent' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {block.inputCount} input{block.inputCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: block.color }} />
              <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                {block.outputCount} output{block.outputCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Block ID (debug) */}
        <p className="text-[9px] font-mono" style={{ color: 'var(--text-dim)' }}>
          id: {block.id}
        </p>
      </div>

      {/* Footer — delete */}
      <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--panel-divider)' }}>
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-all"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
        >
          <Trash2 size={12} /> Delete block
        </button>
      </div>
    </aside>
  );
}

// ─── Individual parameter field ───────────────────────────────────────────────

function ParamField({
  def, value, onChange,
}: {
  def:      ParamDef;
  value:    string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const baseInput: React.CSSProperties = {
    background: 'var(--card-inner-bg)',
    border:     '1px solid var(--card-inner-border)',
    color:      'var(--text-secondary)',
    borderRadius: 8,
    fontSize:   12,
    width:      '100%',
    outline:    'none',
    height:     30,
    padding:    '0 8px',
  };

  return (
    <div>
      <label className="flex items-center justify-between mb-1">
        <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{def.label}</span>
        {def.unit && (
          <span className="text-[9px] px-1 rounded" style={{ background: 'var(--card-inner-bg)', color: 'var(--text-dim)' }}>
            {def.unit}
          </span>
        )}
      </label>

      {def.type === 'select' ? (
        <select
          value={String(value)}
          onChange={e => onChange(e.target.value)}
          style={baseInput}
        >
          {def.options?.map(o => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>

      ) : def.type === 'boolean' ? (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={e => onChange(e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {Boolean(value) ? 'Enabled' : 'Disabled'}
          </span>
        </div>

      ) : def.type === 'number' ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={Number(value)}
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            onChange={e => onChange(Number(e.target.value))}
            style={{ ...baseInput, flex: 1 }}
          />
          {/* Quick +/- nudge buttons */}
          <button
            onClick={() => onChange(Math.max(def.min ?? -Infinity, Number(value) - (def.step ?? 1)))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
          >
            −
          </button>
          <button
            onClick={() => onChange(Math.min(def.max ?? Infinity, Number(value) + (def.step ?? 1)))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
          >
            +
          </button>
        </div>

      ) : (
        <input
          type="text"
          value={String(value)}
          placeholder={def.placeholder}
          onChange={e => onChange(e.target.value)}
          style={baseInput}
        />
      )}
    </div>
  );
}
