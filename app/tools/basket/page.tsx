'use client';
import { useState } from 'react';
import { ShoppingBasket, Plus, Trash2, Play, Save, Copy, ChevronDown } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';

interface BasketLeg {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  orderType: 'MARKET' | 'LIMIT';
  price: number;
  product: 'MIS' | 'CNC' | 'NRML';
}

interface Basket {
  id: number;
  name: string;
  legs: BasketLeg[];
  created: string;
}

const MOCK_BASKETS: Basket[] = [
  {
    id: 1,
    name: 'Iron Condor — NIFTY Jun',
    created: '07 Jun 2025',
    legs: [
      { id:1, symbol:'NIFTY24JUN24500CE', side:'SELL', qty:50, orderType:'LIMIT', price:120, product:'NRML' },
      { id:2, symbol:'NIFTY24JUN25000CE', side:'BUY',  qty:50, orderType:'LIMIT', price:48,  product:'NRML' },
      { id:3, symbol:'NIFTY24JUN24000PE', side:'SELL', qty:50, orderType:'LIMIT', price:105, product:'NRML' },
      { id:4, symbol:'NIFTY24JUN23500PE', side:'BUY',  qty:50, orderType:'LIMIT', price:42,  product:'NRML' },
    ],
  },
  {
    id: 2,
    name: 'Momentum Buy — IT Stocks',
    created: '06 Jun 2025',
    legs: [
      { id:5, symbol:'TCS',     side:'BUY', qty:10, orderType:'MARKET', price:4156, product:'CNC' },
      { id:6, symbol:'INFY',    side:'BUY', qty:20, orderType:'MARKET', price:1740, product:'CNC' },
      { id:7, symbol:'HCLTECH', side:'BUY', qty:15, orderType:'MARKET', price:1342, product:'CNC' },
    ],
  },
];

function legValue(leg: BasketLeg): number {
  return leg.price * leg.qty;
}

