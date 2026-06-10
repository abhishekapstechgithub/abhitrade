'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, FlaskConical, Zap, RefreshCw, ChevronDown, ChevronUp, AlertCircle, GripHorizontal } from 'lucide-react';

// ─── Drag hook ────────────────────────────────────────────────────────────────
function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Initialise to bottom-right on first mount
  useEffect(() => {
    const w = panelRef.current?.offsetWidth  ?? 340;
    const h = panelRef.current?.offsetHeight ?? 540;
    setPos({
      x: Math.max(0, window.innerWidth  - w - 20),
      y: Math.max(0, window.innerHeight - h - 20),
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!panelRef.current) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current || !panelRef.current) return;
      const w = panelRef.current.offsetWidth;
      const h = panelRef.current.offsetHeight;
      setPos({
        x: Math.min(Math.max(0, e.clientX - offset.current.x), window.innerWidth  - w),
        y: Math.min(Math.max(0, e.clientY - offset.current.y), window.innerHeight - h),
      });
    }
    function onUp() { dragging.current = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return { pos, panelRef, onMouseDown };
}
import { useUIStore } from '@/store/useUIStore';
import { useMarketStore } from '@/store/useMarketStore';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { cn } from '@/lib/utils/format';
import { OrderType, ProductType } from '@/types';

type OrderTab = 'Regular' | 'Stop Loss' | 'GTT' | 'SIP';
const PANEL_TABS: OrderTab[] = ['Regular', 'Stop Loss', 'GTT', 'SIP'];

const ORDER_TYPES: OrderType[] = ['MARKET', 'LIMIT', 'SL', 'SL-M', 'BO', 'CO'];
const PRODUCT_TYPES: { label: string; value: ProductType; desc: string }[] = [
  { label: 'MIS', value: 'MIS', desc: 'Intraday' },
  { label: 'CNC', value: 'CNC', desc: 'Delivery' },
  { label: 'NRML', value: 'NRML', desc: 'F&O' },
];

function getAngelExchange(symbol: string) {
  if (symbol.includes('NIFTY') || symbol.includes('SENSEX') || symbol.includes('BANKNIFTY')) return 'NSE';
  return 'NSE';
}
function getAngelVariety(orderType: string) {
  if (orderType === 'BO') return 'BRACKET';
  if (orderType === 'CO') return 'COVER';
  return 'NORMAL';
}
function getAngelOrderType(orderType: string) {
  if (orderType === 'SL') return 'STOPLOSS_LIMIT';
  if (orderType === 'SL-M') return 'STOPLOSS_MARKET';
  if (orderType === 'LIMIT') return 'LIMIT';
  return 'MARKET';
}
function toAngelProductType(pt: string): 'DELIVERY' | 'INTRADAY' | 'CARRYFORWARD' {
  if (pt === 'CNC') return 'DELIVERY';
  if (pt === 'MIS') return 'INTRADAY';
  return 'CARRYFORWARD';
}

interface LiveQuote {
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  netChange: number;
  percentChange: number;
  volume: number;
  token: string;
  tradingsymbol: string;
  exchange: string;
}

interface MarginResult {
  totalMarginRequired: number;
  charges: {
    brokeragecharges: number;
    exchangetransactioncharges: number;
    clearingcharge: number;
    ipft: number;
    gst: { cgst: number; sgst: number; igst: number };
    sebicharges: number;
    stampduty: number;
    stt: number;
    totalcharge: number;
  };
}

interface LocalCharges {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  gst: number;
  sebi: number;
  stamp: number;
  total: number;
}

function calcLocalCharges(value: number, productType: string): LocalCharges {
  const brokerage = productType === 'CNC' ? 0 : Math.min(20, value * 0.0003);
  const stt = productType === 'CNC' ? value * 0.001 : value * 0.00025;
  const exchangeTxn = value * 0.0000345;
  const gst = parseFloat(((brokerage + exchangeTxn) * 0.18).toFixed(4));
  const sebi = value * 0.000001;
  const stamp = value * 0.00015;
  const total = parseFloat((brokerage + stt + exchangeTxn + gst + sebi + stamp).toFixed(2));
  return {
    brokerage: parseFloat(brokerage.toFixed(2)),
    stt: parseFloat(stt.toFixed(2)),
    exchangeTxn: parseFloat(exchangeTxn.toFixed(2)),
    gst: parseFloat(gst.toFixed(2)),
    sebi: parseFloat(sebi.toFixed(4)),
    stamp: parseFloat(stamp.toFixed(2)),
    total,
  };
}

function ChargeRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-[3px]">
      <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{label}</span>
      <span className="font-mono text-[10px]" style={{ color: 'var(--text-dim)' }}>₹{value.toFixed(2)}</span>
    </div>
  );
}

