'use client';
import { useState } from 'react';

const SECTORS = [
  { name: 'IT', stocks: [
    { sym: 'TCS', chg: 1.82, mktCap: 'Large', val: 4156 },
    { sym: 'INFY', chg: -0.64, mktCap: 'Large', val: 1740 },
    { sym: 'WIPRO', chg: 2.11, mktCap: 'Large', val: 462 },
    { sym: 'HCLTECH', chg: 0.94, mktCap: 'Large', val: 1342 },
    { sym: 'TECHM', chg: -1.23, mktCap: 'Mid', val: 1210 },
  ]},
  { name: 'Banking', stocks: [
    { sym: 'HDFCBANK', chg: -0.32, mktCap: 'Large', val: 1680 },
    { sym: 'ICICIBANK', chg: 1.55, mktCap: 'Large', val: 1298 },
    { sym: 'AXISBANK', chg: 0.78, mktCap: 'Large', val: 1072 },
    { sym: 'KOTAKBANK', chg: -0.91, mktCap: 'Large', val: 1854 },
    { sym: 'SBIN', chg: 2.34, mktCap: 'Large', val: 820 },
  ]},
  { name: 'Auto', stocks: [
    { sym: 'MARUTI', chg: 1.18, mktCap: 'Large', val: 12450 },
    { sym: 'TATAMOTORS', chg: 3.41, mktCap: 'Large', val: 942 },
    { sym: 'M&M', chg: -0.56, mktCap: 'Large', val: 2890 },
    { sym: 'BAJAJ-AUTO', chg: 0.23, mktCap: 'Large', val: 8640 },
  ]},
  { name: 'Pharma', stocks: [
    { sym: 'SUNPHARMA', chg: -1.84, mktCap: 'Large', val: 1620 },
    { sym: 'DRREDDY', chg: 0.66, mktCap: 'Large', val: 6120 },
    { sym: 'CIPLA', chg: 1.04, mktCap: 'Large', val: 1520 },
    { sym: 'LUPIN', chg: -0.38, mktCap: 'Mid', val: 1890 },
  ]},
  { name: 'Energy', stocks: [
    { sym: 'RELIANCE', chg: 0.92, mktCap: 'Large', val: 2945 },
    { sym: 'ONGC', chg: -0.45, mktCap: 'Large', val: 264 },
    { sym: 'BPCL', chg: 1.67, mktCap: 'Large', val: 318 },
    { sym: 'IOC', chg: -2.12, mktCap: 'Large', val: 165 },
  ]},
  { name: 'FMCG', stocks: [
    { sym: 'HINDUNILVR', chg: -0.22, mktCap: 'Large', val: 2430 },
    { sym: 'ITC', chg: 0.84, mktCap: 'Large', val: 452 },
    { sym: 'NESTLEIND', chg: -1.56, mktCap: 'Large', val: 22400 },
    { sym: 'BRITANNIA', chg: 0.45, mktCap: 'Large', val: 5180 },
  ]},
];

function getColor(chg: number): string {
  if (chg > 3)   return 'rgba(var(--gain-rgb),0.85)';
  if (chg > 1.5) return 'rgba(var(--gain-rgb),0.55)';
  if (chg > 0)   return 'rgba(var(--gain-rgb),0.28)';
  if (chg > -1.5) return 'rgba(var(--loss-rgb),0.28)';
  if (chg > -3)   return 'rgba(var(--loss-rgb),0.55)';
  return 'rgba(var(--loss-rgb),0.85)';
}
function getTextColor(chg: number): string {
  return chg >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
}

export default function HeatmapPage() {
  const [view, setView] = useState<'market' | 'sector'>('market');
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Market Heatmap</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>Visual overview of market performance by sector</p>
        </div>
        <div className="flex gap-2">
          {(['market', 'sector'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all"
              style={view === v
                ? { background: 'rgba(41,121,255,0.2)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.4)' }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
              {v === 'market' ? 'Market View' : 'Sector View'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="glass rounded-xl px-4 py-2 mb-4 flex items-center gap-6 text-[10px]">
        <span style={{ color: 'var(--text-label)' }}>Color scale:</span>
        {[['> +3%','rgba(var(--gain-rgb),0.85)'],['> +1.5%','rgba(var(--gain-rgb),0.55)'],['> 0%','rgba(var(--gain-rgb),0.28)'],
          ['< 0%','rgba(var(--loss-rgb),0.28)'],['< -1.5%','rgba(var(--loss-rgb),0.55)'],['< -3%','rgba(var(--loss-rgb),0.85)']].map(([label, bg]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded" style={{ background: bg as string }} />
            <span style={{ color: 'var(--text-accent)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Heatmap grid */}
      <div className="space-y-3">
        {SECTORS.map(sector => {
          const sectorAvg = sector.stocks.reduce((s, st) => s + st.chg, 0) / sector.stocks.length;
          return (
            <div key={sector.name} className="glass rounded-xl overflow-hidden">
              {/* Sector header */}
              <div className="flex items-center justify-between px-4 py-2"
                style={{ borderBottom: '1px solid var(--panel-divider)', background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{sector.name}</span>
                <span className="text-xs font-bold font-mono" style={{ color: getTextColor(sectorAvg) }}>
                  {sectorAvg >= 0 ? '+' : ''}{sectorAvg.toFixed(2)}%
                </span>
              </div>
              {/* Stock cells */}
              <div className="flex flex-wrap gap-2 p-3">
                {sector.stocks.map(stock => (
                  <div key={stock.sym}
                    onMouseEnter={() => setHovered(stock.sym)}
                    onMouseLeave={() => setHovered(null)}
                    className="relative rounded-lg cursor-pointer transition-transform hover:scale-105"
                    style={{
                      background: getColor(stock.chg),
                      width: '120px',
                      height: '64px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: hovered === stock.sym ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                    }}>
                    <div className="text-xs font-bold" style={{ color: '#fff' }}>{stock.sym}</div>
                    <div className="text-[11px] font-mono font-semibold" style={{ color: stock.chg >= 0 ? '#b9fcd6' : '#ffc0cb' }}>
                      {stock.chg >= 0 ? '+' : ''}{stock.chg.toFixed(2)}%
                    </div>
                    <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>₹{stock.val.toLocaleString('en-IN')}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {[
          { label: 'Advances',    val: SECTORS.flatMap(s => s.stocks).filter(s => s.chg > 0).length, color: 'var(--accent-green)' },
          { label: 'Declines',    val: SECTORS.flatMap(s => s.stocks).filter(s => s.chg < 0).length, color: 'var(--accent-red)' },
          { label: 'Unchanged',   val: SECTORS.flatMap(s => s.stocks).filter(s => s.chg === 0).length, color: 'var(--text-dim)' },
          { label: 'Total Stocks',val: SECTORS.flatMap(s => s.stocks).length, color: 'var(--accent-blue)' },
        ].map(item => (
          <div key={item.label} className="glass rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono" style={{ color: item.color }}>{item.val}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-label)' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
