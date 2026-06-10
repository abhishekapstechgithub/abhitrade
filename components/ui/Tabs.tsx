'use client';
import { cn } from '@/lib/utils/format';
import { useState } from 'react';

interface Tab { id: string; label: string; count?: number; }
interface TabsProps {
  tabs: Tab[]; defaultTab?: string; onChange?: (id: string) => void;
  children?: (activeTab: string) => React.ReactNode; className?: string; size?: 'sm' | 'md';
}

export function Tabs({ tabs, defaultTab, onChange, children, className, size = 'md' }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id);
  const handle = (id: string) => { setActive(id); onChange?.(id); };

  return (
    <div className={className}>
      <div className="flex overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => handle(tab.id)}
            className={cn('shrink-0 font-medium transition-all border-b-2 -mb-px',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-xs')}
            style={active === tab.id
              ? { borderBottomColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }
              : { borderBottomColor: 'transparent', color: 'var(--text-dim)' }}>
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                style={active === tab.id
                  ? { background: 'rgba(0,212,255,0.15)', color: '#00d4ff' }
                  : { background: 'var(--card-inner-border)', color: 'var(--text-label)' }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {children && <div>{children(active)}</div>}
    </div>
  );
}
