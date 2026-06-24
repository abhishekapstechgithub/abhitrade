'use client';
import { useState } from 'react';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, TrendingUp, TrendingDown } from 'lucide-react';

type AlertCondition = 'above' | 'below' | 'crosses' | 'change%';
type AlertStatus = 'active' | 'triggered' | 'paused';

interface PriceAlert {
  id: number;
  symbol: string;
  condition: AlertCondition;
  value: number;
  currentPrice: number;
  status: AlertStatus;
  created: string;
  note: string;
  notify: ('app' | 'email' | 'sms')[];
}

const MOCK_ALERTS: PriceAlert[] = [
  { id:1, symbol:'NIFTY',     condition:'above',    value:25000,  currentPrice:24850, status:'active',    created:'08 Jun', note:'Breakout watch', notify:['app','email'] },
  { id:2, symbol:'RELIANCE',  condition:'below',    value:2900,   currentPrice:2945,  status:'active',    created:'07 Jun', note:'Support level',  notify:['app'] },
  { id:3, symbol:'TCS',       condition:'crosses',  value:4200,   currentPrice:4156,  status:'active',    created:'06 Jun', note:'',               notify:['app','sms'] },
  { id:4, symbol:'HDFCBANK',  condition:'change%',  value:2,      currentPrice:1680,  status:'triggered', created:'05 Jun', note:'2% move alert',  notify:['app'] },
  { id:5, symbol:'INFY',      condition:'below',    value:1700,   currentPrice:1740,  status:'paused',    created:'04 Jun', note:'Trailing stop',  notify:['app','email'] },
  { id:6, symbol:'SENSEX',    condition:'above',    value:82000,  currentPrice:81560, status:'active',    created:'03 Jun', note:'ATH watch',      notify:['app'] },
];

const CONDITION_LABEL: Record<AlertCondition, string> = {
  above:   'Price above',
  below:   'Price below',
  crosses: 'Price crosses',
  'change%': 'Change % ≥',
};

const STATUS_STYLE: Record<AlertStatus, { bg: string; color: string; label: string }> = {
  active:    { bg:'rgba(var(--gain-rgb),0.12)',  color:'var(--accent-green)',  label:'Active'    },
  triggered: { bg:'rgba(41,121,255,0.12)', color:'rgb(41,121,255)', label:'Triggered' },
  paused:    { bg:'rgba(107,127,163,0.12)',color:'var(--text-dim)',         label:'Paused'    },
};

