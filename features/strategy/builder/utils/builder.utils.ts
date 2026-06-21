import type {
  CanvasBlock, BlockConnection, StrategyBuilderJSON,
  ValidationResult, ValidationError, CanvasMeta,
} from '../types/builder.types';
import { BLOCK_W, BLOCK_H } from '../constants/builder.constants';

// ─── Tiny ID generator (no crypto dep) ───────────────────────────────────────
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── Snap a coordinate to the grid ───────────────────────────────────────────
export function snap(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

// ─── Get the canvas-space coordinate of a port circle's centre ───────────────
//     Ports are evenly distributed along the block's left (input) or right
//     (output) edge.
export function portCenter(
  block: CanvasBlock,
  side: 'input' | 'output',
  portIndex: number,
): { x: number; y: number } {
  const count   = side === 'input' ? block.inputCount : block.outputCount;
  const spacing = BLOCK_H / (count + 1);
  return {
    x: side === 'input' ? block.position.x : block.position.x + BLOCK_W,
    y: block.position.y + spacing * (portIndex + 1),
  };
}

// ─── Cubic bezier SVG path between two (x,y) points ─────────────────────────
export function bezierPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const cx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`;
}

// ─── Build the final strategy JSON from canvas state ─────────────────────────
export function generateStrategyJSON(
  blocks:      CanvasBlock[],
  connections: BlockConnection[],
  meta:        CanvasMeta,
  existingId?: string,
): StrategyBuilderJSON {
  const now = new Date().toISOString();
  return {
    id:          existingId ?? uid(),
    name:        meta.name.trim() || 'Untitled Strategy',
    version:     '2.0',
    symbol:      meta.symbol,
    exchange:    meta.exchange,
    category:    meta.category,
    description: meta.description,
    blocks: blocks.map(b => ({
      id:       b.id,
      type:     b.type,
      subtype:  b.subtype,
      label:    b.customLabel || b.label,
      params:   { ...b.params },
      position: { ...b.position },
    })),
    connections: connections.map(c => ({ ...c })),
    derivedLogic: {
      indicators:      blocks.filter(b => b.type === 'indicator').map(b => b.id),
      entryConditions: blocks.filter(b => b.type === 'entry_rule').map(b => b.id),
      exitConditions:  blocks.filter(b => b.type === 'exit_rule').map(b => b.id),
      optionLegs:      blocks.filter(b => b.type === 'option_leg').map(b => b.id),
      filters:         blocks.filter(b => b.type === 'filter').map(b => b.id),
    },
    metadata: {
      createdAt:       now,
      updatedAt:       now,
      tags:            meta.tags,
      blockCount:      blocks.length,
      connectionCount: connections.length,
    },
  };
}

// ─── Validate the canvas for logical completeness ─────────────────────────────
export function validateStrategy(
  blocks:      CanvasBlock[],
  connections: BlockConnection[],
  name:        string,
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!name.trim()) {
    errors.push({ message: 'Strategy must have a name.', severity: 'error' });
  }

  if (blocks.length === 0) {
    errors.push({ message: 'Canvas is empty — drag at least one block onto it.', severity: 'error' });
    return { valid: false, errors };
  }

  const hasEntry = blocks.some(b => b.type === 'entry_rule');
  const hasExit  = blocks.some(b => b.type === 'exit_rule');

  if (!hasEntry) {
    errors.push({ message: 'No Entry Rule block — strategy cannot trigger an order.', severity: 'error' });
  }
  if (!hasExit) {
    errors.push({ message: 'No Exit Rule block — positions may never be closed.', severity: 'warning' });
  }

  // Blocks that require at least one wired input
  const connectedInputIds = new Set(connections.map(c => c.toId));
  blocks.forEach(b => {
    if (b.inputCount > 0 && !connectedInputIds.has(b.id)) {
      errors.push({
        blockId:  b.id,
        message:  `"${b.customLabel || b.label}" has unwired input port(s).`,
        severity: 'warning',
      });
    }
  });

  // Indicator/filter outputs that feed nothing
  const connectedOutputIds = new Set(connections.map(c => c.fromId));
  blocks
    .filter(b => b.outputCount > 0 && !connectedOutputIds.has(b.id))
    .forEach(b => {
      errors.push({
        blockId:  b.id,
        message:  `"${b.customLabel || b.label}" output is not connected to anything.`,
        severity: 'warning',
      });
    });

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
  };
}
