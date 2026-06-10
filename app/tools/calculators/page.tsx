'use client';
import { useState, useCallback } from 'react';

const inputStyle: React.CSSProperties = {
  background: 'var(--card-inner-bg)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  outline: 'none',
  borderRadius: '8px',
  padding: '6px 12px',
  fontSize: '12px',
  width: '100%',
};

const labelStyle: React.CSSProperties = { color: 'var(--text-accent)', fontSize: '11px', marginBottom: '4px', display: 'block' };

// ── Black-Scholes helpers ──────────────────────────────────────────────────
function normCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x) / Math.SQRT2);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-x * x / 2)));
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function blackScholes(S: number, K: number, T: number, r: number, sigma: number, type: 'CE' | 'PE') {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const nd1 = normCDF(d1), nd2 = normCDF(d2);
  const nd1n = normCDF(-d1), nd2n = normCDF(-d2);
  const price = type === 'CE'
    ? S * nd1 - K * Math.exp(-r * T) * nd2
    : K * Math.exp(-r * T) * nd2n - S * nd1n;
  const delta = type === 'CE' ? nd1 : nd1 - 1;
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const theta = type === 'CE'
    ? (-(S * normPDF(d1) * sigma) / (2 * sqrtT) - r * K * Math.exp(-r * T) * nd2) / 365
    : (-(S * normPDF(d1) * sigma) / (2 * sqrtT) + r * K * Math.exp(-r * T) * nd2n) / 365;
  const vega = S * normPDF(d1) * sqrtT / 100;
  const rho = type === 'CE'
    ? K * T * Math.exp(-r * T) * nd2 / 100
    : -K * T * Math.exp(-r * T) * nd2n / 100;
  return { price, delta, gamma, theta, vega, rho };
}