function proximity(a: PriceAlert): number {
  if (a.condition === 'above' || a.condition === 'crosses') {
    return ((a.value - a.currentPrice) / a.currentPrice) * 100;
  }
  if (a.condition === 'below') {
    return ((a.currentPrice - a.value) / a.currentPrice) * 100;
  }
  return 0;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>(MOCK_ALERTS);
  const [showForm, setShowForm] = useState(false);
  const [newSym, setNewSym]    = useState('');
  const [newCond, setNewCond]  = useState<AlertCondition>('above');
  const [newVal, setNewVal]    = useState('');
  const [filter, setFilter]    = useState<AlertStatus | 'all'>('all');

  const inputStyle: React.CSSProperties = {
    background: 'var(--card-inner-bg)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text-secondary)', outline: 'none', borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
  };

  function addAlert() {
    if (!newSym || !newVal) return;
    const a: PriceAlert = {
      id: Date.now(), symbol: newSym.toUpperCase(), condition: newCond,
      value: parseFloat(newVal), currentPrice: 0, status: 'active',
      created: 'Today', note: '', notify: ['app'],
    };
    setAlerts(prev => [a, ...prev]);
    setNewSym(''); setNewVal(''); setShowForm(false);
  }

  function toggleStatus(id: number) {
    setAlerts(prev => prev.map(a => a.id === id
      ? { ...a, status: a.status === 'paused' ? 'active' : 'paused' }
      : a
    ));
  }

  function deleteAlert(id: number) {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.status === filter);

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Price Alerts</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>Get notified when your targets are hit</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{ background: 'rgba(41,121,255,0.15)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.35)' }}>
          <Plus size={13} /> New Alert
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="glass rounded-xl p-4 mb-4">
          <h3 className="text-xs font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>Create Alert</h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-[10px] mb-1" style={{ color: 'var(--text-label)' }}>Symbol</label>
              <input value={newSym} onChange={e => setNewSym(e.target.value)} placeholder="NIFTY"
                style={{ ...inputStyle, width: '110px' }} />
            </div>
            <div>
              <label className="block text-[10px] mb-1" style={{ color: 'var(--text-label)' }}>Condition</label>
              <select value={newCond} onChange={e => setNewCond(e.target.value as AlertCondition)}
                style={{ ...inputStyle, width: '150px' }}>
                {(Object.entries(CONDITION_LABEL) as [AlertCondition, string][]).map(([k, v]) => (
                  <option key={k} value={k} style={{ background: '#081020' }}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] mb-1" style={{ color: 'var(--text-label)' }}>Value</label>
              <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="25000"
                type="number" style={{ ...inputStyle, width: '110px' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={addAlert}
                className="px-4 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: 'rgba(var(--gain-rgb),0.2)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.35)' }}>
                Create
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--card-inner-bg)', color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([
          { val:'all',       label:'All',       count:alerts.length,                                             active:{background:'rgba(139,164,204,0.15)',color:'var(--text-dim)',         border:'1px solid rgba(139,164,204,0.35)'} },
          { val:'active',    label:'Active',    count:alerts.filter(a=>a.status==='active').length,              active:{background:'rgba(var(--gain-rgb),0.15)',color:'var(--accent-green)',  border:'1px solid rgba(var(--gain-rgb),0.35)'} },
          { val:'triggered', label:'Triggered', count:alerts.filter(a=>a.status==='triggered').length,           active:{background:'rgba(41,121,255,0.15)',color:'var(--accent-blue)',        border:'1px solid rgba(41,121,255,0.35)'} },
          { val:'paused',    label:'Paused',    count:alerts.filter(a=>a.status==='paused').length,              active:{background:'rgba(107,127,163,0.15)',color:'var(--text-dim)',         border:'1px solid rgba(107,127,163,0.35)'} },
        ]).map(({ val, label, count, active: activeStyle }) => (
          <button key={val} onClick={() => setFilter(val as typeof filter)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={filter === val
              ? activeStyle
              : { background:'rgba(255,255,255,0.04)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
            {label} <span className="font-bold">{count}</span>
          </button>
        ))}
      </div>

      {/* Alert list */}
      <div className="glass rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="grid text-[11px] font-semibold uppercase tracking-wider px-4 py-2"
          style={{ gridTemplateColumns: '1fr 1fr 80px 80px 80px 60px 80px',
            background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)', color: 'var(--text-label)' }}>
          <div>Symbol</div><div>Condition</div><div className="text-right">Target</div>
          <div className="text-right">Current</div><div className="text-right">Distance</div>
          <div className="text-center">Status</div><div className="text-center">Actions</div>
        </div>

        {filtered.length === 0 && (
          <div className="py-10 text-center text-xs" style={{ color: 'var(--text-label)' }}>No alerts found</div>
        )}

        {filtered.map(a => {
          const ss = STATUS_STYLE[a.status];
          const dist = proximity(a);
          const distColor = Math.abs(dist) < 2 ? 'rgb(255,214,0)' : dist < 5 ? 'var(--text-secondary)' : 'var(--text-label)';
          return (
            <div key={a.id} className="grid items-center px-4 py-3 hover:bg-white/[0.02] transition-colors"
              style={{ gridTemplateColumns: '1fr 1fr 80px 80px 80px 60px 80px',
                borderBottom: '1px solid var(--row-border)' }}>
              <div>
                <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{a.symbol}</div>
                {a.note && <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{a.note}</div>}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--text-accent)' }}>
                {CONDITION_LABEL[a.condition]} <span className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {a.condition === 'change%' ? `${a.value}%` : `₹${a.value.toLocaleString('en-IN')}`}
                </span>
              </div>
              <div className="text-right font-mono text-xs font-bold" style={{ color: 'var(--text-bright)' }}>
                {a.condition === 'change%' ? `${a.value}%` : `₹${a.value.toLocaleString('en-IN')}`}
              </div>
              <div className="text-right font-mono text-xs" style={{ color: 'var(--text-accent)' }}>
                {a.currentPrice > 0 ? `₹${a.currentPrice.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="text-right text-xs font-mono font-semibold" style={{ color: distColor }}>
                {a.currentPrice > 0 ? `${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%` : '—'}
              </div>
              <div className="flex justify-center">
                <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold"
                  style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.color}40` }}>
                  {ss.label}
                </span>
              </div>
              <div className="flex justify-center gap-1">
                <button onClick={() => toggleStatus(a.id)} title="Toggle"
                  style={{ color: a.status === 'paused' ? 'var(--text-label)' : 'var(--accent-green)' }}>
                  {a.status === 'paused' ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                </button>
                <button onClick={() => deleteAlert(a.id)} title="Delete" style={{ color: 'var(--accent-red)' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
