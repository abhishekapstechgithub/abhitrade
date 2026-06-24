'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown, ChevronUp, AlertCircle, CheckCircle, GripHorizontal, Search, FlaskConical } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useMarketStore } from '@/store/useMarketStore';
import { cn } from '@/lib/utils/format';

// ─── Drag hook ────────────────────────────────────────────────────────────────
function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = panelRef.current?.offsetWidth  ?? 340;
    const h = panelRef.current?.offsetHeight ?? 520;
    setPos({ x: Math.max(0, window.innerWidth - w - 20), y: Math.max(0, window.innerHeight - h - 20) });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !panelRef.current) return;
      const w = panelRef.current.offsetWidth;
      const h = panelRef.current.offsetHeight;
      setPos({
        x: Math.min(Math.max(0, e.clientX - offset.current.x), window.innerWidth  - w),
        y: Math.min(Math.max(0, e.clientY - offset.current.y), window.innerHeight - h),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return { pos, panelRef, onMouseDown };
}

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_STRATEGY_API_URL ?? '';

type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
const ORDER_TYPES: OrderType[] = ['MARKET', 'LIMIT', 'SL', 'SL-M'];

// ─── Local charges estimate ───────────────────────────────────────────────────
function calcCharges(value: number) {
  const brokerage   = Math.min(20, value * 0.0003);
  const stt         = value * 0.001;
  const exchangeTxn = value * 0.0000345;
  const gst         = (brokerage + exchangeTxn) * 0.18;
  const sebi        = value * 0.000001;
  const stamp       = value * 0.00015;
  const total       = brokerage + stt + exchangeTxn + gst + sebi + stamp;
  return { brokerage, stt, exchangeTxn, gst, sebi, stamp, total };
}

function ChargeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-[3px]">
      <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{label}</span>
      <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>₹{value.toFixed(2)}</span>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function OrderPanel() {
  const { orderPanelOpen, orderSide, orderSymbol, orderToken: storeToken, closeOrderPanel, openOrderPanel } = useUIStore();
  const getPrice = useMarketStore(s => s.getPrice);

  const [orderType, setOrderType]   = useState<OrderType>('MARKET');
  const [qty, setQty]               = useState('1');
  const [price, setPrice]           = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [chargesOpen, setChargesOpen]   = useState(false);

  // Token resolution
  const [resolvedToken, setResolvedToken] = useState('');
  const [resolving, setResolving]         = useState(false);
  const [resolveError, setResolveError]   = useState('');
  // LTP from scrip search (fallback when market store has no price)
  const [scripLtp, setScripLtp]           = useState<number | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; msg: string } | null>(null);

  // Drag
  const { pos, panelRef, onMouseDown } = useDraggable();

  // Auth token
  function authToken() {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('tk_access_token') ?? localStorage.getItem('tk_access_token');
  }

  // LTP: prefer live market store, fall back to scrip search result
  const marketLtp = orderSymbol ? getPrice(orderSymbol) : null;
  const ltp = marketLtp ?? scripLtp;

  // ── Resolve token + LTP from strategy-api when panel opens ───────────────
  const resolveToken = useCallback(async (symbol: string, prefill: string) => {
    if (prefill) { setResolvedToken(prefill); setResolveError(''); return; }
    setResolving(true);
    setResolveError('');
    setScripLtp(null);
    try {
      const jwt = authToken();
      const res = await fetch(`${API_BASE}/api/scrip/search?q=${encodeURIComponent(symbol)}`, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const match = (data.results ?? []).find((r: { symbol: string; token: string; ltp?: number }) =>
          r.symbol.toUpperCase() === symbol.toUpperCase()
        ) ?? data.results?.[0];
        if (match) {
          setResolvedToken(match.token);
          if (match.ltp) setScripLtp(parseFloat(match.ltp));
        } else {
          setResolveError(`"${symbol}" not found in instrument master — check symbol`);
        }
      }
    } catch {
      setResolveError('Could not reach strategy-api — is it running?');
    } finally {
      setResolving(false);
    }
  }, []);

  // ── Reset when panel opens / symbol changes ───────────────────────────────
  useEffect(() => {
    if (!orderPanelOpen) return;
    setOrderType('MARKET');
    setQty('1');
    setPrice('');
    setTriggerPrice('');
    setResult(null);
    setChargesOpen(false);
    setResolvedToken('');
    setScripLtp(null);
    resolveToken(orderSymbol, storeToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPanelOpen, orderSymbol, storeToken]);

  // Auto-fill price for non-MARKET orders
  useEffect(() => {
    if (orderType !== 'MARKET' && ltp && !price) setPrice(ltp.toFixed(2));
  }, [orderType, ltp, price]);

  if (!orderPanelOpen) return null;

  const isBuy      = orderSide === 'BUY';
  const showPrice  = orderType !== 'MARKET';
  const showTrigger = orderType === 'SL' || orderType === 'SL-M';
  const qtyNum     = parseInt(qty) || 0;
  const execPrice  = orderType === 'MARKET' ? (ltp ?? 0) : (parseFloat(price) || 0);
  const orderValue = execPrice * qtyNum;
  const charges    = orderValue > 0 ? calcCharges(orderValue) : null;

  const handleSubmit = async () => {
    setResult(null);
    if (!resolvedToken) { setResult({ ok: false, msg: 'Instrument token not resolved yet — wait a moment' }); return; }
    if (qtyNum <= 0)    { setResult({ ok: false, msg: 'Enter a valid quantity' }); return; }
    if (showPrice && !parseFloat(price)) { setResult({ ok: false, msg: 'Enter a valid price' }); return; }

    const jwt = authToken();
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        token:            resolvedToken,
        transaction_type: orderSide,
        order_type:       orderType === 'MARKET' ? 'MARKET' : 'LIMIT',
        quantity:         qtyNum,
      };
      // For LIMIT / SL / SL-M use the price field; SL/SL-M uses trigger as the limit price
      if (body.order_type === 'LIMIT') {
        body.price = showTrigger && triggerPrice ? parseFloat(triggerPrice) : parseFloat(price);
      }

      const res = await fetch(`${API_BASE}/api/paper/orders/place`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({ ok: false, msg: data.error ?? 'Order failed' });
      } else if (data.status === 'EXECUTED') {
        setResult({ ok: true, msg: `✓ ${isBuy ? 'Bought' : 'Sold'} ${qtyNum} × ${orderSymbol} @ ₹${data.price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` });
        setTimeout(() => closeOrderPanel(), 1800);
      } else if (data.status === 'PENDING') {
        setResult({ ok: true, msg: `⏳ Limit order placed — waiting for ₹${body.price}` });
        setTimeout(() => closeOrderPanel(), 1800);
      } else {
        setResult({ ok: false, msg: data.reason ?? data.status ?? 'Rejected' });
      }
    } catch {
      setResult({ ok: false, msg: 'Network error — is strategy-api running?' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className="w-[340px] z-[9999] shadow-2xl"
      style={{
        position: 'fixed',
        left:   pos?.x ?? 'auto',
        top:    pos?.y ?? 'auto',
        right:  pos ? 'auto' : 20,
        bottom: pos ? 'auto' : 20,
      }}
    >
      <div className={cn('rounded-xl overflow-hidden')}
        style={{
          background:    'var(--panel-bg)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${isBuy ? 'rgba(var(--gain-rgb),0.45)' : 'rgba(var(--loss-rgb),0.45)'}`,
        }}>

        {/* Drag handle */}
        <div onMouseDown={onMouseDown}
          className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing"
          style={{ background: isBuy ? 'rgba(var(--gain-rgb),0.08)' : 'rgba(var(--loss-rgb),0.08)', borderBottom: '1px solid var(--panel-divider)' }}>
          <GripHorizontal size={14} style={{ color: 'var(--text-label)', opacity: 0.5 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{
            background: isBuy ? 'rgba(var(--gain-rgb),0.12)' : 'rgba(var(--loss-rgb),0.12)',
            borderBottom: `1px solid ${isBuy ? 'rgba(var(--gain-rgb),0.25)' : 'rgba(var(--loss-rgb),0.25)'}`,
          }}>
          <div className="flex items-center gap-2">
            {/* BUY / SELL toggle */}
            <div className="flex rounded-lg overflow-hidden"
              style={{ border: `1px solid ${isBuy ? 'rgba(var(--gain-rgb),0.5)' : 'rgba(var(--loss-rgb),0.5)'}` }}>
              <button onClick={() => openOrderPanel(orderSymbol, 'BUY', resolvedToken)}
                className="px-3 py-1 text-sm font-bold transition-colors"
                style={{ background: isBuy ? 'var(--accent-green)' : 'transparent', color: isBuy ? '#fff' : 'var(--text-label)' }}>
                BUY
              </button>
              <button onClick={() => openOrderPanel(orderSymbol, 'SELL', resolvedToken)}
                className="px-3 py-1 text-sm font-bold transition-colors"
                style={{ background: !isBuy ? 'var(--accent-red)' : 'transparent', color: !isBuy ? '#fff' : 'var(--text-label)' }}>
                SELL
              </button>
            </div>

            {/* Symbol + LTP */}
            <div>
              <div className="font-bold text-sm leading-tight" style={{ color: 'var(--text-bright)' }}>{orderSymbol}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {resolving ? (
                  <span className="text-[10px] animate-pulse" style={{ color: 'var(--text-label)' }}>
                    <Search size={9} className="inline mr-0.5" />resolving…
                  </span>
                ) : ltp ? (
                  <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                    ₹{ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                ) : (
                  <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>No price</span>
                )}
              </div>
            </div>
          </div>

          {/* Paper badge + close */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: 'rgba(41,121,255,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(41,121,255,0.3)' }}>
              <FlaskConical size={8} /> PAPER
            </span>
            <button onClick={closeOrderPanel} className="p-1 rounded hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-label)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Form body */}
        <div className="p-4 space-y-3" style={{ background: 'var(--panel-bg)' }}>

          {/* Resolve error */}
          {resolveError && (
            <div className="text-[11px] px-3 py-2 rounded-lg flex items-center gap-1.5"
              style={{ background: 'rgba(245,158,11,0.1)', color: 'rgb(245,158,11)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertCircle size={11} /> {resolveError}
            </div>
          )}

          {/* Order type */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
              Order Type
            </label>
            <div className="flex gap-1">
              {ORDER_TYPES.map(t => (
                <button key={t} onClick={() => { setOrderType(t); setPrice(''); setTriggerPrice(''); }}
                  className="flex-1 py-1.5 text-xs rounded font-medium transition-all"
                  style={{
                    background: orderType === t ? 'var(--accent-blue)' : 'var(--card-inner-bg)',
                    color:      orderType === t ? '#fff' : 'var(--text-label)',
                    border:     `1px solid ${orderType === t ? 'var(--accent-blue)' : 'var(--card-inner-border)'}`,
                  }}>{t}</button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
              Quantity
            </label>
            <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)}
              className="w-full h-9 px-3 rounded-lg text-sm font-mono focus:outline-none"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
          </div>

          {/* Limit price */}
          {showPrice && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
                Price (₹)
              </label>
              <input type="number" step="0.05" value={price} onChange={e => setPrice(e.target.value)}
                placeholder={ltp ? ltp.toFixed(2) : '0.00'}
                className="w-full h-9 px-3 rounded-lg text-sm font-mono focus:outline-none"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
          )}

          {/* Trigger price */}
          {showTrigger && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
                Trigger Price (₹)
              </label>
              <input type="number" step="0.05" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)}
                placeholder="0.00"
                className="w-full h-9 px-3 rounded-lg text-sm font-mono focus:outline-none"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl overflow-hidden text-xs"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>

            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--card-inner-border)' }}>
              <span style={{ color: 'var(--text-label)' }}>Required Margin</span>
              <span className="font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                {orderValue > 0 ? `₹${orderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
              </span>
            </div>

            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--card-inner-border)' }}>
              <span style={{ color: 'var(--text-label)' }}>Order Value</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-accent)' }}>
                {orderValue > 0 ? `₹${orderValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
              </span>
            </div>

            {/* Charges */}
            <button onClick={() => setChargesOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 hover:opacity-75 transition-opacity"
              style={{ borderBottom: chargesOpen && charges ? '1px solid var(--card-inner-border)' : 'none' }}>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-label)' }}>
                Charges
                <span className="text-[9px] px-1 py-px rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-label)' }}>EST</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono" style={{ color: 'rgb(245,158,11)' }}>
                  {charges ? `₹${charges.total.toFixed(2)}` : '—'}
                </span>
                {chargesOpen ? <ChevronUp size={10} style={{ color: 'var(--text-label)' }} /> : <ChevronDown size={10} style={{ color: 'var(--text-label)' }} />}
              </div>
            </button>

            {chargesOpen && charges && (
              <div className="px-3 py-2">
                <ChargeRow label="Brokerage"    value={charges.brokerage} />
                <ChargeRow label="STT"          value={charges.stt} />
                <ChargeRow label="Exchange Txn" value={charges.exchangeTxn} />
                <ChargeRow label="GST (18%)"    value={charges.gst} />
                <ChargeRow label="SEBI"         value={charges.sebi} />
                <ChargeRow label="Stamp Duty"   value={charges.stamp} />
                <div className="flex justify-between mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--card-inner-border)' }}>
                  <span className="font-bold" style={{ color: 'var(--text-accent)' }}>Total (est.)</span>
                  <span className="font-mono font-bold" style={{ color: 'rgb(245,158,11)' }}>₹{charges.total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="text-[11px] px-3 py-2 rounded-lg flex items-center gap-1.5"
              style={{
                background: result.ok ? 'rgba(var(--gain-rgb),0.1)' : 'rgba(var(--loss-rgb),0.1)',
                color:      result.ok ? 'var(--accent-green)'       : 'var(--accent-red)',
                border:     `1px solid ${result.ok ? 'rgba(var(--gain-rgb),0.25)' : 'rgba(var(--loss-rgb),0.25)'}`,
              }}>
              {result.ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
              {result.msg}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={submitting || resolving || !!resolveError}
            className="w-full h-10 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{
              background: isBuy ? 'var(--accent-green)' : 'var(--accent-red)',
              color: '#fff',
              boxShadow: isBuy ? '0 2px 14px rgba(var(--gain-rgb),0.4)' : '0 2px 14px rgba(var(--loss-rgb),0.4)',
            }}>
            {submitting ? 'Placing…' : resolving ? 'Resolving…' : `${isBuy ? '▲ Buy' : '▼ Sell'} ${orderSymbol}`}
          </button>
        </div>
      </div>
    </div>
  );
}