// ── Brokerage Tab ──────────────────────────────────────────────────────────
function BrokerageCalc() {
  const [seg, setSeg] = useState('Equity Intraday');
  const [exc, setExc] = useState('NSE');
  const [buyPrice, setBuyPrice] = useState('24850');
  const [sellPrice, setSellPrice] = useState('24900');
  const [qty, setQty] = useState('50');
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const calculate = useCallback(() => {
    const bp = parseFloat(buyPrice) || 0;
    const sp = parseFloat(sellPrice) || 0;
    const q = parseInt(qty) || 0;
    const turnover = (bp + sp) * q;
    const buyValue = bp * q;
    const sellValue = sp * q;
    const isDelivery = seg === 'Equity Delivery';
    const brokerage = isDelivery ? 0 : (Math.min(0.0003 * bp * q, 20) + Math.min(0.0003 * sp * q, 20));
    const stt = isDelivery ? 0.001 * buyValue : 0.00025 * sellValue;
    const exchangeCharges = 0.0000345 * turnover;
    const gst = 0.18 * (brokerage + exchangeCharges);
    const sebi = 0.000001 * turnover;
    const stampDuty = 0.00003 * buyValue;
    const total = brokerage + stt + exchangeCharges + gst + sebi + stampDuty;
    const grossPnl = (sp - bp) * q;
    const netPnl = grossPnl - total;
    setResult({ brokerage, stt, exchangeCharges, gst, sebi, stampDuty, total, grossPnl, netPnl });
  }, [seg, exc, buyPrice, sellPrice, qty]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Inputs</div>
        {[
          { label: 'Segment', type: 'select', val: seg, set: setSeg, opts: ['Equity Intraday', 'Equity Delivery', 'F&O'] },
          { label: 'Exchange', type: 'select', val: exc, set: setExc, opts: ['NSE', 'BSE'] },
        ].map(f => (
          <div key={f.label}>
            <label style={labelStyle}>{f.label}</label>
            <select style={inputStyle} value={f.val} onChange={e => f.set(e.target.value)}>
              {f.opts!.map(o => <option key={o} style={{ background: '#081020' }}>{o}</option>)}
            </select>
          </div>
        ))}
        {[
          { label: 'Buy Price (₹)', val: buyPrice, set: setBuyPrice },
          { label: 'Sell Price (₹)', val: sellPrice, set: setSellPrice },
          { label: 'Quantity', val: qty, set: setQty },
        ].map(f => (
          <div key={f.label}>
            <label style={labelStyle}>{f.label}</label>
            <input type="number" style={inputStyle} value={f.val} onChange={e => f.set(e.target.value)} />
          </div>
        ))}
        <button onClick={calculate}
          className="w-full rounded-lg py-2 text-xs font-bold mt-2"
          style={{ background: 'rgb(41,121,255)', color: '#fff' }}>
          Calculate
        </button>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-xs font-bold mb-3" style={{ color: 'var(--text-bright)' }}>Breakdown</div>
        {result ? (
          <div className="space-y-2">
            {[
              { label: 'Brokerage', val: result.brokerage },
              { label: 'STT', val: result.stt },
              { label: 'Exchange Charges', val: result.exchangeCharges },
              { label: 'GST (18%)', val: result.gst },
              { label: 'SEBI Charges', val: result.sebi },
              { label: 'Stamp Duty', val: result.stampDuty },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center rounded-lg px-3 py-1.5"
                style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--panel-divider)' }}>
                <span style={{ color: 'var(--text-accent)', fontSize: '11px' }}>{row.label}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>₹{row.val.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center rounded-lg px-3 py-1.5 mt-1"
              style={{ background: 'rgba(var(--loss-rgb),0.1)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
              <span style={{ color: 'var(--accent-red)', fontSize: '11px', fontWeight: 700 }}>Total Charges</span>
              <span style={{ color: 'var(--accent-red)', fontSize: '11px', fontWeight: 700 }}>₹{result.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center rounded-lg px-3 py-2 mt-2"
              style={{ background: result.netPnl >= 0 ? 'rgba(var(--gain-rgb),0.1)' : 'rgba(var(--loss-rgb),0.1)', border: `1px solid ${result.netPnl >= 0 ? 'rgba(var(--gain-rgb),0.3)' : 'rgba(var(--loss-rgb),0.3)'}` }}>
              <span style={{ color: result.netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '13px', fontWeight: 700 }}>Net P&L</span>
              <span style={{ color: result.netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '18px', fontWeight: 800 }}>
                {result.netPnl >= 0 ? '+' : ''}₹{result.netPnl.toFixed(2)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--text-label)' }}>Enter values and click Calculate</div>
        )}
      </div>
    </div>
  );
}

// ── Margin Tab ─────────────────────────────────────────────────────────────
function MarginCalc() {
  const STOCKS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK'];
  const PRICES: Record<string, number> = { NIFTY: 24850, BANKNIFTY: 52340, RELIANCE: 2945, TCS: 3820, INFY: 1850, HDFCBANK: 1680 };
  const [sym, setSym] = useState('NIFTY');
  const [qty, setQty] = useState('50');
  const [product, setProduct] = useState('NRML');
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const calculate = useCallback(() => {
    const q = parseInt(qty) || 0;
    const price = PRICES[sym] || 1000;
    const notional = price * q;
    const spanPct = product === 'CNC' ? 0.15 : 0.10;
    const span = spanPct * notional;
    const exposure = 0.05 * notional;
    const total = span + exposure;
    const available = 280000;
    setResult({ span, exposure, total, available, shortfall: Math.max(0, total - available) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sym, qty, product]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Inputs</div>
        <div>
          <label style={labelStyle}>Symbol</label>
          <select style={inputStyle} value={sym} onChange={e => setSym(e.target.value)}>
            {STOCKS.map(s => <option key={s} style={{ background: '#081020' }}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Quantity / Lots</label>
          <input type="number" style={inputStyle} value={qty} onChange={e => setQty(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Product Type</label>
          <select style={inputStyle} value={product} onChange={e => setProduct(e.target.value)}>
            {['MIS', 'NRML', 'CNC'].map(p => <option key={p} style={{ background: '#081020' }}>{p}</option>)}
          </select>
        </div>
        <button onClick={calculate}
          className="w-full rounded-lg py-2 text-xs font-bold mt-2"
          style={{ background: 'rgb(41,121,255)', color: '#fff' }}>
          Calculate Margin
        </button>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-xs font-bold mb-3" style={{ color: 'var(--text-bright)' }}>Margin Requirements</div>
        {result ? (
          <div className="space-y-2">
            {[
              { label: 'SPAN Margin', val: result.span, color: 'var(--text-secondary)' },
              { label: 'Exposure Margin (5%)', val: result.exposure, color: 'var(--text-secondary)' },
              { label: 'Total Required', val: result.total, color: 'rgb(255,214,0)' },
              { label: 'Available Margin', val: result.available, color: 'var(--accent-green)' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--panel-divider)' }}>
                <span style={{ color: 'var(--text-accent)', fontSize: '11px' }}>{row.label}</span>
                <span style={{ color: row.color, fontSize: '13px', fontWeight: 700 }}>₹{row.val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
            {result.shortfall > 0 && (
              <div className="rounded-lg px-3 py-2 mt-2" style={{ background: 'rgba(var(--loss-rgb),0.1)', border: '1px solid rgba(var(--loss-rgb),0.3)' }}>
                <span style={{ color: 'var(--accent-red)', fontSize: '11px', fontWeight: 700 }}>⚠ Shortfall: ₹{result.shortfall.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--text-label)' }}>Select symbol and calculate</div>
        )}
      </div>
    </div>
  );
}

// ── P&L Tab ────────────────────────────────────────────────────────────────
function PnLCalc() {
  const [buyPrice, setBuyPrice] = useState('24850');
  const [sellPrice, setSellPrice] = useState('25100');
  const [qty, setQty] = useState('50');
  const [includeCharges, setIncludeCharges] = useState(true);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const calculate = useCallback(() => {
    const bp = parseFloat(buyPrice) || 0;
    const sp = parseFloat(sellPrice) || 0;
    const q = parseInt(qty) || 0;
    const gross = (sp - bp) * q;
    const turnover = (bp + sp) * q;
    const charges = includeCharges ? 0.001 * turnover : 0;
    setResult({ gross, charges, net: gross - charges, pct: bp > 0 ? ((sp - bp) / bp) * 100 : 0 });
  }, [buyPrice, sellPrice, qty, includeCharges]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Inputs</div>
        {[
          { label: 'Buy Price (₹)', val: buyPrice, set: setBuyPrice },
          { label: 'Sell Price (₹)', val: sellPrice, set: setSellPrice },
          { label: 'Quantity', val: qty, set: setQty },
        ].map(f => (
          <div key={f.label}>
            <label style={labelStyle}>{f.label}</label>
            <input type="number" style={inputStyle} value={f.val} onChange={e => f.set(e.target.value)} />
          </div>
        ))}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIncludeCharges(v => !v)}>
          <div className="w-8 h-4 rounded-full transition-colors flex items-center px-0.5"
            style={{ background: includeCharges ? 'rgb(41,121,255)' : 'rgba(255,255,255,0.1)' }}>
            <div className="w-3 h-3 rounded-full bg-white transition-transform"
              style={{ transform: includeCharges ? 'translateX(16px)' : 'translateX(0)' }} />
          </div>
          <span style={{ color: 'var(--text-accent)', fontSize: '11px' }}>Include Charges (0.1% of turnover)</span>
        </div>
        <button onClick={calculate}
          className="w-full rounded-lg py-2 text-xs font-bold"
          style={{ background: 'rgb(41,121,255)', color: '#fff' }}>
          Calculate P&L
        </button>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-xs font-bold mb-4" style={{ color: 'var(--text-bright)' }}>Result</div>
        {result ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Gross P&L', val: `${result.gross >= 0 ? '+' : ''}₹${result.gross.toFixed(2)}`, color: result.gross >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
                { label: 'Total Charges', val: `-₹${result.charges.toFixed(2)}`, color: 'rgb(255,214,0)' },
              ].map(c => (
                <div key={c.label} className="rounded-xl p-3 text-center"
                  style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)' }}>
                  <div style={{ color: 'var(--text-accent)', fontSize: '10px' }}>{c.label}</div>
                  <div style={{ color: c.color, fontSize: '16px', fontWeight: 800, marginTop: '4px' }}>{c.val}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl p-4 text-center"
              style={{ background: result.net >= 0 ? 'rgba(var(--gain-rgb),0.1)' : 'rgba(var(--loss-rgb),0.1)', border: `1px solid ${result.net >= 0 ? 'rgba(var(--gain-rgb),0.3)' : 'rgba(var(--loss-rgb),0.3)'}` }}>
              <div style={{ color: 'var(--text-accent)', fontSize: '11px' }}>Net P&L</div>
              <div style={{ color: result.net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '28px', fontWeight: 900, marginTop: '4px' }}>
                {result.net >= 0 ? '+' : ''}₹{result.net.toFixed(2)}
              </div>
              <div style={{ color: result.pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '13px', marginTop: '2px' }}>
                {result.pct >= 0 ? '+' : ''}{result.pct.toFixed(2)}%
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--text-label)' }}>Enter values and calculate</div>
        )}
      </div>
    </div>
  );
}

// ── Greeks Tab ─────────────────────────────────────────────────────────────
function GreeksCalc() {
  const [spot, setSpot] = useState('24850');
  const [strike, setStrike] = useState('24900');
  const [dte, setDte] = useState('30');
  const [vol, setVol] = useState('15');
  const [rate, setRate] = useState('6.5');
  const [optType, setOptType] = useState<'CE' | 'PE'>('CE');
  const [result, setResult] = useState<ReturnType<typeof blackScholes>>(null);

  const calculate = useCallback(() => {
    const S = parseFloat(spot), K = parseFloat(strike);
    const T = parseFloat(dte) / 365;
    const r = parseFloat(rate) / 100;
    const sigma = parseFloat(vol) / 100;
    setResult(blackScholes(S, K, T, r, sigma, optType));
  }, [spot, strike, dte, vol, rate, optType]);

  const greeks = result ? [
    { label: 'Option Price', val: result.price.toFixed(2), unit: '₹', color: 'rgb(0,212,255)' },
    { label: 'Delta', val: result.delta.toFixed(4), unit: '', color: 'rgb(41,121,255)' },
    { label: 'Gamma', val: result.gamma.toFixed(6), unit: '', color: 'var(--accent-green)' },
    { label: 'Theta (per day)', val: result.theta.toFixed(4), unit: '', color: 'var(--accent-red)' },
    { label: 'Vega (per 1%)', val: result.vega.toFixed(4), unit: '', color: 'rgb(170,0,255)' },
    { label: 'Rho (per 1%)', val: result.rho.toFixed(4), unit: '', color: 'rgb(255,214,0)' },
  ] : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Black-Scholes Inputs</div>
        {[
          { label: 'Spot Price (₹)', val: spot, set: setSpot },
          { label: 'Strike Price (₹)', val: strike, set: setStrike },
          { label: 'Days to Expiry', val: dte, set: setDte },
          { label: 'Volatility (%)', val: vol, set: setVol },
          { label: 'Risk-Free Rate (%)', val: rate, set: setRate },
        ].map(f => (
          <div key={f.label}>
            <label style={labelStyle}>{f.label}</label>
            <input type="number" style={inputStyle} value={f.val} onChange={e => f.set(e.target.value)} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>Option Type</label>
          <div className="flex gap-2">
            {(['CE', 'PE'] as const).map(t => (
              <button key={t} onClick={() => setOptType(t)}
                className="flex-1 rounded-lg py-1.5 text-xs font-bold transition-all"
                style={{
                  background: optType === t ? (t === 'CE' ? 'rgba(var(--gain-rgb),0.2)' : 'rgba(var(--loss-rgb),0.2)') : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${optType === t ? (t === 'CE' ? 'var(--accent-green)' : 'var(--accent-red)') : 'rgba(255,255,255,0.1)'}`,
                  color: optType === t ? (t === 'CE' ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-accent)',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <button onClick={calculate}
          className="w-full rounded-lg py-2 text-xs font-bold"
          style={{ background: 'rgb(41,121,255)', color: '#fff' }}>
          Calculate Greeks
        </button>
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-xs font-bold mb-3" style={{ color: 'var(--text-bright)' }}>Option Greeks</div>
        {result ? (
          <div className="grid grid-cols-2 gap-2">
            {greeks.map(g => (
              <div key={g.label} className="rounded-xl p-3"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)' }}>
                <div style={{ color: 'var(--text-accent)', fontSize: '10px' }}>{g.label}</div>
                <div style={{ color: g.color, fontSize: '18px', fontWeight: 800, marginTop: '4px' }}>
                  {g.unit}{g.val}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-xs" style={{ color: 'var(--text-label)' }}>Enter values and calculate</div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
const TABS = ['Brokerage', 'Margin', 'P&L', 'Greeks'] as const;
type Tab = typeof TABS[number];

export default function CalculatorsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Brokerage');

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Calculators</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>Brokerage, margin, P&L, and options Greeks</p>
      </div>
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--card-inner-bg)', width: 'fit-content' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="px-5 py-2 rounded-lg text-xs font-bold transition-all"
            style={{
              background: activeTab === tab ? 'rgb(41,121,255)' : 'transparent',
              color: activeTab === tab ? '#fff' : 'var(--text-accent)',
            }}>
            {tab === 'Greeks' ? 'Greeks (BS)' : `${tab} Calc`}
          </button>
        ))}
      </div>
      {activeTab === 'Brokerage' && <BrokerageCalc />}
      {activeTab === 'Margin' && <MarginCalc />}
      {activeTab === 'P&L' && <PnLCalc />}
      {activeTab === 'Greeks' && <GreeksCalc />}
    </div>
  );
}
