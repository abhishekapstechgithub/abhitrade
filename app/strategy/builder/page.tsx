'use client';

import { DragDropStrategyBuilder } from '@/features/strategy/components/DragDropStrategyBuilder';

export default function StrategyBuilderPage() {
  return (
    <DragDropStrategyBuilder
      onSave={json => {
        // POST to /api/strategies when the backend route exists
        console.log('[strategy-builder] saved:', json.name, `(${json.blocks.length} blocks)`);
      }}
    />
  );
}
