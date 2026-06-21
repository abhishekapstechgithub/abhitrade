'use client';

import { useRef } from 'react';
import { X, GripVertical } from 'lucide-react';
import { BLOCK_W, BLOCK_H, PORT_R } from '../constants/builder.constants';
import type { CanvasBlock as CanvasBlockType, PendingConnection } from '../types/builder.types';

interface Props {
  block:          CanvasBlockType;
  isSelected:     boolean;
  pendingConn:    PendingConnection;
  onSelect:       () => void;
  onStartDrag:    (clientX: number, clientY: number) => void;
  onDelete:       () => void;
  onOutputPort:   (portIndex: number) => void;
  onInputPort:    (portIndex: number) => void;
}

// ─── Port circle (reused for both input and output) ──────────────────────────
function Port({
  index, count, side, color, active, pending,
  onClick,
}: {
  index:   number;
  count:   number;
  side:    'input' | 'output';
  color:   string;
  active:  boolean;
  pending: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const spacing = BLOCK_H / (count + 1);
  const top     = spacing * (index + 1) - PORT_R;
  const left    = side === 'input' ? -PORT_R : BLOCK_W - PORT_R;

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width:  PORT_R * 2,
        height: PORT_R * 2,
        borderRadius: '50%',
        border:   `2px solid ${color}`,
        background: active ? color : 'var(--card-bg)',
        cursor:     pending && side === 'input' ? 'crosshair' : 'pointer',
        zIndex: 10,
        transition: 'background 0.12s, transform 0.12s',
        boxShadow: active ? `0 0 6px ${color}` : 'none',
      }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.35)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    />
  );
}

// ─── Main canvas block ────────────────────────────────────────────────────────
export function CanvasBlock({
  block, isSelected, pendingConn,
  onSelect, onStartDrag, onDelete,
  onOutputPort, onInputPort,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  // Pick up to 2 most relevant params to show inline
  const previewParams = Object.entries(block.params).slice(0, 2);

  const borderColor = isSelected ? block.color : 'var(--card-border)';
  const glow        = isSelected ? `0 0 0 2px ${block.color}55` : 'none';

  return (
    <div
      ref={wrapRef}
      style={{
        position:   'absolute',
        left:       block.position.x,
        top:        block.position.y,
        width:      BLOCK_W,
        height:     BLOCK_H,
        borderRadius: 10,
        border:     `1.5px solid ${borderColor}`,
        boxShadow:  glow,
        background: 'var(--card-bg)',
        cursor:     'default',
        userSelect: 'none',
        zIndex:     isSelected ? 20 : 5,
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
      onClick={e => { e.stopPropagation(); onSelect(); }}
    >
      {/* Header bar */}
      <div
        style={{
          height: 28,
          borderRadius: '8px 8px 0 0',
          background: `${block.color}1e`,
          borderBottom: `1px solid ${block.color}30`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 6px 0 4px',
          gap: 4,
        }}
      >
        {/* Drag handle */}
        <div
          style={{ cursor: 'grab', color: `${block.color}99`, display: 'flex', alignItems: 'center' }}
          onMouseDown={e => { e.stopPropagation(); onStartDrag(e.clientX, e.clientY); }}
        >
          <GripVertical size={12} />
        </div>

        {/* Type icon */}
        <span style={{ fontSize: 11, color: block.color, fontWeight: 700, lineHeight: 1 }}>
          {block.label.slice(0, 2)}
        </span>

        {/* Label */}
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-bright)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {block.customLabel}
        </span>

        {/* Delete (visible on hover) */}
        <button
          className="delete-btn"
          style={{
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3, color: 'var(--text-dim)', opacity: 0, transition: 'opacity 0.15s',
          }}
          onClick={e => { e.stopPropagation(); onDelete(); }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
        >
          <X size={10} />
        </button>
      </div>

      {/* Body — show up to 2 key params */}
      <div
        style={{
          height: BLOCK_H - 28,
          padding: '4px 8px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        {previewParams.length === 0 ? (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            No params
          </span>
        ) : (
          previewParams.map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-label)', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {String(val)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Input ports (left edge) */}
      {Array.from({ length: block.inputCount }).map((_, i) => (
        <Port
          key={`in-${i}`}
          index={i} count={block.inputCount} side="input"
          color={block.color}
          active={!!pendingConn}  // light up inputs when a wire is pending
          pending={!!pendingConn}
          onClick={e => { e.stopPropagation(); onInputPort(i); }}
        />
      ))}

      {/* Output ports (right edge) */}
      {Array.from({ length: block.outputCount }).map((_, i) => (
        <Port
          key={`out-${i}`}
          index={i} count={block.outputCount} side="output"
          color={block.color}
          active={false}
          pending={false}
          onClick={e => { e.stopPropagation(); onOutputPort(i); }}
        />
      ))}

      {/* Show delete button on block hover via CSS injection trick */}
      <style>{`
        div:hover > .delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
