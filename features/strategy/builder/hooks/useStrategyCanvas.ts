'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  CanvasBlock, BlockConnection, PendingConnection,
  DragState, BlockSubtype, CanvasMeta,
  StrategyBuilderJSON, ValidationResult,
} from '../types/builder.types';
import { BLOCK_LIBRARY, SNAP } from '../constants/builder.constants';
import { uid, snap, generateStrategyJSON, validateStrategy } from '../utils/builder.utils';

const DEFAULT_META: CanvasMeta = {
  name:        '',
  symbol:      'NIFTY',
  exchange:    'NSE',
  category:    'neutral',
  description: '',
  tags:        [],
};

// ─── Main canvas state hook ───────────────────────────────────────────────────

export function useStrategyCanvas() {
  const [blocks,      setBlocks]      = useState<CanvasBlock[]>([]);
  const [connections, setConnections] = useState<BlockConnection[]>([]);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [pendingConn, setPending]     = useState<PendingConnection>(null);
  const [meta,        setMeta]        = useState<CanvasMeta>(DEFAULT_META);
  const [validation,  setValidation]  = useState<ValidationResult | null>(null);
  const [dirty,       setDirty]       = useState(false);

  // Ref so drag handlers always see the latest position without stale closure
  const dragRef = useRef<DragState | null>(null);

  // ── Add a block from the library onto the canvas ─────────────────────────
  const addBlock = useCallback((subtype: BlockSubtype, canvasX: number, canvasY: number): string => {
    const def = BLOCK_LIBRARY.find(d => d.subtype === subtype);
    if (!def) return '';

    const defaults: Record<string, string | number | boolean> = {};
    def.paramDefs.forEach(p => { defaults[p.key] = p.defaultValue; });

    const block: CanvasBlock = {
      id:          uid(),
      type:        def.type,
      subtype:     def.subtype,
      label:       def.label,
      customLabel: def.label,
      params:      defaults,
      position:    { x: snap(Math.max(0, canvasX), SNAP), y: snap(Math.max(0, canvasY), SNAP) },
      inputCount:  def.inputCount,
      outputCount: def.outputCount,
      color:       def.color,
    };

    setBlocks(prev => [...prev, block]);
    setSelectedId(block.id);
    setDirty(true);
    return block.id;
  }, []);

  // ── Edit a block (label or any param) ────────────────────────────────────
  const updateBlock = useCallback((
    id:    string,
    patch: Partial<Pick<CanvasBlock, 'customLabel' | 'params' | 'position'>>,
  ) => {
    setBlocks(prev =>
      prev.map(b =>
        b.id !== id ? b : {
          ...b,
          ...(patch.customLabel !== undefined && { customLabel: patch.customLabel }),
          ...(patch.position    !== undefined && { position:    patch.position    }),
          ...(patch.params      !== undefined && { params: { ...b.params, ...patch.params } }),
        },
      ),
    );
    setDirty(true);
  }, []);

  // ── Remove a block and all its wires ─────────────────────────────────────
  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    setConnections(prev => prev.filter(c => c.fromId !== id && c.toId !== id));
    setSelectedId(prev => prev === id ? null : prev);
    setDirty(true);
  }, []);

  // ── Block drag: start ─────────────────────────────────────────────────────
  const startBlockDrag = useCallback((blockId: string, clientX: number, clientY: number) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    dragRef.current = {
      blockId,
      startMouseX: clientX,
      startMouseY: clientY,
      startBlockX: block.position.x,
      startBlockY: block.position.y,
    };
  }, [blocks]);

  // ── Block drag: move (called from canvas mousemove) ───────────────────────
  const onMouseMove = useCallback((clientX: number, clientY: number) => {
    if (!dragRef.current) return;
    const { blockId, startMouseX, startMouseY, startBlockX, startBlockY } = dragRef.current;
    setBlocks(prev =>
      prev.map(b =>
        b.id !== blockId ? b : {
          ...b,
          position: {
            x: snap(Math.max(0, startBlockX + clientX - startMouseX), SNAP),
            y: snap(Math.max(0, startBlockY + clientY - startMouseY), SNAP),
          },
        },
      ),
    );
  }, []);

  // ── Block drag: end ───────────────────────────────────────────────────────
  const endMouseMove = useCallback(() => {
    if (dragRef.current) { dragRef.current = null; setDirty(true); }
  }, []);

  // ── Port wiring ───────────────────────────────────────────────────────────
  const startWire = useCallback((fromId: string, fromPort: number) => {
    setPending({ fromId, fromPort });
  }, []);

  const completeWire = useCallback((toId: string, toPort: number) => {
    setPending(prev => {
      if (!prev) return null;
      const { fromId, fromPort } = prev;
      if (fromId === toId) return null;   // no self-loops
      const dup = connections.some(
        c => c.fromId === fromId && c.fromPort === fromPort &&
             c.toId   === toId   && c.toPort   === toPort,
      );
      if (!dup) {
        setConnections(cs => [...cs, { id: uid(), fromId, fromPort, toId, toPort }]);
        setDirty(true);
      }
      return null;
    });
  }, [connections]);

  const cancelWire = useCallback(() => setPending(null), []);

  const removeConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
    setDirty(true);
  }, []);

  // ── Utilities ─────────────────────────────────────────────────────────────
  const clearCanvas = useCallback(() => {
    setBlocks([]); setConnections([]); setSelectedId(null);
    setPending(null); setValidation(null); setDirty(false);
  }, []);

  const validate = useCallback((): ValidationResult => {
    const result = validateStrategy(blocks, connections, meta.name);
    setValidation(result);
    return result;
  }, [blocks, connections, meta.name]);

  const getJSON = useCallback((): StrategyBuilderJSON =>
    generateStrategyJSON(blocks, connections, meta),
  [blocks, connections, meta]);

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;
  const isDragging    = () => dragRef.current !== null;

  return {
    // state
    blocks, connections, selectedId, selectedBlock,
    pendingConn, meta, validation, dirty,
    // setters
    setSelectedId, setMeta, setDirty,
    // block ops
    addBlock, updateBlock, removeBlock,
    // drag
    startBlockDrag, onMouseMove, endMouseMove, isDragging,
    // wiring
    startWire, completeWire, cancelWire, removeConnection,
    // global
    clearCanvas, validate, getJSON,
  };
}
