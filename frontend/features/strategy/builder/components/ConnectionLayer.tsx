'use client';

import { useState } from 'react';
import { portCenter, bezierPath } from '../utils/builder.utils';
import { CANVAS_W, CANVAS_H } from '../constants/builder.constants';
import type { CanvasBlock, BlockConnection, PendingConnection } from '../types/builder.types';

interface Props {
  blocks:       CanvasBlock[];
  connections:  BlockConnection[];
  pendingConn:  PendingConnection;
  mousePos:     { x: number; y: number } | null;
  onRemove:     (id: string) => void;
}

export function ConnectionLayer({ blocks, connections, pendingConn, mousePos, onRemove }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const blockMap = new Map(blocks.map(b => [b.id, b]));

  return (
    <svg
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        width:         CANVAS_W,
        height:        CANVAS_H,
        pointerEvents: 'none',   // wires never block block interaction
        overflow:      'visible',
        zIndex:        2,
      }}
    >
      <defs>
        {/* Arrow marker for connection end */}
        <marker
          id="arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(255,255,255,0.25)" />
        </marker>
      </defs>

      {/* Established connections */}
      {connections.map(conn => {
        const from = blockMap.get(conn.fromId);
        const to   = blockMap.get(conn.toId);
        if (!from || !to) return null;

        const src  = portCenter(from, 'output', conn.fromPort);
        const dst  = portCenter(to,   'input',  conn.toPort);
        const path = bezierPath(src.x, src.y, dst.x, dst.y);
        const hov  = hoveredId === conn.id;

        return (
          <g
            key={conn.id}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onRemove(conn.id); }}
            onMouseEnter={() => setHoveredId(conn.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Wide transparent hit zone */}
            <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
            {/* Visible wire */}
            <path
              d={path}
              fill="none"
              stroke={from.color}
              strokeWidth={hov ? 2.5 : 1.5}
              strokeLinecap="round"
              opacity={hov ? 1 : 0.55}
              markerEnd="url(#arrow)"
              style={{ transition: 'stroke-width 0.1s, opacity 0.1s' }}
            />
            {/* Delete X on hover */}
            {hov && (() => {
              const mx = (src.x + dst.x) / 2;
              const my = (src.y + dst.y) / 2;
              return (
                <g>
                  <circle cx={mx} cy={my} r={9} fill="var(--card-bg)" stroke={from.color} strokeWidth={1.5} />
                  <line x1={mx - 4} y1={my - 4} x2={mx + 4} y2={my + 4} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
                  <line x1={mx + 4} y1={my - 4} x2={mx - 4} y2={my + 4} stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
                </g>
              );
            })()}
          </g>
        );
      })}

      {/* Pending wire (follows cursor) */}
      {pendingConn && mousePos && (() => {
        const from = blockMap.get(pendingConn.fromId);
        if (!from) return null;
        const src  = portCenter(from, 'output', pendingConn.fromPort);
        const path = bezierPath(src.x, src.y, mousePos.x, mousePos.y);
        return (
          <path
            d={path}
            fill="none"
            stroke={from.color}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            strokeLinecap="round"
            opacity={0.8}
          />
        );
      })()}
    </svg>
  );
}
