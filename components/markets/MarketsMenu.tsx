'use client';
import { BarChart2, TrendingUp, PieChart, Star, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

const MENU_ITEMS = [
  { id: 'option-chain', label: 'Option Chain', description: 'Live OI, IV, Greeks for all strikes', icon: BarChart2, href: '/?tab=option-chain', color: 'text-blue-600 bg-blue-50' },
  { id: 'charts', label: 'Charts', description: 'Advanced multi-timeframe charting', icon: TrendingUp, href: '/?tab=charts', color: 'text-green-600 bg-green-50' },
  { id: 'composition', label: 'Stock Composition', description: 'Index weights, sectors, heatmaps', icon: PieChart, href: '/?tab=composition', color: 'text-purple-600 bg-purple-50' },
  { id: 'strategies', label: 'Favourite Strategies', description: 'Saved option strategies & builder', icon: Star, href: '/?tab=strategies', color: 'text-yellow-600 bg-yellow-50' },
];

interface MarketsMenuProps {
  onClose: () => void;
}

export function MarketsMenu({ onClose }: MarketsMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
      <div className="p-2">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">{item.label}</div>
                <div className="text-xs text-gray-500 truncate">{item.description}</div>
              </div>
              <ChevronRight size={14} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
