'use client';

import { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { StrategyBuilderJSON } from '../types/builder.types';

interface Props {
  json: StrategyBuilderJSON;
}

export function StrategyJsonPanel({ json }: Props) {
  const [copied,    setCopied]    = useState(false);
  const [expanded,  setExpanded]  = useState(false);   // full-height vs compact

  const text = JSON.stringify(json, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      style={{
        background:    'var(--card-bg)',
        borderTop:     '1px solid var(--panel-divider)',
        display:       'flex',
        flexDirection: 'column',
        height:        expanded ? 300 : 180,
        transition:    'height 0.2s ease',
        flexShrink:    0,
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-label)' }}>
          Strategy JSON
        </span>
        <div className="flex items-center gap-1.5 ml-2">
          <Pill label={`${json.blocks.length} blocks`}      />
          <Pill label={`${json.connections.length} wires`}  />
          <Pill label={json.category}                        />
        </div>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 h-6 px-2.5 rounded text-[10px] transition-all"
          style={{
            background: copied ? 'rgba(16,185,129,0.12)' : 'var(--card-inner-bg)',
            border:     `1px solid ${copied ? 'rgba(16,185,129,0.35)' : 'var(--card-inner-border)'}`,
            color:      copied ? '#10b981' : 'var(--text-dim)',
          }}
        >
          {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
        </button>
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 h-6 px-2 rounded text-[10px] transition-colors"
          style={{
            background: 'var(--card-inner-bg)',
            border: '1px solid var(--card-inner-border)',
            color: 'var(--text-dim)',
          }}
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>

      {/* JSON pre */}
      <pre
        className="flex-1 overflow-auto no-scrollbar text-[11px] font-mono px-4 py-2.5 leading-relaxed"
        style={{ color: 'var(--text-secondary)', margin: 0 }}
      >
        {text}
      </pre>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span
      className="px-2 py-px rounded-full text-[9px]"
      style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
    >
      {label}
    </span>
  );
}
