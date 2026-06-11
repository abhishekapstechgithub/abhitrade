'use client';
import { useState } from 'react';
import { Search, Plus, Minus } from 'lucide-react';
import type { OptionContract } from '@/types';
const optionChainData: OptionContract[] = [];
import { useUIStore } from '@/store/useUIStore';

const EXPIRIES = ['26 Jun 2026', '03 Jul 2026', '31 Jul 2026', '28 Aug 2026', '25 Sep 2026'];
const FILTERS = ['All Strikes', 'Near ATM', 'Calls Only', 'Puts Only', 'High OI', 'IV Rank'];

const B = '41,121,255';
const C = '0,212,255';

const glass = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-divider)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
} as const;

const inputStyle = {
  background: 'var(--field-bg)',
  border: '1px solid var(--field-border)',
  color: 'var(--text-secondary)',
  outline: 'none',
} as const;

export function OptionChain() {
  const [symbol, setSymbol] = useState('NIFTY');
  const [expiry, setExpiry] = useState(EXPIRIES[0]);
  const [filter, setFilter] = useState('All Strikes');
  const [interval, setInterval] = useState(100);
  const { openOrderPanel } = useUIStore();

  const strikes = Array.from(new Set(optionChainData.map(o => o.strike))).sort((a, b) => a - b);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="rounded-xl p-3 flex flex-wrap items-center gap-3" style={glass}>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-label)' }} />
          <input value={symbol} onChange={e => setSymbol(e.target.value)}
            className="pl-8 pr-3 h-8 rounded-lg text-sm w-32"
            style={inputStyle}
            placeholder="Symbol" />
        </div>
        <select value={expiry} onChange={e => setExpiry(e.target.value)}
          className="h-8 px-2 rounded-lg text-sm"
          style={inputStyle}>
          {EXPIRIES.map(e => <option key={e} style={{ background: 'var(--option-bg)' }}>{e}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>Interval:</span>
          <button onClick={() => setInterval(i => Math.max(50, i - 50))}
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-accent)' }}>
            <Minus size={11} />
          </button>
          <span className="text-sm font-mono font-medium w-12 text-center" style={{ color: 'var(--text-bright)' }}>{interval}</span>
          <button onClick={() => setInterval(i => i + 50)}
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-accent)' }}>
            <Plus size={11} />
          </button>
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-2.5 py-1 text-xs rounded-full font-medium transition-all"
              style={filter === f
                ? { background: `rgba(${B},0.2)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.3)` }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Underlying info */}
      <div className="rounded-xl px-4 py-2.5 flex items-center gap-4 text-sm" style={glass}>
        <span className="font-bold" style={{ color: 'var(--text-bright)' }}>{symbol}</span>
        <span className="font-mono font-semibold" style={{ color: 'var(--accent-green)' }}>24,850.65</span>
        <span className="font-medium text-sm" style={{ color: 'var(--accent-green)' }}>+123.45 (+0.50%)</span>
        <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: 'var(--text-dim)' }}>
          <span>ATM: <span style={{ color: `rgb(${C})` }}>24,900</span></span>
          <span>·</span>
          <span>Expiry: <span style={{ color: 'var(--text-accent)' }}>{expiry}</span></span>
          <span>·</span>
          <span className="px-2 py-0.5 rounded text-xs font-semibold"
            style={{ background: `rgba(${B},0.15)`, color: `rgb(${C})` }}>PCR: 0.89</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={glass}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <th colSpan={7} className="py-2 text-center text-xs tracking-wide font-semibold"
                  style={{ color: 'var(--accent-green)', background: 'rgba(var(--gain-rgb),0.06)' }}>CALLS</th>
                <th className="py-2 text-center font-bold text-xs"
                  style={{ color: `rgb(${C})`, borderLeft: '1px solid var(--panel-divider)', borderRight: '1px solid var(--panel-divider)', background: 'rgba(41,121,255,0.08)' }}>
                  STRIKE
                </th>
                <th colSpan={7} className="py-2 text-center text-xs tracking-wide font-semibold"
                  style={{ color: 'var(--accent-red)', background: 'rgba(var(--loss-rgb),0.06)' }}>PUTS</th>
              </tr>
              <tr style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                {['OI', 'Chg OI', 'Vol', 'IV', 'LTP', 'Bid', 'Ask'].map(h => (
                  <th key={`ce-${h}`} className="px-2 py-2 text-right font-medium" style={{ color: 'var(--text-label)' }}>{h}</th>
                ))}
                <th className="px-3 py-2 text-center font-bold"
                  style={{ color: `rgb(${C})`, borderLeft: '1px solid var(--panel-divider)', borderRight: '1px solid var(--panel-divider)' }}>
                  Strike
                </th>
                {['Bid', 'Ask', 'LTP', 'IV', 'Vol', 'Chg OI', 'OI'].map(h => (
                  <th key={`pe-${h}`} className="px-2 py-2 text-left font-medium" style={{ color: 'var(--text-label)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {strikes.map((strike) => {
                const ce = optionChainData.find(o => o.optionType === 'CE' && o.strike === strike);
                const pe = optionChainData.find(o => o.optionType === 'PE' && o.strike === strike);
                const isAtm = ce?.isAtm || pe?.isAtm;
                const rowStyle = isAtm
                  ? { background: `rgba(${B},0.10)`, borderBottom: '1px solid var(--panel-divider)' }
                  : { borderBottom: '1px solid var(--row-border)' };
                const ceBg = ce?.isItm ? { background: 'rgba(var(--gain-rgb),0.06)' } : {};
                const peBg = pe?.isItm ? { background: 'rgba(var(--loss-rgb),0.06)' } : {};
                return (
                  <tr key={strike} className="group transition-colors hover:bg-white/[0.02]" style={rowStyle}>
                    {/* CE side */}
                    <td className="px-2 py-2.5 text-right" style={ceBg}>
                      <span style={{ color: 'var(--text-dim)' }}>{ce ? (ce.oi / 1000).toFixed(0) + 'K' : '-'}</span>
                    </td>
                    <td className="px-2 py-2.5 text-right" style={ceBg}>
                      <span style={{ color: (ce?.changeOi ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {ce ? (ce.changeOi > 0 ? '+' : '') + (ce.changeOi / 1000).toFixed(0) + 'K' : '-'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right" style={{ ...ceBg, color: 'var(--text-dim)' }}>
                      {ce ? (ce.volume / 1000).toFixed(0) + 'K' : '-'}
                    </td>
                    <td className="px-2 py-2.5 text-right" style={{ ...ceBg, color: 'var(--text-accent)' }}>
                      {ce?.iv?.toFixed(1) ?? '-'}
                    </td>
                    <td className="px-2 py-2.5 text-right font-semibold" style={{ ...ceBg, color: ce?.isItm ? 'var(--accent-green)' : 'var(--text-bright)' }}>
                      <div className="flex items-center justify-end gap-1">
                        <div className="hidden group-hover:flex gap-0.5">
                          <button onClick={() => ce && openOrderPanel(ce.symbol, 'BUY')}
                            className="px-1 py-0.5 rounded text-xs font-bold text-white"
                            style={{ background: 'var(--accent-green)' }}>B</button>
                          <button onClick={() => ce && openOrderPanel(ce.symbol, 'SELL')}
                            className="px-1 py-0.5 rounded text-xs font-bold text-white"
                            style={{ background: 'var(--accent-red)' }}>S</button>
                        </div>
                        {ce?.ltp ?? '-'}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right" style={{ ...ceBg, color: 'var(--text-label)' }}>{ce?.bid ?? '-'}</td>
                    <td className="px-2 py-2.5 text-right" style={{ ...ceBg, color: 'var(--text-label)' }}>{ce?.ask ?? '-'}</td>

                    {/* Strike */}
                    <td className="px-3 py-2.5 text-center font-bold"
                      style={{
                        color: isAtm ? `rgb(${C})` : 'var(--text-accent)',
                        borderLeft: '1px solid var(--panel-divider)',
                        borderRight: '1px solid var(--panel-divider)',
                        background: isAtm ? `rgba(${B},0.12)` : undefined,
                      }}>
                      {isAtm && <span className="block text-[11px] font-normal mb-0.5" style={{ color: `rgb(${C})` }}>ATM</span>}
                      {strike.toLocaleString('en-IN')}
                    </td>

                    {/* PE side */}
                    <td className="px-2 py-2.5 text-left" style={{ ...peBg, color: 'var(--text-label)' }}>{pe?.bid ?? '-'}</td>
                    <td className="px-2 py-2.5 text-left" style={{ ...peBg, color: 'var(--text-label)' }}>{pe?.ask ?? '-'}</td>
                    <td className="px-2 py-2.5 text-left font-semibold" style={{ ...peBg, color: pe?.isItm ? 'var(--accent-red)' : 'var(--text-bright)' }}>
                      <div className="flex items-center gap-1">
                        {pe?.ltp ?? '-'}
                        <div className="hidden group-hover:flex gap-0.5">
                          <button onClick={() => pe && openOrderPanel(pe.symbol, 'BUY')}
                            className="px-1 py-0.5 rounded text-xs font-bold text-white"
                            style={{ background: 'var(--accent-green)' }}>B</button>
                          <button onClick={() => pe && openOrderPanel(pe.symbol, 'SELL')}
                            className="px-1 py-0.5 rounded text-xs font-bold text-white"
                            style={{ background: 'var(--accent-red)' }}>S</button>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-left" style={{ ...peBg, color: 'var(--text-accent)' }}>{pe?.iv?.toFixed(1) ?? '-'}</td>
                    <td className="px-2 py-2.5 text-left" style={{ ...peBg, color: 'var(--text-dim)' }}>
                      {pe ? (pe.volume / 1000).toFixed(0) + 'K' : '-'}
                    </td>
                    <td className="px-2 py-2.5 text-left" style={peBg}>
                      <span style={{ color: (pe?.changeOi ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {pe ? (pe.changeOi > 0 ? '+' : '') + (pe.changeOi / 1000).toFixed(0) + 'K' : '-'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-left" style={{ ...peBg, color: 'var(--text-dim)' }}>
                      {pe ? (pe.oi / 1000).toFixed(0) + 'K' : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