export default function BasketPage() {
  const { openOrderPanel } = useUIStore();
  const [baskets, setBaskets]     = useState<Basket[]>(MOCK_BASKETS);
  const [activeId, setActiveId]   = useState<number>(MOCK_BASKETS[0].id);
  const [newBasketName, setNew]   = useState('');
  const [showCreate, setShow]     = useState(false);

  const active = baskets.find(b => b.id === activeId);

  function createBasket() {
    if (!newBasketName.trim()) return;
    const b: Basket = { id: Date.now(), name: newBasketName.trim(), legs: [], created: 'Today' };
    setBaskets(prev => [...prev, b]);
    setActiveId(b.id);
    setNew(''); setShow(false);
  }

  function addLeg() {
    if (!active) return;
    const leg: BasketLeg = {
      id: Date.now(), symbol: '', side: 'BUY', qty: 1,
      orderType: 'MARKET', price: 0, product: 'MIS',
    };
    setBaskets(prev => prev.map(b => b.id === activeId
      ? { ...b, legs: [...b.legs, leg] } : b));
  }

  function removeLeg(legId: number) {
    setBaskets(prev => prev.map(b => b.id === activeId
      ? { ...b, legs: b.legs.filter(l => l.id !== legId) } : b));
  }

  function updateLeg(legId: number, field: keyof BasketLeg, value: string | number) {
    setBaskets(prev => prev.map(b => b.id === activeId
      ? { ...b, legs: b.legs.map(l => l.id === legId ? { ...l, [field]: value } : l) } : b));
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)',
    color: 'var(--text-secondary)', outline: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
  };

  const totalBuy  = active?.legs.filter(l => l.side === 'BUY').reduce((s, l) => s + legValue(l), 0) ?? 0;
  const totalSell = active?.legs.filter(l => l.side === 'SELL').reduce((s, l) => s + legValue(l), 0) ?? 0;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Basket Orders</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>Create and execute multi-leg strategy baskets</p>
        </div>
        <button onClick={() => setShow(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background:'rgba(41,121,255,0.15)', color:'#2979ff', border:'1px solid rgba(41,121,255,0.35)' }}>
          <Plus size={13} /> New Basket
        </button>
      </div>

      {showCreate && (
        <div className="glass rounded-xl p-4 mb-4 flex items-center gap-3">
          <input value={newBasketName} onChange={e => setNew(e.target.value)}
            placeholder="Basket name…" className="flex-1 h-8 px-3 rounded-lg text-xs outline-none"
            style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--text-secondary)' }} />
          <button onClick={createBasket}
            className="px-4 py-1.5 rounded-lg text-xs font-bold"
            style={{ background:'rgba(var(--gain-rgb),0.2)', color:'var(--accent-green)', border:'1px solid rgba(var(--gain-rgb),0.35)' }}>
            Create
          </button>
          <button onClick={() => setShow(false)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Basket list */}
        <div className="lg:col-span-1 space-y-2">
          {baskets.map(b => (
            <button key={b.id} onClick={() => setActiveId(b.id)}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
              style={activeId === b.id
                ? { background:'rgba(41,121,255,0.12)', border:'1px solid rgba(41,121,255,0.3)' }
                : { background:'rgba(255,255,255,0.03)', border:'1px solid var(--panel-divider)' }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold truncate" style={{ color: activeId === b.id ? '#2979ff' : 'var(--text-secondary)' }}>
                  {b.name}
                </div>
                <span className="text-[11px] shrink-0 ml-1" style={{ color:'var(--text-label)' }}>{b.legs.length}L</span>
              </div>
              <div className="text-[10px] mt-0.5" style={{ color:'var(--text-label)' }}>{b.created}</div>
            </button>
          ))}
        </div>

        {/* Active basket editor */}
        <div className="lg:col-span-3">
          {active && (
            <div className="glass rounded-2xl overflow-hidden">
              {/* Basket header */}
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom:'1px solid var(--panel-divider)' }}>
                <div className="text-sm font-bold" style={{ color:'var(--text-bright)' }}>{active.name}</div>
                <div className="flex gap-2">
                  <button onClick={addLeg}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                    style={{ background:'rgba(0,212,255,0.1)', color:'rgb(0,212,255)', border:'1px solid rgba(0,212,255,0.25)' }}>
                    <Plus size={10} /> Add Leg
                  </button>
                  <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                    style={{ background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                    <Copy size={10} /> Clone
                  </button>
                  <button className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                    style={{ background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                    <Save size={10} /> Save
                  </button>
                </div>
              </div>

              {/* Leg table header */}
              <div className="grid text-[11px] font-semibold uppercase tracking-wider px-4 py-2"
                style={{ gridTemplateColumns:'2fr 80px 60px 90px 80px 70px 36px',
                  background:'rgba(5,11,24,0.5)', borderBottom:'1px solid var(--panel-divider)', color:'var(--text-label)' }}>
                <div>Symbol</div><div>Side</div><div>Qty</div>
                <div>Order Type</div><div>Price</div><div>Product</div><div />
              </div>

              {active.legs.length === 0 && (
                <div className="py-10 text-center text-xs" style={{ color: 'var(--text-label)' }}>
                  No legs yet — click "Add Leg" to start
                </div>
              )}

              {active.legs.map((leg, i) => (
                <div key={leg.id} className="grid items-center px-4 py-2.5 hover:bg-white/[0.02]"
                  style={{ gridTemplateColumns:'2fr 80px 60px 90px 80px 70px 36px',
                    borderBottom:'1px solid var(--row-border)' }}>
                  <input value={leg.symbol} placeholder="Symbol"
                    onChange={e => updateLeg(leg.id, 'symbol', e.target.value)}
                    style={{ ...inputStyle, width:'100%' }} />
                  <select value={leg.side} onChange={e => updateLeg(leg.id, 'side', e.target.value)}
                    style={{ ...inputStyle, width:'70px',
                      color: leg.side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)',
                      fontWeight: 700 }}>
                    <option value="BUY"  style={{ background:'#081020', color:'var(--accent-green)' }}>BUY</option>
                    <option value="SELL" style={{ background:'#081020', color:'var(--accent-red)' }}>SELL</option>
                  </select>
                  <input value={leg.qty} type="number" min={1}
                    onChange={e => updateLeg(leg.id, 'qty', parseInt(e.target.value) || 1)}
                    style={{ ...inputStyle, width:'52px' }} />
                  <select value={leg.orderType} onChange={e => updateLeg(leg.id, 'orderType', e.target.value)}
                    style={{ ...inputStyle, width:'82px' }}>
                    <option value="MARKET" style={{ background:'#081020' }}>MARKET</option>
                    <option value="LIMIT"  style={{ background:'#081020' }}>LIMIT</option>
                  </select>
                  <input value={leg.price || ''} type="number"
                    placeholder={leg.orderType === 'MARKET' ? '—' : '0.00'}
                    disabled={leg.orderType === 'MARKET'}
                    onChange={e => updateLeg(leg.id, 'price', parseFloat(e.target.value) || 0)}
                    style={{ ...inputStyle, width:'72px', opacity: leg.orderType === 'MARKET' ? 0.4 : 1 }} />
                  <select value={leg.product} onChange={e => updateLeg(leg.id, 'product', e.target.value)}
                    style={{ ...inputStyle, width:'62px' }}>
                    {['MIS','CNC','NRML'].map(p => (
                      <option key={p} value={p} style={{ background:'#081020' }}>{p}</option>
                    ))}
                  </select>
                  <button onClick={() => removeLeg(leg.id)} style={{ color:'var(--accent-red)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              {/* Footer summary */}
              {active.legs.length > 0 && (
                <div className="px-4 py-3 flex items-center justify-between"
                  style={{ borderTop:'1px solid var(--panel-divider)', background:'rgba(5,11,24,0.3)' }}>
                  <div className="flex gap-6 text-[10px]">
                    <span style={{ color:'var(--text-label)' }}>
                      Buy value: <span className="font-bold font-mono" style={{ color:'var(--accent-green)' }}>
                        ₹{totalBuy.toLocaleString('en-IN')}
                      </span>
                    </span>
                    <span style={{ color:'var(--text-label)' }}>
                      Sell value: <span className="font-bold font-mono" style={{ color:'var(--accent-red)' }}>
                        ₹{totalSell.toLocaleString('en-IN')}
                      </span>
                    </span>
                    <span style={{ color:'var(--text-label)' }}>
                      Net outflow: <span className="font-bold font-mono" style={{ color:'var(--text-secondary)' }}>
                        ₹{Math.abs(totalBuy - totalSell).toLocaleString('en-IN')}
                      </span>
                    </span>
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold"
                    style={{ background:'linear-gradient(135deg,#2979ff,#00d4ff)', color:'#fff' }}>
                    <Play size={12} /> Execute Basket
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
