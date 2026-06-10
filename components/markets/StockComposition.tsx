'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { formatPercent } from '@/lib/utils/format';

const STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', weight: 10.45, change: 1.11, sector: 'Energy', mcap: 'Large' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', weight: 9.82, change: -0.73, sector: 'Banking', mcap: 'Large' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', weight: 7.34, change: 1.55, sector: 'Banking', mcap: 'Large' },
  { symbol: 'INFY', name: 'Infosys', weight: 6.12, change: 0.86, sector: 'IT', mcap: 'Large' },
  { symbol: 'TCS', name: 'TCS', weight: 5.89, change: -0.68, sector: 'IT', mcap: 'Large' },
  { symbol: 'HINDUNILVR', name: 'HUL', weight: 3.45, change: 0.23, sector: 'FMCG', mcap: 'Large' },
  { symbol: 'ITC', name: 'ITC', weight: 3.12, change: -0.45, sector: 'FMCG', mcap: 'Large' },
  { symbol: 'SBIN', name: 'SBI', weight: 2.98, change: -0.81, sector: 'Banking', mcap: 'Large' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', weight: 2.67, change: 2.14, sector: 'NBFC', mcap: 'Large' },
  { symbol: 'LT', name: 'L&T', weight: 2.45, change: 0.67, sector: 'Infra', mcap: 'Large' },
];

const SECTORS = [
  { name: 'Banking', weight: 28.5, change: 0.12, color: '#2979ff' },
  { name: 'IT', weight: 18.2, change: 0.45, color: '#7c4dff' },
  { name: 'Energy', weight: 12.8, change: 0.98, color: '#ffd740' },
  { name: 'FMCG', weight: 8.9, change: -0.12, color: 'var(--accent-green)' },
  { name: 'Auto', weight: 7.4, change: 1.23, color: '#ff6d00' },
  { name: 'NBFC', weight: 6.2, change: 1.89, color: '#f50057' },
  { name: 'Pharma', weight: 5.8, change: -0.56, color: '#00d4ff' },
  { name: 'Others', weight: 12.2, change: 0.23, color: '#455a64' },
];

const B = '41,121,255';
const C = '0,212,255';

const glass = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-divider)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
} as const;

export function StockComposition() {
  const [index, setIndex] = useState('NIFTY 50');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <select value={index} onChange={e => setIndex(e.target.value)}
          className="h-8 px-3 rounded-lg text-sm"
          style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)', outline: 'none' }}>
          {['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY MIDCAP', 'SENSEX'].map(i =>
            <option key={i} style={{ background: 'var(--option-bg)' }}>{i}</option>
          )}
        </select>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-accent)' }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Sector Pie */}
        <div className="rounded-xl p-4" style={glass}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-bright)' }}>Sector Allocation</h3>
          <div className="relative w-48 h-48 mx-auto mb-4">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {(() => {
                let startAngle = 0;
                return SECTORS.map((sector) => {
                  const angle = (sector.weight / 100) * 360;
                  const startRad = (startAngle * Math.PI) / 180;
                  const endRad = ((startAngle + angle) * Math.PI) / 180;
                  const x1 = 50 + 42 * Math.cos(startRad);
                  const y1 = 50 + 42 * Math.sin(startRad);
                  const x2 = 50 + 42 * Math.cos(endRad);
                  const y2 = 50 + 42 * Math.sin(endRad);
                  const largeArc = angle > 180 ? 1 : 0;
                  const path = `M 50 50 L ${x1} ${y1} A 42 42 0 ${largeArc} 1 ${x2} ${y2} Z`;
                  startAngle += angle;
                  return <path key={sector.name} d={path} fill={sector.color} opacity="0.85" />;
                });
              })()}
              <circle cx="50" cy="50" r="22" fill="var(--panel-bg)" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-center">
              <div>
                <div className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>{index}</div>
                <div className="text-xs" style={{ color: 'var(--text-label)' }}>50 stocks</div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            {SECTORS.map(s => (
              <div key={s.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs flex-1" style={{ color: 'var(--text-accent)' }}>{s.name}</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-bright)' }}>{s.weight}%</span>
                <span className="text-xs font-medium"
                  style={{ color: s.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {formatPercent(s.change)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stock weightages */}
        <div className="xl:col-span-2 rounded-xl overflow-hidden" style={glass}>
          <div className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>Stock Weightages</h3>
            <div className="flex gap-1">
              {['Large', 'Mid', 'Small'].map(mc => (
                <span key={mc} className="px-2 py-0.5 rounded text-xs"
                  style={{ background: `rgba(${B},0.12)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.2)` }}>
                  {mc} Cap
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                  {['Symbol', 'Sector', 'Weight %', 'Day Change', 'Cap'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-label)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STOCKS.map((stock) => (
                  <tr key={stock.symbol}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--row-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold" style={{ color: 'var(--text-bright)' }}>{stock.symbol}</div>
                      <div style={{ color: 'var(--text-label)' }}>{stock.name}</div>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: 'var(--text-dim)' }}>{stock.sector}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--progress-track)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${(stock.weight / 12) * 100}%`, background: `rgb(${B})` }} />
                        </div>
                        <span className="font-semibold" style={{ color: 'var(--text-bright)' }}>{stock.weight}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-medium"
                      style={{ color: stock.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {formatPercent(stock.change)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: `rgba(${B},0.12)`, color: `rgb(${C})` }}>
                        {stock.mcap}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="rounded-xl p-4" style={glass}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-bright)' }}>Day Change Heatmap</h3>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
          {STOCKS.map((stock) => {
            const isUp = stock.change >= 0;
            const bg = stock.change > 1
              ? 'rgba(var(--gain-rgb),0.35)'
              : stock.change > 0
              ? 'rgba(var(--gain-rgb),0.15)'
              : stock.change < -1
              ? 'rgba(var(--loss-rgb),0.35)'
              : 'rgba(var(--loss-rgb),0.15)';
            const cellColor = isUp ? 'var(--accent-green)' : 'var(--accent-red)';
            return (
              <div key={stock.symbol}
                className="p-2 rounded-lg text-center cursor-pointer transition-opacity hover:opacity-80"
                style={{ background: bg, border: `1px solid rgba(${isUp ? 'var(--gain-rgb)' : 'var(--loss-rgb)'},0.3)` }}>
                <div className="text-xs font-bold truncate" style={{ color: cellColor }}>{stock.symbol}</div>
                <div className="text-xs font-medium mt-0.5" style={{ color: cellColor }}>{formatPercent(stock.change)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{stock.weight}%</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
