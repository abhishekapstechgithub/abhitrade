'use client';

import { useRef, useState, useCallback } from 'react';
import { GitBranch } from 'lucide-react';
import { CANVAS_W, CANVAS_H } from '../constants/builder.constants';
import { CanvasBlock }     from './CanvasBlock';
import { ConnectionLayer } from './ConnectionLayer';
import type {
  CanvasBlock as CanvasBlockType,
  BlockConnection, PendingConnection, BlockSubtype,
} from '../types/builder.types';

interface Props {
  blocks:        CanvasBlockType[];
  connections:   BlockConnection[];
  selectedId:    string | null;
  pendingConn:   PendingConnection;
  onAddBlock:    (subtype: BlockSubtype, x: number, y: number) => void;
  onSelectBlock: (id: string) => void;
  onDeselect:    () => void;
  onStartDrag:   (blockId: string, clientX: number, clientY: number) => void;
  onMouseMove:   (clientX: number, clientY: number) => void;
  onMouseUp:     () => void;
  onDeleteBlock: (id: string) => void;
  onOutputPort:  (blockId: string, portIndex: number) => void;
  onInputPort:   (blockId: string, portIndex: number) => void;
  onRemoveWire:  (id: string) => void;
  onCancelWire:  () => void;
}

export function StrategyCanvas({
  blocks, connections, selectedId, pendingConn,
  onAddBlock, onSelectBlock, onDeselect,
  onStartDrag, onMouseMove, onMouseUp,
  onDeleteBlock, onOutputPort, onInputPort,
  onRemoveWire, onCancelWire,
}: Props) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

  // Convert client coords → canvas coords (accounts for scroll)
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return {
      x: clientX - r.left + wrapRef.current!.scrollLeft,
      y: clientY - r.top  + wrapRef.current!.scrollTop,
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const subtype = e.dataTransfer.getData('blockSubtype') as BlockSubtype;
    if (!subtype) return;
    const { x, y } = toCanvas(e.clientX, e.clientY);
    onAddBlock(subtype, x - 96, y - 40);   // centre the block under cursor
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = toCanvas(e.clientX, e.clientY);
    setMouse(pos);
    onMouseMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    onMouseUp();
  };

  const handleCanvasClick = () => {
    if (pendingConn) { onCancelWire(); return; }
    onDeselect();
  };

  const isEmpty = blocks.length === 0;

  return (
    <div
      ref={wrapRef}
      className="flex-1 overflow-auto relative"
      style={{
        // Dot-grid background
        backgroundImage:  'radial-gradient(circle, var(--panel-divider) 1px, transparent 1px)',
        backgroundSize:   '24px 24px',
        backgroundColor:  'var(--panel-bg)',
        cursor:           pendingConn ? 'crosshair' : 'default',
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleCanvasClick}
    >
      {/* Virtual canvas (scrollable space) */}
      <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>

        {/* SVG wire layer */}
        <ConnectionLayer
          blocks={blocks}
          connections={connections}
          pendingConn={pendingConn}
          mousePos={pendingConn ? mouse : null}
          onRemove={onRemoveWire}
        />

        {/* Blocks */}
        {blocks.map(block => (
          <CanvasBlock
            key={block.id}
            block={block}
            isSelected={selectedId === block.id}
            pendingConn={pendingConn}
            onSelect={() => onSelectBlock(block.id)}
            onStartDrag={(cx, cy) => onStartDrag(block.id, cx, cy)}
            onDelete={() => onDeleteBlock(block.id)}
            onOutputPort={i => onOutputPort(block.id, i)}
            onInputPort={i => onInputPort(block.id, i)}
          />
        ))}

        {/* Empty state hint */}
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              textAlign: 'center',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: 64, height: 64,
                borderRadius: 16,
                background: 'rgba(41,121,255,0.08)',
                border: '1.5px dashed rgba(41,121,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}
            >
              <GitBranch size={28} color="rgba(41,121,255,0.4)" />
            </div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
              Canvas is empty
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-label)' }}>
              Drag blocks from the library on the left
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
