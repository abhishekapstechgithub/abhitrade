'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tabs } from '@/components/ui/Tabs';
import { OptionChain } from '@/components/markets/OptionChain';
import { ChartsPanel } from '@/components/markets/ChartsPanel';
import { StockComposition } from '@/components/markets/StockComposition';
import { FavouriteStrategies } from '@/components/markets/FavouriteStrategies';

const TABS = [
  { id: 'option-chain', label: 'Option Chain' },
  { id: 'charts', label: 'Charts' },
  { id: 'composition', label: 'Stock Composition' },
  { id: 'strategies', label: 'Favourite Strategies' },
];

function MarketsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'option-chain');

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setActiveTab(t);
  }, [searchParams]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-bright)' }}>Markets</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-label)' }}>Option chain, charts, composition, and strategies</p>
      </div>
      <Tabs tabs={TABS} defaultTab={activeTab} onChange={setActiveTab}>
        {(tab) => (
          <div>
            {tab === 'option-chain' && <OptionChain />}
            {tab === 'charts' && <ChartsPanel />}
            {tab === 'composition' && <StockComposition />}
            {tab === 'strategies' && <FavouriteStrategies />}
          </div>
        )}
      </Tabs>
    </div>
  );
}

export default function MarketsPage() {
  return (
    <Suspense>
      <MarketsContent />
    </Suspense>
  );
}
