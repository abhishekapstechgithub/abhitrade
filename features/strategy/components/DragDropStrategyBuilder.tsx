'use client';

/**
 * DragDropStrategyBuilder
 * ──────────────────────
 * Full-screen visual strategy builder.
 *
 * Layout:
 *   ┌─────────────────────────────── BuilderToolbar ───────────────────────────────┐
 *   │  BlockLibrary (240px)  │  StrategyCanvas (flex-1)  │  BlockEditor (272px)   │
 *   │                        │                            │  (only when selected)  │
 *   ├────────────────────────┴────────────────────────────┴────────────────────────┤
 *   │  StrategyJsonPanel (collapsible, 180–300px)                                  │
 *   └──────────────────────────────────────────────────────────────────────────────┘
 *
 * No external DnD library — uses HTML5 draggable + native mouse events.
 */

import { useState, useCallback } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react';

import {
  BlockLibrary, StrategyCanvas, BlockEditor,
  BuilderToolbar, StrategyJsonPanel,
  useStrategyCanvas,
  BLOCK_LIBRARY,
} from '../builder';

import type { BlockSubtype } from '../builder/types/builder.types';

interface Props {
  onSave?: (json: ReturnType<ReturnType<typeof useStrategyCanvas>['getJSON']>) => void;
}

export function DragDropStrategyBuilder({ onSave }: Props) {
  const canvas     = useStrategyCanvas();
  const [showJson, setShowJson] = useState(false);

  // ── Palette → Canvas drop ──────────────────────────────────────────────────
  const handleAddBlock = useCallback(
    (subtype: BlockSubtype, x: number, y: number) => canvas.addBlock(subtype, x, y),
    [canvas],
  );

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = () => {
    const result = canvas.validate();
    if (!result.valid) return;   // toolbar shows validation badge
    const json = canvas.getJSON();
    canvas.setDirty(false);
    onSave?.(json);
  };

  // ── Block editor helpers ───────────────────────────────────────────────────
  const selectedBlock = canvas.selectedBlock;
  const selectedDef   = selectedBlock
    ? BLOCK_LIBRARY.find(d => d.subtype === selectedBlock.subtype) ?? null
    : null;

  return (
    <div
      className="flex flex-col"
      style={{ height: 'calc(100vh - 60px)', overflow: 'hidden' }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <BuilderToolbar
        meta={canvas.meta}
        blockCount={canvas.blocks.length}
        connCount={canvas.connections.length}
        dirty={canvas.dirty}
        validation={canvas.validation}
        showJson={showJson}
        onMetaChange={patch => canvas.setMeta(prev => ({ ...prev, ...patch }))}
        onValidate={canvas.validate}
        onClear={canvas.clearCanvas}
        onSave={handleSave}
        onToggleJson={() => setShowJson(v => !v)}
      />

      {/* ── Validation banner ─────────────────────────────────────────────── */}
      {canvas.validation && !canvas.validation.valid && (
        <ValidationBanner
          errors={canvas.validation.errors}
          highlightId={canvas.selectedId}
          onJump={id => canvas.setSelectedId(id)}
        />
      )}

      {/* ── Main workspace ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Block library (left) */}
        <BlockLibrary
          onDragStart={(subtype, _e) => {
            // dataTransfer is set inside the component; nothing extra needed
            void subtype;
          }}
        />

        {/* Canvas (centre) */}
        <StrategyCanvas
          blocks={canvas.blocks}
          connections={canvas.connections}
          selectedId={canvas.selectedId}
          pendingConn={canvas.pendingConn}
          onAddBlock={handleAddBlock}
          onSelectBlock={canvas.setSelectedId}
          onDeselect={() => canvas.setSelectedId(null)}
          onStartDrag={canvas.startBlockDrag}
          onMouseMove={canvas.onMouseMove}
          onMouseUp={canvas.endMouseMove}
          onDeleteBlock={canvas.removeBlock}
          onOutputPort={(blockId, port) => canvas.startWire(blockId, port)}
          onInputPort={(blockId, port) => canvas.completeWire(blockId, port)}
          onRemoveWire={canvas.removeConnection}
          onCancelWire={canvas.cancelWire}
        />

        {/* Block editor (right) — mounted only when a block is selected */}
        {selectedBlock && selectedDef && (
          <BlockEditor
            block={selectedBlock}
            onChange={params => canvas.updateBlock(selectedBlock.id, { params })}
            onLabelChange={lbl => canvas.updateBlock(selectedBlock.id, { customLabel: lbl })}
            onDelete={() => canvas.removeBlock(selectedBlock.id)}
            onClose={() => canvas.setSelectedId(null)}
          />
        )}
      </div>

      {/* ── JSON preview (bottom, collapsible) ───────────────────────────── */}
      {showJson && (
        <StrategyJsonPanel json={canvas.getJSON()} />
      )}
    </div>
  );
}

// ─── Inline validation banner ─────────────────────────────────────────────────

function ValidationBanner({
  errors, highlightId, onJump,
}: {
  errors:      ReturnType<typeof useStrategyCanvas>['validation'] extends infer V
                 ? V extends object ? (V & { errors: unknown[] })['errors'] : never
                 : never;
  highlightId: string | null;
  onJump:      (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (!open || !errors || errors.length === 0) return null;

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 text-[11px] shrink-0"
      style={{
        background: 'rgba(239,68,68,0.07)',
        borderBottom: '1px solid rgba(239,68,68,0.18)',
      }}
    >
      <AlertCircle size={13} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 flex-1">
        {/* @ts-ignore — typed dynamically */}
        {errors.map((err, i) => (
          <span
            key={i}
            className="flex items-center gap-1 cursor-pointer"
            style={{ color: err.severity === 'error' ? '#ef4444' : '#f59e0b' }}
            onClick={() => err.blockId && onJump(err.blockId)}
          >
            {err.severity === 'warning'
              ? <AlertTriangle size={10} />
              : <AlertCircle   size={10} />
            }
            {err.message}
          </span>
        ))}
      </div>
      <button onClick={() => setOpen(false)} style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
        <X size={12} />
      </button>
    </div>
  );
}