export function OrderPanel() {
  const { orderPanelOpen, orderSide, orderSymbol, closeOrderPanel, openOrderPanel } = useUIStore();
  const getPrice = useMarketStore(s => s.getPrice);
  const { virtualBalance, placeOrder } = usePaperTradingStore();
  const { mode, isConnected, accessToken, credentials } = useAngelOneStore();

  const [panelTab, setPanelTab]     = useState<OrderTab>('Regular');
  const [orderType, setOrderType]   = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('CNC');
  const [qty, setQty]               = useState('1');
  const [price, setPrice]           = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [submitted, setSubmitted]   = useState(false);
  const [submitMsg, setSubmitMsg]   = useState('');
  const [error, setError]           = useState('');

  // SL / Target (used in Regular tab)
  const [useSLTarget, setUseSLTarget] = useState(false);
  const [trailingSL, setTrailingSL]   = useState(false);
  const [slPrice, setSlPrice]         = useState('');
  const [slPct, setSlPct]             = useState('5');
  const [tgtPrice, setTgtPrice]       = useState('');
  const [tgtPct, setTgtPct]           = useState('10');

  // Drag
  const { pos, panelRef, onMouseDown } = useDraggable();

  // Angel One live data — used in BOTH paper and live modes when connected
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null);
  const [ltpLoading, setLtpLoading] = useState(false);
  const [marginResult, setMarginResult] = useState<MarginResult | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);

  const isLive = mode === 'live' && isConnected;
  const mockLtp = orderSymbol ? getPrice(orderSymbol) : null;
  // Prefer live Angel One LTP over mock; works in both paper and live modes
  const ltp = liveQuote?.ltp ?? mockLtp;

  // ── Fetch live LTP from Angel One (called on panel open) ──────────────────
  const fetchLiveLtp = useCallback(async () => {
    if (!isConnected || !credentials.apiKey || !accessToken || !orderSymbol) return;
    setLtpLoading(true);
    setLiveQuote(null);
    setMarginResult(null);
    try {
      const res = await fetch('/api/angel-one/ltp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          accessToken,
          symbol: orderSymbol,
          exchange: getAngelExchange(orderSymbol),
        }),
      });
      if (res.ok) {
        const data: LiveQuote = await res.json();
        if (!('error' in data)) setLiveQuote(data);
      }
    } finally {
      setLtpLoading(false);
    }
  }, [isConnected, credentials.apiKey, accessToken, orderSymbol]);

  // ── Fetch margin + charges from Angel One (debounced, needs token) ─────────
  const fetchMargin = useCallback(async () => {
    if (!isConnected || !liveQuote?.token || !credentials.apiKey || !accessToken) return;
    const qtyNum = parseInt(qty) || 0;
    const execPrice = orderType === 'MARKET' ? liveQuote.ltp : parseFloat(price) || liveQuote.ltp;
    if (!qtyNum || qtyNum <= 0 || !execPrice) return;

    setMarginLoading(true);
    try {
      const res = await fetch('/api/angel-one/margin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          accessToken,
          positions: [{
            exchange: liveQuote.exchange,
            qty: qtyNum,
            price: execPrice,
            productType: toAngelProductType(productType),
            token: liveQuote.token,
            tradeType: orderSide,
          }],
        }),
      });
      if (res.ok) {
        const data: MarginResult = await res.json();
        if (!('error' in data)) setMarginResult(data);
      }
    } finally {
      setMarginLoading(false);
    }
  }, [isConnected, liveQuote, qty, price, orderType, productType, orderSide, credentials.apiKey, accessToken]);

  // ── SL / Target % ↔ price sync helpers ──────────────────────────────────
  function applySLPct(pct: string) {
    setSlPct(pct);
    const p = parseFloat(price) || ltp || 0;
    if (p) setSlPrice(String(parseFloat((p * (1 - parseFloat(pct) / 100)).toFixed(2))));
  }
  function applyTgtPct(pct: string) {
    setTgtPct(pct);
    const p = parseFloat(price) || ltp || 0;
    if (p) setTgtPrice(String(parseFloat((p * (1 + parseFloat(pct) / 100)).toFixed(2))));
  }

  // ── Reset + fetch LTP when panel opens / symbol changes ───────────────────
  useEffect(() => {
    if (orderPanelOpen) {
      setPanelTab('Regular');
      setOrderType('MARKET');
      setPrice('');
      setTriggerPrice('');
      setSubmitted(false);
      setSubmitMsg('');
      setError('');
      setLiveQuote(null);
      setMarginResult(null);
      setChargesOpen(false);
      setUseSLTarget(false);
      setSlPrice('');
      setTgtPrice('');
      fetchLiveLtp();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderPanelOpen, orderSymbol]);

  // ── Auto-fill price for LIMIT orders ─────────────────────────────────────
  useEffect(() => {
    if (orderType !== 'MARKET' && ltp && !price) {
      setPrice(ltp.toFixed(2));
    }
  }, [orderType, ltp, price]);

  // ── Debounced margin + charges fetch when inputs change ───────────────────
  useEffect(() => {
    if (!isConnected || !liveQuote?.token) return;
    const timer = setTimeout(() => { fetchMargin(); }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, price, productType, orderType, orderSide, liveQuote?.token, isConnected]);

  if (!orderPanelOpen) return null;

  const isBuy      = orderSide === 'BUY';
  const showPrice  = orderType !== 'MARKET';
  const slError    = useSLTarget && slPrice  && price && isBuy ? parseFloat(slPrice)  >= parseFloat(price) : false;
  const tgtError   = useSLTarget && tgtPrice && price && isBuy ? parseFloat(tgtPrice) <= parseFloat(price) : false;
  const showTrigger = orderType === 'SL' || orderType === 'SL-M';

  const execPrice = orderType === 'MARKET' ? (ltp ?? 0) : parseFloat(price) || 0;
  const qtyNum = parseInt(qty) || 0;
  const orderValue = execPrice * qtyNum;

  // Charges: use real Angel One data when available, else estimate locally
  const angelCharges = marginResult?.charges;
  const localCharges = !angelCharges && orderValue > 0 ? calcLocalCharges(orderValue, productType) : null;
  const totalCharges = angelCharges?.totalcharge ?? localCharges?.total ?? 0;

  // Estimated required margin when Angel One data not yet fetched
  const estimatedMargin = orderValue > 0 && !marginResult
    ? orderValue * (productType === 'MIS' ? 0.2 : 1)
    : null;

  const handleSubmit = async () => {
    setError('');
    if (!qtyNum || qtyNum <= 0) { setError('Enter a valid quantity'); return; }
    if (showPrice && !parseFloat(price)) { setError('Enter a valid price'); return; }
    if (!execPrice || execPrice <= 0) { setError('Price unavailable — try again'); return; }

    if (isLive) {
      // ── Live order via Angel One API ──────────────────────────────────────
      try {
        const angelOrder = {
          variety: getAngelVariety(orderType),
          tradingsymbol: liveQuote?.tradingsymbol || orderSymbol,
          symboltoken: liveQuote?.token || '',
          transactiontype: orderSide,
          exchange: liveQuote?.exchange || getAngelExchange(orderSymbol),
          ordertype: getAngelOrderType(orderType),
          producttype: productType,
          duration: 'DAY',
          price: orderType === 'MARKET' ? '0' : execPrice.toFixed(2),
          squareoff: '0',
          stoploss: '0',
          quantity: String(qtyNum),
          triggerprice: showTrigger && triggerPrice ? parseFloat(triggerPrice).toFixed(2) : '0',
        };
        const res = await fetch('/api/angel-one/place-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, apiKey: credentials.apiKey, order: angelOrder }),
        });
        const data = await res.json();
        if (!res.ok || data.error) { setError(data.error || 'Order failed'); return; }
        setSubmitMsg(`✓ Live Order #${data.orderId || 'placed'}!`);
      } catch {
        setError('Network error — check your connection');
        return;
      }
    } else {
      // ── Paper order — uses real LTP if available, virtual balance ─────────
      if (isBuy && orderValue + totalCharges > virtualBalance) {
        setError('Insufficient virtual balance');
        return;
      }
      placeOrder(
        orderSymbol, orderSide, qtyNum, execPrice,
        orderType === 'MARKET' ? 'MARKET' : 'LIMIT',
        productType
      );
      setSubmitMsg('✓ Paper Order Placed!');
    }

    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setSubmitMsg(''); closeOrderPanel(); }, 1400);
  };

  return (
    <div
      ref={panelRef}
      className="w-[340px] z-[9999] shadow-2xl"
      style={{
        position: pos ? 'fixed' : 'fixed',
        left:     pos?.x ?? 'auto',
        top:      pos?.y ?? 'auto',
        right:    pos ? 'auto' : 20,
        bottom:   pos ? 'auto' : 20,
      }}
    >
      <div className={cn('rounded-xl overflow-hidden')}
        style={{
          background: 'var(--panel-bg)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${isBuy ? 'rgba(var(--gain-rgb),0.45)' : 'rgba(var(--loss-rgb),0.45)'}`,
        }}>

        {/* ── Drag handle strip ────────────────────────────────────────── */}
        <div
          onMouseDown={onMouseDown}
          className="flex items-center justify-center py-1 cursor-grab active:cursor-grabbing"
          style={{ background: isBuy ? 'rgba(var(--gain-rgb),0.08)' : 'rgba(var(--loss-rgb),0.08)', borderBottom: '1px solid var(--panel-divider)' }}
          title="Drag to move"
        >
          <GripHorizontal size={14} style={{ color: 'var(--text-label)', opacity: 0.5 }} />
        </div>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{
            background: isBuy ? 'rgba(var(--gain-rgb),0.12)' : 'rgba(var(--loss-rgb),0.12)',
            borderBottom: `1px solid ${isBuy ? 'rgba(var(--gain-rgb),0.25)' : 'rgba(var(--loss-rgb),0.25)'}`,
          }}>
          <div className="flex items-center gap-2">
            {/* BUY / SELL toggle */}
            <div className="flex rounded-lg overflow-hidden"
              style={{ border: `1px solid ${isBuy ? 'rgba(var(--gain-rgb),0.5)' : 'rgba(var(--loss-rgb),0.5)'}` }}>
              <button onClick={() => openOrderPanel(orderSymbol, 'BUY')}
                className="px-3 py-1 text-sm font-bold transition-colors"
                style={{ background: isBuy ? 'var(--accent-green)' : 'transparent', color: isBuy ? '#fff' : 'var(--text-label)' }}>
                BUY
              </button>
              <button onClick={() => openOrderPanel(orderSymbol, 'SELL')}
                className="px-3 py-1 text-sm font-bold transition-colors"
                style={{ background: !isBuy ? 'var(--accent-red)' : 'transparent', color: !isBuy ? '#fff' : 'var(--text-label)' }}>
                SELL
              </button>
            </div>

            {/* Symbol + LTP */}
            <div>
              <div className="font-bold text-sm leading-tight" style={{ color: 'var(--text-bright)' }}>{orderSymbol}</div>
              <div className="flex items-center gap-1 mt-0.5">
                {ltpLoading ? (
                  <span className="text-[10px] animate-pulse" style={{ color: 'var(--text-label)' }}>Fetching…</span>
                ) : ltp ? (
                  <>
                    <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                      ₹{ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                    {liveQuote ? (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: 'rgba(0,212,255,0.12)', color: 'rgb(0,212,255)', border: '1px solid rgba(0,212,255,0.3)' }}>
                        LIVE
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
                        MOCK
                      </span>
                    )}
                    {liveQuote && liveQuote.netChange !== 0 && (
                      <span className="text-[9px] font-semibold"
                        style={{ color: liveQuote.netChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {liveQuote.netChange >= 0 ? '+' : ''}{liveQuote.percentChange?.toFixed(2)}%
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>No price</span>
                )}
                {isConnected && !ltpLoading && (
                  <button onClick={fetchLiveLtp} title="Refresh LTP"
                    className="opacity-40 hover:opacity-90 transition-opacity ml-0.5">
                    <RefreshCw size={9} style={{ color: 'var(--text-dim)' }} />
                  </button>
                )}
              </div>
              {liveQuote && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px]" style={{ color: 'var(--text-label)' }}>
                    H:{liveQuote.high.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    &nbsp;L:{liveQuote.low.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    &nbsp;O:{liveQuote.open.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Mode badge + close */}
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold"
                style={{ background: 'rgba(var(--gain-rgb),0.18)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.4)' }}>
                <Zap size={8} /> LIVE
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold"
                style={{ background: 'rgba(245,158,11,0.18)', color: 'rgb(245,158,11)', border: '1px solid rgba(245,158,11,0.4)' }}>
                <FlaskConical size={8} /> PAPER
              </span>
            )}
            <button onClick={closeOrderPanel} className="p-1 rounded hover:opacity-70 transition-opacity"
              style={{ color: 'var(--text-label)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex px-1 pt-1" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
          {PANEL_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setPanelTab(t)}
              className="px-3 py-1.5 text-xs font-medium relative transition-colors"
              style={{
                color: panelTab === t ? (isBuy ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-label)',
              }}
            >
              {t}
              {panelTab === t && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t"
                  style={{ background: isBuy ? 'var(--accent-green)' : 'var(--accent-red)' }} />
              )}
            </button>
          ))}
        </div>

        {/* ── Form body ───────────────────────────────────────────────── */}
        <div className="p-4 space-y-3" style={{ background: 'var(--panel-bg)' }}>

          {/* Product type */}
          <div className="flex gap-1">
            {PRODUCT_TYPES.map(pt => (
              <button key={pt.value} onClick={() => setProductType(pt.value)}
                className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: productType === pt.value ? 'rgba(41,121,255,0.2)' : 'var(--card-inner-bg)',
                  color: productType === pt.value ? 'var(--accent-blue)' : 'var(--text-label)',
                  border: `1px solid ${productType === pt.value ? 'rgba(41,121,255,0.45)' : 'var(--card-inner-border)'}`,
                }}>
                {pt.label}
                <div className="text-[10px] font-normal opacity-70">{pt.desc}</div>
              </button>
            ))}
          </div>

          {/* Order type */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
              Order Type
            </label>
            <div className="flex gap-1 flex-wrap">
              {ORDER_TYPES.map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  className="px-2 py-1 text-xs rounded font-medium transition-all"
                  style={{
                    background: orderType === t ? 'var(--accent-blue)' : 'var(--card-inner-bg)',
                    color: orderType === t ? '#fff' : 'var(--text-label)',
                    border: `1px solid ${orderType === t ? 'var(--accent-blue)' : 'var(--card-inner-border)'}`,
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
              className="w-full h-9 px-3 rounded-lg text-sm font-mono focus:outline-none transition-all"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
          </div>

          {/* Limit price */}
          {showPrice && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
                Price (₹)
              </label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)}
                placeholder={ltp ? ltp.toFixed(2) : '0.00'}
                className="w-full h-9 px-3 rounded-lg text-sm font-mono focus:outline-none transition-all"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
          )}

          {/* Trigger price */}
          {showTrigger && (
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-label)' }}>
                Trigger Price (₹)
              </label>
              <input type="number" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)}
                placeholder="0.00"
                className="w-full h-9 px-3 rounded-lg text-sm font-mono focus:outline-none transition-all"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent-blue)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
          )}

          {/* ── Set Stop Loss / Target ──────────────────────────────── */}
          {panelTab === 'Regular' && (
            <div className="rounded-xl overflow-hidden"
              style={{ border: useSLTarget ? '1px solid var(--card-inner-border)' : '1px dashed var(--card-inner-border)', background: useSLTarget ? 'var(--card-inner-bg)' : 'transparent' }}>
              {/* Toggle row */}
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  id="sl-tgt-toggle"
                  checked={useSLTarget}
                  onChange={(e) => setUseSLTarget(e.target.checked)}
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
                <label htmlFor="sl-tgt-toggle" className="text-xs font-semibold cursor-pointer select-none"
                  style={{ color: 'var(--text-accent)' }}>
                  Set Stop Loss / Target
                </label>
                <span className="ml-auto w-4 h-4 rounded-full border text-[9px] flex items-center justify-center cursor-help"
                  style={{ border: '1px solid var(--text-label)', color: 'var(--text-label)' }}
                  title="Automatically place a stop-loss and target order when your main order is filled">
                  i
                </span>
              </div>

              {useSLTarget && (
                <div className="px-3 pb-3 space-y-2" style={{ borderTop: '1px solid var(--card-inner-border)' }}>
                  <div className="flex gap-2 mt-2">
                    {/* Stop Loss */}
                    <div className="flex-1">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Stop Loss</span>
                        <button
                          type="button"
                          onClick={() => setTrailingSL(v => !v)}
                          className="text-[9px] px-1.5 py-0.5 rounded border font-semibold transition-colors"
                          style={{
                            background: trailingSL ? 'rgba(41,121,255,0.15)' : 'transparent',
                            color: trailingSL ? 'var(--accent-blue)' : 'var(--text-label)',
                            border: `1px solid ${trailingSL ? 'rgba(41,121,255,0.4)' : 'var(--card-inner-border)'}`,
                          }}
                        >
                          + Trailing SL
                        </button>
                      </div>
                      <div className="flex rounded-lg overflow-hidden"
                        style={{ border: `1px solid ${slError ? 'rgba(var(--loss-rgb),0.6)' : 'var(--card-inner-border)'}` }}>
                        <input
                          type="number"
                          step="0.05"
                          value={slPrice}
                          onChange={(e) => setSlPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-0 flex-1 px-2 py-1.5 text-xs font-mono focus:outline-none"
                          style={{ background: 'var(--panel-bg)', color: 'var(--text-bright)' }}
                        />
                        <div className="flex items-center px-1" style={{ borderLeft: '1px solid var(--card-inner-border)', background: 'var(--card-inner-bg)' }}>
                          <input
                            type="number"
                            value={slPct}
                            min={0}
                            max={100}
                            onChange={(e) => applySLPct(e.target.value)}
                            className="w-7 text-center text-[10px] focus:outline-none bg-transparent"
                            style={{ color: 'var(--text-bright)' }}
                          />
                          <span className="text-[10px] pr-1" style={{ color: 'var(--text-label)' }}>%</span>
                        </div>
                      </div>
                      {slError && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--accent-red)' }}>
                          Trigger price should be less than Entry Price
                        </p>
                      )}
                    </div>

                    {/* Target */}
                    <div className="flex-1">
                      <div className="mb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Target</span>
                      </div>
                      <div className="flex rounded-lg overflow-hidden"
                        style={{ border: `1px solid ${tgtError ? 'rgba(var(--loss-rgb),0.6)' : 'var(--card-inner-border)'}` }}>
                        <input
                          type="number"
                          step="0.05"
                          value={tgtPrice}
                          onChange={(e) => setTgtPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-0 flex-1 px-2 py-1.5 text-xs font-mono focus:outline-none"
                          style={{ background: 'var(--panel-bg)', color: 'var(--text-bright)' }}
                        />
                        <div className="flex items-center px-1" style={{ borderLeft: '1px solid var(--card-inner-border)', background: 'var(--card-inner-bg)' }}>
                          <input
                            type="number"
                            value={tgtPct}
                            min={0}
                            max={1000}
                            onChange={(e) => applyTgtPct(e.target.value)}
                            className="w-7 text-center text-[10px] focus:outline-none bg-transparent"
                            style={{ color: 'var(--text-bright)' }}
                          />
                          <span className="text-[10px] pr-1" style={{ color: 'var(--text-label)' }}>%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Limit price hint */}
                  {tgtPrice && (
                    <p className="text-[10px]" style={{ color: 'var(--text-label)' }}>
                      Limit Price: <span style={{ color: 'var(--text-accent)' }}>{tgtPrice}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Summary card ─────────────────────────────────────────── */}
          <div className="rounded-xl overflow-hidden text-xs"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>

            {/* Required Margin */}
            <div className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid var(--card-inner-border)' }}>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-label)' }}>
                Req. Margin
                {isConnected && (
                  <span className="text-[9px] px-1 py-px rounded font-bold"
                    style={{ background: 'rgba(0,212,255,0.12)', color: 'rgb(0,212,255)', border: '1px solid rgba(0,212,255,0.25)' }}>
                    API
                  </span>
                )}
              </span>
              <span className="font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                {marginLoading ? (
                  <span className="animate-pulse" style={{ color: 'var(--text-label)' }}>…</span>
                ) : marginResult ? (
                  `₹${marginResult.totalMarginRequired.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                ) : estimatedMargin ? (
                  <span style={{ color: 'var(--text-dim)' }}>~₹{estimatedMargin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                ) : '—'}
              </span>
            </div>

            {/* Order Value */}
            <div className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid var(--card-inner-border)' }}>
              <span style={{ color: 'var(--text-label)' }}>Order Value</span>
              <span className="font-mono font-semibold" style={{ color: 'var(--text-accent)' }}>
                {orderValue > 0 ? `₹${orderValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
              </span>
            </div>

            {/* Charges row — collapsible */}
            <button onClick={() => setChargesOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 transition-opacity hover:opacity-75"
              style={{ borderBottom: chargesOpen ? '1px solid var(--card-inner-border)' : 'none' }}>
              <span className="flex items-center gap-1.5" style={{ color: 'var(--text-label)' }}>
                Charges
                {angelCharges ? (
                  <span className="text-[9px] px-1 py-px rounded font-bold"
                    style={{ background: 'rgba(0,212,255,0.12)', color: 'rgb(0,212,255)', border: '1px solid rgba(0,212,255,0.25)' }}>
                    API
                  </span>
                ) : orderValue > 0 ? (
                  <span className="text-[9px] px-1 py-px rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-label)' }}>
                    EST
                  </span>
                ) : null}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono" style={{ color: 'rgb(245,158,11)' }}>
                  {totalCharges > 0 ? `₹${totalCharges.toFixed(2)}` : '—'}
                </span>
                {chargesOpen
                  ? <ChevronUp size={10} style={{ color: 'var(--text-label)' }} />
                  : <ChevronDown size={10} style={{ color: 'var(--text-label)' }} />}
              </div>
            </button>

            {/* Charges breakdown */}
            {chargesOpen && orderValue > 0 && (
              <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--card-inner-border)' }}>
                {angelCharges ? (
                  <>
                    <ChargeRow label="Brokerage" value={angelCharges.brokeragecharges} />
                    <ChargeRow label="STT" value={angelCharges.stt} />
                    <ChargeRow label="Exchange Txn" value={angelCharges.exchangetransactioncharges} />
                    <ChargeRow
                      label={`GST (${angelCharges.gst.igst > 0 ? 'IGST' : 'CGST+SGST'})`}
                      value={angelCharges.gst.igst > 0
                        ? angelCharges.gst.igst
                        : angelCharges.gst.cgst + angelCharges.gst.sgst}
                    />
                    <ChargeRow label="SEBI" value={angelCharges.sebicharges} />
                    <ChargeRow label="Stamp Duty" value={angelCharges.stampduty} />
                    {angelCharges.clearingcharge > 0 && <ChargeRow label="Clearing" value={angelCharges.clearingcharge} />}
                    {angelCharges.ipft > 0 && <ChargeRow label="IPFT" value={angelCharges.ipft} />}
                    <div className="flex justify-between mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--card-inner-border)' }}>
                      <span className="font-bold" style={{ color: 'var(--text-accent)' }}>Total</span>
                      <span className="font-mono font-bold" style={{ color: 'rgb(245,158,11)' }}>₹{angelCharges.totalcharge.toFixed(2)}</span>
                    </div>
                  </>
                ) : localCharges ? (
                  <>
                    <ChargeRow label="Brokerage" value={localCharges.brokerage} />
                    <ChargeRow label="STT" value={localCharges.stt} />
                    <ChargeRow label="Exchange Txn" value={localCharges.exchangeTxn} />
                    <ChargeRow label="GST (18%)" value={localCharges.gst} />
                    <ChargeRow label="SEBI" value={localCharges.sebi} />
                    <ChargeRow label="Stamp Duty" value={localCharges.stamp} />
                    <div className="flex justify-between mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--card-inner-border)' }}>
                      <span className="font-bold" style={{ color: 'var(--text-accent)' }}>Total (est.)</span>
                      <span className="font-mono font-bold" style={{ color: 'rgb(245,158,11)' }}>₹{localCharges.total.toFixed(2)}</span>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* Paper balance / live mode footer */}
            <div className="flex items-center justify-between px-3 py-2">
              {isLive ? (
                <>
                  <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>⚡ AngelOne Live</span>
                  <span className="font-mono font-bold text-[11px]" style={{ color: 'var(--accent-green)' }}>LIVE ORDER</span>
                </>
              ) : (
                <>
                  <span style={{ color: 'rgb(245,158,11)' }}>⚗ Paper Balance</span>
                  <span className="font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                    ₹{virtualBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-[11px] px-3 py-2 rounded-lg flex items-center gap-1.5"
              style={{ background: 'rgba(var(--loss-rgb),0.1)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.25)' }}>
              <AlertCircle size={11} /> {error}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={submitted}
            className="w-full h-10 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
            style={{
              background: submitted
                ? (isBuy ? 'rgba(var(--gain-rgb),0.3)' : 'rgba(var(--loss-rgb),0.3)')
                : (isBuy ? 'var(--accent-green)' : 'var(--accent-red)'),
              color: '#fff',
              boxShadow: isBuy
                ? '0 2px 14px rgba(var(--gain-rgb),0.4)'
                : '0 2px 14px rgba(var(--loss-rgb),0.4)',
            }}>
            {submitted
              ? (submitMsg || '✓ Order Placed!')
              : isLive
                ? `⚡ ${isBuy ? 'Buy' : 'Sell'} Live — ${orderSymbol}`
                : `${isBuy ? '▲ Buy' : '▼ Sell'} ${orderSymbol} (Paper)`}
          </button>
        </div>
      </div>
    </div>
  );
}
