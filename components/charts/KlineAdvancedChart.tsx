'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import {
  init as klineInit, dispose as klineDispose, registerIndicator,
  CandleType, OverlayMode,
  type Chart as KChart,
} from 'klinecharts';
import {
  Loader2, RefreshCw, Sun, Moon, TrendingUp, TrendingDown,
  Search, X, Check, Activity, Trash2, MousePointer2,
  ChevronDown, Code2, Plus, Maximize2, Minus, AlignLeft,
  BarChart2, Camera, Settings, RotateCcw, RotateCw,
  HelpCircle, Bell, Layers, Lock, Unlock, Eye, ZoomIn, Type,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface KData { timestamp: number; open: number; high: number; low: number; close: number; volume: number; turnover?: number }
type ChartTheme = 'light' | 'dark';

// ─── Built-in indicator catalogue ─────────────────────────────────────────────
interface IndDef {
  name: string; label: string; group: string;
  params?: string; pane: 'main' | 'osc';
  color?: string;
}

const BUILT_IN_INDICATORS: IndDef[] = [
  // ── Moving Averages ──────────────────────────────────────────────────────
  { name:'MA',    label:'Moving Average (MA)',          group:'Moving Averages', params:'5,10,20,60', pane:'main', color:'#3b82f6' },
  { name:'EMA',   label:'Exponential MA (EMA)',         group:'Moving Averages', params:'12,26',       pane:'main', color:'#f97316' },
  { name:'SMA',   label:'Simple MA (SMA)',              group:'Moving Averages', params:'5,20',        pane:'main', color:'#22c55e' },
  { name:'WMA',   label:'Weighted MA (WMA)',            group:'Moving Averages', params:'12',          pane:'main', color:'#06b6d4' },
  { name:'DEMA',  label:'Double EMA (DEMA)',            group:'Moving Averages', params:'12',          pane:'main', color:'#8b5cf6' },
  { name:'TEMA',  label:'Triple EMA (TEMA)',            group:'Moving Averages', params:'12',          pane:'main', color:'#ec4899' },
  // ── Trend ────────────────────────────────────────────────────────────────
  { name:'BOLL',  label:'Bollinger Bands (BOLL)',       group:'Trend',           params:'20,2',        pane:'main', color:'#6366f1' },
  { name:'SAR',   label:'Parabolic SAR',                group:'Trend',           params:'0.02,0.2',    pane:'main', color:'#f59e0b' },
  { name:'DMI',   label:'Directional Movement (DMI)',  group:'Trend',           params:'14,6',        pane:'osc',  color:'#3b82f6' },
  { name:'TRIX',  label:'Triple EMA Oscillator (TRIX)',group:'Trend',           params:'12,9',        pane:'osc',  color:'#f97316' },
  { name:'DMA',   label:'Different MA (DMA)',           group:'Trend',           params:'10,50,10',    pane:'osc',  color:'#22c55e' },
  // ── Oscillators ──────────────────────────────────────────────────────────
  { name:'MACD',  label:'MACD (12,26,9)',               group:'Oscillators',     params:'12,26,9',     pane:'osc',  color:'#3b82f6' },
  { name:'KDJ',   label:'KDJ / Stochastic',            group:'Oscillators',     params:'9,3,3',       pane:'osc',  color:'#22c55e' },
  { name:'RSI',   label:'Relative Strength Index',     group:'Oscillators',     params:'6,12,24',     pane:'osc',  color:'#f59e0b' },
  { name:'BIAS',  label:'Bias (BIAS)',                  group:'Oscillators',     params:'6,12,24',     pane:'osc',  color:'#ef4444' },
  { name:'BRAR',  label:'Bull-Bear Ratio (BRAR)',       group:'Oscillators',     params:'26',          pane:'osc',  color:'#8b5cf6' },
  { name:'CCI',   label:'Commodity Channel Index',     group:'Oscillators',     params:'14',          pane:'osc',  color:'#a78bfa' },
  { name:'CR',    label:'Creative Ratio (CR)',          group:'Oscillators',     params:'26,10',       pane:'osc',  color:'#f97316' },
  { name:'PSY',   label:'Psychological Line (PSY)',     group:'Oscillators',     params:'12',          pane:'osc',  color:'#06b6d4' },
  { name:'WR',    label:"Williams %R",                  group:'Oscillators',     params:'6,10,14',     pane:'osc',  color:'#ec4899' },
  { name:'MTM',   label:'Momentum (MTM)',               group:'Oscillators',     params:'6,10',        pane:'osc',  color:'#22c55e' },
  { name:'EMV',   label:'Ease of Movement (EMV)',       group:'Oscillators',     params:'14,9',        pane:'osc',  color:'#3b82f6' },
  // ── Volume ───────────────────────────────────────────────────────────────
  { name:'VOL',   label:'Volume (VOL)',                 group:'Volume',          params:'5,10',        pane:'osc',  color:'#64748b' },
  { name:'OBV',   label:'On Balance Volume (OBV)',      group:'Volume',          params:'30',          pane:'osc',  color:'#06b6d4' },
  { name:'VR',    label:'Volume Ratio (VR)',            group:'Volume',          params:'26,6',        pane:'osc',  color:'#f59e0b' },
];

// ─── Drawing tools (overlays) ─────────────────────────────────────────────────
// IDs must match KlineCharts v9 built-in overlay names exactly
const DRAW_TOOLS = [
  { id:'cursor',                 label:'Cursor (Esc)',      icon:'cursor'  },
  { id:'horizontalStraightLine', label:'Horizontal Line',   icon:'hline'   },
  { id:'straightLine',           label:'Trend Line',        icon:'trend'   },
  { id:'rayLine',                label:'Ray Line',          icon:'ray'     },
  { id:'segment',                label:'Line Segment',      icon:'trend'   },
  { id:'fibonacciLine',          label:'Fibonacci Levels',  icon:'fib'     },
  { id:'parallelStraightLine',   label:'Parallel Channel',  icon:'channel' },
  { id:'text',                   label:'Text Label',        icon:'text'    },
];

// ─── Theme styles ─────────────────────────────────────────────────────────────
function buildStyles(isDark: boolean) {
  const bg    = isDark ? '#131722' : '#ffffff';
  const text  = isDark ? '#9db2c8' : '#374151';
  const grid  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const axis  = isDark ? '#2a3350' : '#e5e7eb';
  return {
    grid: {
      horizontal: { show: true, size: 1, color: grid, style: 'dashed', dashedValue: [4, 2] },
      vertical:   { show: false },
    },
    candle: {
      margin:    { top: 0.1, bottom: 0.1 },
      type:      CandleType.CandleUpStroke,
      bar:       { upColor: '#26a69a', downColor: '#ef5350', noChangeColor: '#888' },
      area:      { lineSize: 2, lineColor: '#4f46e5', value: 'close', backgroundColor: [{ offset: 0, color: 'rgba(79,70,229,0.35)' }, { offset: 1, color: 'rgba(79,70,229,0.01)' }] },
      priceMark: {
        show: true,
        high: { show: true, color: text, textOffset: 5, textSize: 10, textFamily: 'system-ui', textWeight: '400' },
        low:  { show: true, color: text, textOffset: 5, textSize: 10, textFamily: 'system-ui', textWeight: '400' },
        last: { show: true, upColor: '#26a69a', downColor: '#ef5350', noChangeColor: '#888', line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1 }, text: { show: true, style: 'fill', size: 11, paddingLeft: 4, paddingTop: 2, paddingRight: 4, paddingBottom: 2, borderRadius: 2, borderSize: 1, borderColor: '', color: '#fff', family: 'system-ui', weight: '500' } },
      },
      tooltip: {
        showRule: 'always', showType: 'standard',
        labels: ['Time', 'Open', 'High', 'Low', 'Close', 'Volume'],
        values: null,
        defaultValue: 'n/a',
        rect: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 6, offsetLeft: 8, offsetTop: 8, offsetRight: 8, borderRadius: 4, borderSize: 1, borderColor: axis, color: bg },
        text: { size: 11, family: 'system-ui', weight: '400', color: text, marginLeft: 8, marginTop: 4, marginRight: 8, marginBottom: 0 },
      },
    },
    indicator: {
      ohlc: { upColor: 'rgba(38,166,154,0.65)', downColor: 'rgba(239,83,80,0.65)', noChangeColor: '#888' },
      bars: [{ style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2,2], upColor: 'rgba(38,166,154,0.65)', downColor: 'rgba(239,83,80,0.65)', noChangeColor: '#888' }],
      lines: [{ style: 'solid', smooth: false, size: 1, dashedValue: [2,2], color: '#3b82f6' }, { style: 'solid', smooth: false, size: 1, dashedValue: [2,2], color: '#f97316' }, { style: 'solid', smooth: false, size: 1, dashedValue: [2,2], color: '#22c55e' }, { style: 'solid', smooth: false, size: 1, dashedValue: [2,2], color: '#ef4444' }, { style: 'solid', smooth: false, size: 1, dashedValue: [2,2], color: '#8b5cf6' }],
      circles: [{ style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2,2], upColor: 'rgba(38,166,154,0.65)', downColor: 'rgba(239,83,80,0.65)', noChangeColor: '#888' }],
      lastValueMark: { show: false, text: { show: false, style: 'fill', color: '#fff', size: 11, family: 'system-ui', weight: '400', paddingLeft: 4, paddingTop: 2, paddingRight: 4, paddingBottom: 2, borderRadius: 2, borderSize: 1, borderColor: '' } },
      tooltip: { showRule: 'always', showType: 'standard', showName: true, showParams: true, defaultValue: 'n/a', text: { size: 11, family: 'system-ui', weight: '400', color: text, marginTop: 4, marginRight: 8, marginBottom: 0, marginLeft: 8 } },
    },
    xAxis: {
      show: true, size: 'auto',
      axisLine: { show: true, color: axis, size: 1 },
      tickLine: { show: true, size: 1, length: 3, color: axis },
      tickText: { show: true, color: text, family: 'system-ui', weight: '400', size: 11, marginStart: 4, marginEnd: 4 },
      tooltip: { show: true, showRule: 'follow_cross', text: { color: bg, size: 11, family: 'system-ui', weight: '400', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2, borderColor: text, backgroundColor: text } },
    },
    yAxis: {
      show: true, size: 'auto', position: 'right', type: 'normal', inside: false, reverse: false,
      axisLine: { show: false, color: axis, size: 1 },
      tickLine: { show: false, size: 1, length: 3, color: axis },
      tickText: { show: true, color: text, family: 'system-ui', weight: '400', size: 11, marginStart: 4, marginEnd: 4 },
      tooltip: { show: true, showRule: 'follow_cross', text: { color: bg, size: 11, family: 'system-ui', weight: '400', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2, borderColor: text, backgroundColor: text } },
    },
    separator: { size: 1, color: axis, fill: true, activeBackgroundColor: 'rgba(79,70,229,0.08)' },
    crosshair: {
      show: true,
      horizontal: { show: true, line: { show: true, style: 'dashed', dashedValue: [4,2], size: 1, color: isDark ? '#4a5568' : '#cbd5e1' }, text: { show: true, style: 'fill', color: bg, size: 11, family: 'system-ui', weight: '400', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2, borderSize: 1, borderColor: text, backgroundColor: text } },
      vertical:   { show: true, line: { show: true, style: 'dashed', dashedValue: [4,2], size: 1, color: isDark ? '#4a5568' : '#cbd5e1' }, text: { show: true, style: 'fill', color: bg, size: 11, family: 'system-ui', weight: '400', paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2, borderRadius: 2, borderSize: 1, borderColor: text, backgroundColor: text } },
    },
    overlay: {
      line: { style: 'solid', smooth: false, size: 1, dashedValue: [2,2], color: '#3b82f6' },
      text: { style: 'fill', color: bg, size: 12, family: 'system-ui', weight: '400', paddingLeft: 4, paddingTop: 4, paddingRight: 4, paddingBottom: 4, borderRadius: 2, borderSize: 1, borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
      rectText: { style: 'fill', color: bg, size: 12, family: 'system-ui', weight: '400', paddingLeft: 4, paddingTop: 4, paddingRight: 4, paddingBottom: 4, borderRadius: 2, borderSize: 1, borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
      circle: { style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2,2], color: 'rgba(79,70,229,0.3)', borderColor: '#4f46e5' },
      rect: { style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2,2], color: 'rgba(79,70,229,0.1)', borderColor: '#4f46e5' },
      polygon: { style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2,2], color: 'rgba(79,70,229,0.1)', borderColor: '#4f46e5' },
      arc:  { style: 'fill', borderStyle: 'solid', borderSize: 1, borderDashedValue: [2,2], color: 'rgba(79,70,229,0.1)', borderColor: '#4f46e5' },
      point: { color: '#4f46e5', borderColor: 'rgba(79,70,229,0.3)', borderSize: 1, radius: 5, activeColor: '#4f46e5', activeBorderColor: 'rgba(79,70,229,0.4)', activeBorderSize: 3, activeRadius: 6 },
    },
  };
}

// ─── Custom indicator formula ──────────────────────────────────────────────────
let customIndCounter = 0;
function registerCustomIndicator(name: string, label: string, formula: string, pane: 'main'|'osc') {
  try {
    registerIndicator({
      name,
      shortName: label.substring(0, 12),
      series: pane === 'osc' ? 'normal' : 'price',
      figures: [{ key: 'value', title: `${label}: `, type: 'line' }],
      calcParams: [],
      calc: (dataList) => {
        const o=dataList.map(d=>d.open), h=dataList.map(d=>d.high),
              l=dataList.map(d=>d.low), c=dataList.map(d=>d.close),
              v=dataList.map(d=>d.volume);

        function smA(arr:number[],p:number):number[]{return arr.map((_,i)=>i<p-1?NaN:arr.slice(i-p+1,i+1).reduce((a,b)=>a+b)/p);}
        function emA(arr:number[],p:number):number[]{const k=2/(p+1);const r=[arr[0]];for(let i=1;i<arr.length;i++)r.push(arr[i]*k+r[i-1]*(1-k));return r;}
        function wmA(arr:number[],p:number):number[]{return arr.map((_,i)=>{if(i<p-1)return NaN;let s=0,w=0;for(let j=0;j<p;j++){s+=arr[i-j]*(p-j);w+=p-j;}return s/w;});}
        function hst(arr:number[],p:number):number[]{return arr.map((_,i)=>i<p-1?NaN:Math.max(...arr.slice(i-p+1,i+1)));}
        function lst(arr:number[],p:number):number[]{return arr.map((_,i)=>i<p-1?NaN:Math.min(...arr.slice(i-p+1,i+1)));}
        function sdv(arr:number[],p:number):number[]{return arr.map((_,i)=>{if(i<p-1)return NaN;const sl=arr.slice(i-p+1,i+1),m=sl.reduce((a,b)=>a+b)/p;return Math.sqrt(sl.reduce((a,v)=>a+(v-m)**2,0)/p);});}

        // eslint-disable-next-line no-new-func
        const fn = new Function('open','high','low','close','volume','sma','ema','wma','highest','lowest','stdev',
          `"use strict"; try { return (${formula}); } catch(e) { return close.map(()=>NaN); }`);
        const result = fn(o,h,l,c,v,smA,emA,wmA,hst,lst,sdv);
        const arr: number[] = Array.isArray(result) ? result : dataList.map(()=>Number(result));
        return arr.map(value => ({ value: isNaN(value) ? NaN : value }));
      }
    });
    return true;
  } catch { return false; }
}

// ─── Formula Dialog ───────────────────────────────────────────────────────────
function FormulaDialog({ onAdd, onClose, isDark }: {
  onAdd: (label:string, formula:string, pane:'main'|'osc') => void;
  onClose: () => void; isDark: boolean;
}) {
  const [label,setLabel]=useState('Custom 1');
  const [formula,setFormula]=useState('ema(close, 9)');
  const [pane,setPane]=useState<'main'|'osc'>('main');
  const bg=isDark?'#1e2533':'#fff'; const border=isDark?'#2a3350':'#e5e7eb'; const txt=isDark?'#9db2c8':'#374151'; const ttl=isDark?'#e2e8f0':'#111827';
  const EXAMPLES=[
    {l:'EMA 9', f:'ema(close, 9)'},
    {l:'SMA 20', f:'sma(close, 20)'},
    {l:'Price-SMA dev', f:'close.map((c,i)=>c-sma(close,20)[i])'},
    {l:'Midpoint', f:'high.map((h,i)=>(h+low[i])/2)'},
    {l:'EMA Cross', f:'ema(close,9).map((v,i)=>v-ema(close,21)[i])'},
    {l:'Momentum', f:'close.map((c,i)=>i<10?NaN:c-close[i-10])'},
    {l:'VWAP approx', f:'(()=>{let tv=0,vol=0;return close.map((c,i)=>{tv+=(high[i]+low[i]+c)/3*volume[i];vol+=volume[i];return vol>0?tv/vol:c;});})()'},
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="rounded-2xl shadow-2xl w-[500px] max-h-[90vh] overflow-y-auto"
        style={{background:bg, border:`1px solid ${border}`}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{borderBottom:`1px solid ${border}`}}>
          <div>
            <div className="font-bold text-sm" style={{color:ttl}}>Custom Indicator Formula</div>
            <div className="text-[11px] mt-0.5" style={{color:txt}}>Write your own indicator using any variable and function</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{color:txt}}><X size={14}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-semibold mb-1.5 block" style={{color:ttl}}>Label</label>
              <input value={label} onChange={e=>setLabel(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg outline-none"
                style={{background:isDark?'#0d1117':'#f8fafc',border:`1px solid ${border}`,color:txt}}/>
            </div>
            <div>
              <label className="text-[11px] font-semibold mb-1.5 block" style={{color:ttl}}>Pane</label>
              <select value={pane} onChange={e=>setPane(e.target.value as 'main'|'osc')}
                className="h-[34px] px-2 text-xs rounded-lg outline-none"
                style={{background:isDark?'#0d1117':'#f8fafc',border:`1px solid ${border}`,color:txt}}>
                <option value="main">Main (price)</option>
                <option value="osc">Oscillator</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold mb-1.5 block" style={{color:ttl}}>Formula</label>
            <div className="text-[10px] mb-1.5 leading-relaxed" style={{color:txt}}>
              Variables: <code className="px-1 rounded" style={{background:isDark?'#0d1117':'#f0f0f0'}}>open, high, low, close, volume</code> (arrays)<br/>
              Functions: <code className="px-1 rounded" style={{background:isDark?'#0d1117':'#f0f0f0'}}>ema(arr,n), sma(arr,n), wma(arr,n), highest(arr,n), lowest(arr,n), stdev(arr,n)</code>
            </div>
            <textarea value={formula} onChange={e=>setFormula(e.target.value)} rows={4}
              className="w-full px-3 py-2 text-xs rounded-lg outline-none font-mono resize-y"
              style={{background:isDark?'#0d1117':'#f8fafc',border:`1px solid ${border}`,color:txt}}/>
          </div>
          <div>
            <div className="text-[10px] font-semibold mb-2" style={{color:txt}}>Quick examples</div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(ex=>(
                <button key={ex.l} onClick={()=>{setLabel(ex.l);setFormula(ex.f);}}
                  className="px-2 py-1 rounded text-[10px] transition-colors"
                  style={{background:'rgba(79,70,229,0.1)',color:'#4f46e5',border:'1px solid rgba(79,70,229,0.25)'}}>
                  {ex.l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-5 py-4" style={{borderTop:`1px solid ${border}`}}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-medium" style={{border:`1px solid ${border}`,color:txt}}>Cancel</button>
          <button onClick={()=>onAdd(label,formula,pane)} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{background:'#4f46e5',color:'#fff'}}>Add Indicator</button>
        </div>
      </div>
    </div>
  );
}

// ─── Indicators Modal ─────────────────────────────────────────────────────────
function IndicatorsModal({ active, onToggle, onCustom, onClose, isDark }: {
  active: Set<string>; onToggle:(n:string,pane:'main'|'osc')=>void;
  onCustom: ()=>void; onClose: ()=>void; isDark: boolean;
}) {
  const [q,setQ]=useState('');
  const bg=isDark?'#1e2533':'#fff'; const border=isDark?'#2a3350':'#e5e7eb'; const txt=isDark?'#9db2c8':'#374151'; const dim=isDark?'#4a5568':'#9ca3af'; const ttl=isDark?'#e2e8f0':'#111827'; const rowAlt=isDark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)';
  const filtered=BUILT_IN_INDICATORS.filter(i=>!q||i.label.toLowerCase().includes(q.toLowerCase())||i.name.toLowerCase().includes(q.toLowerCase()));
  const groups:Record<string,IndDef[]>={};
  filtered.forEach(i=>{groups[i.group]=[...(groups[i.group]??[]),i];});

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 bg-black/30" onClick={onClose}>
      <div className="rounded-2xl shadow-2xl w-[440px] max-h-[82vh] flex flex-col overflow-hidden"
        style={{background:bg, border:`1px solid ${border}`}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{borderBottom:`1px solid ${border}`}}>
          <div>
            <div className="font-bold text-sm" style={{color:ttl}}>Indicators &amp; Studies</div>
            <div className="text-[10px]" style={{color:dim}}>{BUILT_IN_INDICATORS.length} built-in + custom formula</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{color:dim}}><X size={14}/></button>
        </div>
        <div className="px-3 py-2 shrink-0" style={{borderBottom:`1px solid ${border}`}}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{color:dim}}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search indicators…"
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg outline-none"
              style={{background:isDark?'#0d1117':'#f8fafc',border:`1px solid ${border}`,color:txt}}/>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {/* Custom formula */}
          {(!q||'custom formula'.includes(q.toLowerCase()))&&(
            <div>
              <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:dim,background:rowAlt}}>Custom Formula</div>
              <button onClick={onCustom} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs hover:opacity-80"
                style={{color:txt}}>
                <Code2 size={12} style={{color:'#4f46e5'}}/>
                <span>Write custom indicator formula…</span>
                <Plus size={10} className="ml-auto" style={{color:'#4f46e5'}}/>
              </button>
            </div>
          )}
          {Object.entries(groups).map(([grp,items])=>(
            <div key={grp}>
              <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{color:dim,background:rowAlt}}>{grp}</div>
              {items.map(({name,label,pane})=>{
                const on=active.has(name);
                return (
                  <button key={name} onClick={()=>onToggle(name,pane)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs hover:opacity-80 transition-colors"
                    style={{background:on?'rgba(79,70,229,0.07)':'transparent',color:txt}}>
                    <span className="flex-1 text-left">{label}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{background:pane==='main'?'rgba(34,197,94,0.12)':'rgba(239,68,68,0.12)',color:pane==='main'?'#22c55e':'#ef4444'}}>
                      {pane==='main'?'MAIN':'OSC'}
                    </span>
                    {on&&<Check size={11} style={{color:'#4f46e5'}}/>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 shrink-0 text-[10px]" style={{borderTop:`1px solid ${border}`,color:dim}}>
          {active.size} active indicator{active.size!==1?'s':''}
        </div>
      </div>
    </div>
  );
}

// ─── Time frames ──────────────────────────────────────────────────────────────
const TIMEFRAMES = [
  {l:'1m', v:'ONE_MINUTE'    }, {l:'3m',  v:'THREE_MINUTE'   },
  {l:'5m', v:'FIVE_MINUTE'   }, {l:'10m', v:'TEN_MINUTE'     },
  {l:'15m',v:'FIFTEEN_MINUTE'}, {l:'30m', v:'THIRTY_MINUTE'  },
  {l:'1h', v:'ONE_HOUR'      }, {l:'2h',  v:'TWO_HOUR'       },
  {l:'4h', v:'FOUR_HOUR'     }, {l:'1D',  v:'ONE_DAY'        },
  {l:'1W', v:'ONE_WEEK'      }, {l:'1M',  v:'ONE_MONTH'      },
];
const CANDLE_TYPES = [
  {v:CandleType.CandleSolid,     l:'Candles',      icon:'candle'  },
  {v:CandleType.CandleUpStroke,  l:'Hollow Candles',icon:'hollow' },
  {v:CandleType.Ohlc,            l:'OHLC Bars',    icon:'bars'    },
  {v:CandleType.Area,            l:'Area',         icon:'area'    },
];
const RANGES = ['1D','5D','1M','3M','6M','1Y','5Y'];

function getIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + now.getTimezoneOffset()*60_000 + 5.5*3_600_000);
  return ist.toTimeString().slice(0,8);
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { symbol:string; exchange:string; token:string; name?:string; theme?:ChartTheme; onThemeChange?:(t:ChartTheme)=>void }

export function KlineAdvancedChart({ symbol, exchange, token, name, theme='light', onThemeChange }: Props) {
  const chartRef   = useRef<HTMLDivElement>(null);
  const kChart     = useRef<KChart|null>(null);
  const paneIds    = useRef<Map<string,string>>(new Map()); // indicator name → pane id
  const activeInds = useRef<Set<string>>(new Set(['EMA','VOL']));
  const isDark     = theme === 'dark';
  const bg         = isDark ? '#131722' : '#ffffff';
  const tb         = isDark ? '#0d1117' : '#f8fafc';
  const border     = isDark ? '#2a3350' : '#e5e7eb';
  const txt        = isDark ? '#9db2c8' : '#374151';
  const ttl        = isDark ? '#e2e8f0' : '#111827';
  const dim        = isDark ? '#4a5568' : '#9ca3af';

  const rawDataRef    = useRef<KData[]>([]);
  const oldestTsRef   = useRef<number>(0);   // oldest loaded bucket (Unix seconds)
  const hasMoreRef    = useRef<boolean>(true);
  const loadingMoreRef = useRef<boolean>(false);

  const [tf,setTf]             = useState('ONE_DAY');
  const [candleType,setCandleType] = useState<CandleType>(CandleType.CandleSolid);
  const [drawTool,setDrawTool] = useState('cursor');
  const [activeIndsState, setActiveIndsState] = useState<Set<string>>(new Set(['EMA','VOL']));
  const [showIndModal,setShowIndModal]   = useState(false);
  const [showFormula,setShowFormula]     = useState(false);
  const [showTypeMenu,setShowTypeMenu]   = useState(false);
  const [showTfMenu,setShowTfMenu]       = useState(false);
  const [instantOrders,setInstantOrders] = useState(false);
  const [istTime,setIstTime]             = useState(getIST());
  const [loading,setLoading]   = useState(false);
  const [error,setError]       = useState('');
  const [ltp,setLtp]           = useState(0);
  const [chg,setChg]           = useState(0);
  const [chgPct,setChgPct]     = useState(0);
  const [bars,setBars]         = useState(0);
  const [resolvedToken,setResolvedToken]   = useState(token);
  const [resolvedExchange,setResolvedExchange] = useState(exchange);

  // Resolve token if not given
  useEffect(()=>{
    setResolvedToken(token); setResolvedExchange(exchange); setError('');
    if(token) return;
    fetch(`/api/search?q=${encodeURIComponent(symbol)}&limit=1`,{cache:'no-store'})
      .then(r=>r.ok?r.json():null)
      .then((d:{results?:{token:string;exchange:string}[]}|null)=>{
        const f=d?.results?.[0];
        const MOCK=['1','2','3','4','5','6','7','8','9','10','11','12'];
        if(f?.token&&!MOCK.includes(f.token)){setResolvedToken(f.token);setResolvedExchange(f.exchange??exchange);}
      }).catch(()=>{});
  },[symbol,token,exchange]);

  // IST clock
  useEffect(()=>{ const id=setInterval(()=>setIstTime(getIST()),1000); return ()=>clearInterval(id); },[]);

  // Range scroller — scroll chart viewport to show last N days of loaded data
  function applyRange(range: string) {
    const chart = kChart.current; if (!chart || !rawDataRef.current.length) return;
    const d = 86_400_000;
    const map: Record<string,number> = { '1D':d,'5D':5*d,'1M':30*d,'3M':90*d,'6M':180*d,'1Y':365*d,'5Y':5*365*d };
    const ms = map[range]; if (!ms) return;
    const from = Date.now() - ms;
    const idx  = rawDataRef.current.findIndex(c => c.timestamp >= from);
    if (idx >= 0) {
      try { chart.scrollToDataIndex(idx); } catch {/**/}
    } else if (idx < 0 && hasMoreRef.current) {
      // Data not loaded yet — trigger a load for that range
      loadMoreData(tf, symbol, resolvedExchange);
    }
  }

  // Init klinechart
  useEffect(()=>{
    if(!chartRef.current) return;
    const chart = klineInit(chartRef.current, { styles: buildStyles(isDark) as never });
    kChart.current = chart;

    // Default: EMA on main, VOL on new pane
    const mainPaneId = 'candle_pane';
    chart.createIndicator({ name:'EMA', calcParams:[12,26] }, false, { id: mainPaneId });
    const volPaneId = chart.createIndicator({ name:'VOL', calcParams:[5,10] }, false, { height: 80 });
    if (volPaneId) paneIds.current.set('VOL', volPaneId);

    return ()=>{ klineDispose(chartRef.current!); kChart.current=null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Theme change
  useEffect(()=>{
    kChart.current?.setStyles(buildStyles(isDark) as never);
  },[isDark, theme]);

  // Candle type change
  useEffect(()=>{
    kChart.current?.setStyles({ candle: { type: candleType } } as never);
  },[candleType]);

  // Convert candle row → KData (handles Unix-seconds, Unix-ms, or ISO string)
  function toKData([ts,o,h,l,c,v]: [number|string,number,number,number,number,number]): KData {
    let ms: number;
    if (typeof ts === 'number') {
      ms = ts < 1e10 ? ts * 1000 : ts;   // seconds → ms  or already ms
    } else {
      ms = new Date(ts).getTime();        // ISO string
    }
    return { timestamp: ms, open: o, high: h, low: l, close: c, volume: v };
  }

  function updateStats(data: KData[]) {
    if (!data.length) return;
    const last = data[data.length-1];
    const prev = data.length > 1 ? data[data.length-2] : last;
    setLtp(last.close);
    setChg(parseFloat((last.close - prev.close).toFixed(2)));
    setChgPct(parseFloat(((last.close - prev.close) / prev.close * 100).toFixed(2)));
  }

  // Initial fetch — loads the most recent INITIAL_LIMIT candles
  const INITIAL_LIMIT = 500;

  const fetchData = useCallback(async (interval: string, sym: string, exch: string, tkn: string) => {
    setLoading(true); setError('');
    rawDataRef.current    = [];
    oldestTsRef.current   = 0;
    hasMoreRef.current    = true;
    loadingMoreRef.current = false;

    try {
      const url = `/api/mongo-chart?symbol=${encodeURIComponent(sym)}&exchange=${encodeURIComponent(exch)}&interval=${interval}&limit=${INITIAL_LIMIT}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await r.json() as { candles?: any[]; error?: string; oldest?: number; hasMore?: boolean };

      if (!json.error && json.candles && json.candles.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: KData[] = json.candles.map((row: any) => toKData(row));
        rawDataRef.current  = data;
        oldestTsRef.current = json.oldest ?? Math.floor(data[0].timestamp / 1000);
        hasMoreRef.current  = json.hasMore ?? true;
        kChart.current?.applyNewData(data, !hasMoreRef.current);
        setBars(data.length);
        updateStats(data);
        return;
      }

      // Fallback: AngelOne API
      if (!tkn) { setError(`No data for ${sym}. Import historical CSV or upload security master.`); return; }
      const r2 = await fetch(`/api/chart-data?exchange=${exch}&token=${tkn}&interval=${interval}`, { cache: 'no-store' });
      if (!r2.ok) throw new Error(`Data API ${r2.status}`);
      const j2 = await r2.json() as { candles?: [string,number,number,number,number,number][]; error?: string };
      if (j2.error) throw new Error(j2.error);
      const raw = j2.candles ?? [];
      if (!raw.length) { setError('No candle data available.'); return; }
      const data: KData[] = raw.map(row => toKData(row as [string,number,number,number,number,number]));
      rawDataRef.current  = data;
      hasMoreRef.current  = false; // AngelOne doesn't support pagination
      kChart.current?.applyNewData(data, true);
      setBars(data.length);
      updateStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load older data when user scrolls to the start
  const loadMoreData = useCallback(async (interval: string, sym: string, exch: string) => {
    if (loadingMoreRef.current || !hasMoreRef.current || !oldestTsRef.current) return;
    loadingMoreRef.current = true;
    try {
      const url = `/api/mongo-chart?symbol=${encodeURIComponent(sym)}&exchange=${encodeURIComponent(exch)}&interval=${interval}&limit=${INITIAL_LIMIT}&before=${oldestTsRef.current}`;
      const r   = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await r.json() as { candles?: any[]; hasMore?: boolean; oldest?: number };
      if (!json.candles?.length) { hasMoreRef.current = false; kChart.current?.applyMoreData([], true); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: KData[] = json.candles.map((row: any) => toKData(row));
      oldestTsRef.current = json.oldest ?? Math.floor(data[0].timestamp / 1000);
      hasMoreRef.current  = json.hasMore ?? false;
      rawDataRef.current  = [...data, ...rawDataRef.current];
      setBars(rawDataRef.current.length);
      kChart.current?.applyMoreData(data, !hasMoreRef.current);
    } catch { /* silent — don't break UX */ }
    finally { loadingMoreRef.current = false; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(()=>{
    if (kChart.current) fetchData(tf, symbol, resolvedExchange, resolvedToken);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tf, symbol, resolvedExchange, resolvedToken]);

  // Wait for chart to be ready, then do initial fetch + wire load-more
  useEffect(()=>{
    const t = setTimeout(()=>{
      fetchData(tf, symbol, resolvedExchange, resolvedToken);
      // Wire progressive loading callback
      if (kChart.current) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (kChart.current as unknown as { setLoadMoreDataCallback: (cb: (ts: number) => void) => void })
            .setLoadMoreDataCallback((_ts: number) => {
              loadMoreData(tf, symbol, resolvedExchange);
            });
        } catch { /* KlineCharts version may not support this API */ }
      }
    }, 100);
    return ()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Toggle indicator
  function toggleIndicator(name: string, pane: 'main'|'osc') {
    const chart = kChart.current; if(!chart) return;
    const next = new Set(activeIndsState);
    if (next.has(name)) {
      // Remove
      const pid = paneIds.current.get(name);
      if (pid && pid !== 'candle_pane') {
        try { chart.removeIndicator(pid, name); } catch {/**/}
      } else {
        try { chart.removeIndicator('candle_pane', name); } catch {/**/}
      }
      paneIds.current.delete(name);
      next.delete(name);
    } else {
      // Add
      const def = BUILT_IN_INDICATORS.find(i=>i.name===name);
      if (!def) return;
      if (pane === 'main') {
        chart.createIndicator({ name }, false, { id: 'candle_pane' });
      } else {
        const existingVolPid = paneIds.current.get('VOL');
        // Group oscillators in existing osc pane if available
        const pid = chart.createIndicator({ name }, false, { height: 100 });
        if (pid) paneIds.current.set(name, pid);
      }
      next.add(name);
    }
    setActiveIndsState(next);
    activeInds.current = next;
  }

  // Add custom indicator
  function addCustomIndicator(label: string, formula: string, pane: 'main'|'osc') {
    const chart = kChart.current; if(!chart) return;
    customIndCounter++;
    const name = `CUSTOM_${customIndCounter}`;
    registerCustomIndicator(name, label, formula, pane);
    if (pane === 'main') {
      chart.createIndicator({ name }, false, { id: 'candle_pane' });
    } else {
      const pid = chart.createIndicator({ name }, false, { height: 100 });
      if (pid) paneIds.current.set(name, pid);
    }
    const next = new Set(activeIndsState);
    next.add(name);
    setActiveIndsState(next);
    setShowFormula(false);
    setShowIndModal(false);
  }

  // Drawing tool — fixes:
  //  1. Don't wipe completed drawings when switching tools
  //  2. Cancel the in-progress overlay only (KlineCharts removes the "ghost" overlay on next createOverlay call)
  //  3. Group user drawings so clearAllDrawings only removes them
  const DRAWING_GROUP = 'user_drawings';

  function selectDrawTool(toolId: string) {
    const chart = kChart.current; if (!chart) return;
    setDrawTool(toolId);
    if (toolId === 'cursor') {
      // Cancel any in-progress (incomplete) overlay without removing finished ones
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (chart as unknown as any).overrideOverlay?.({ id: '__in_progress__' });
      } catch { /* ignore */ }
      // No removeOverlay — preserves completed drawings
      return;
    }
    try {
      chart.createOverlay({ name: toolId, groupId: DRAWING_GROUP });
    } catch (e) {
      console.warn('[KlineChart] createOverlay failed for', toolId, e);
    }
  }

  function clearAllDrawings() {
    try {
      kChart.current?.removeOverlay({ groupId: DRAWING_GROUP });
    } catch {
      kChart.current?.removeOverlay();
    }
    setDrawTool('cursor');
  }

  // Resize
  useEffect(()=>{
    const ro = new ResizeObserver(()=>kChart.current?.resize());
    if(chartRef.current) ro.observe(chartRef.current);
    return ()=>ro.disconnect();
  },[]);

  const pos = chg >= 0;
  const currentTf = TIMEFRAMES.find(t=>t.v===tf);
  const currentCT = CANDLE_TYPES.find(t=>t.v===candleType);

  const DRAW_ICONS: Record<string,React.ReactNode> = {
    cursor:   <MousePointer2 size={13} strokeWidth={1.8}/>,
    hline:    <Minus size={13} strokeWidth={1.8}/>,
    trend:    <TrendingUp size={13} strokeWidth={1.8}/>,
    ray:      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><line x1="1" y1="12" x2="12" y2="1" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="1" r="1.5" fill="currentColor"/></svg>,
    fib:      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><line x1="1" y1="2" x2="12" y2="2" stroke="currentColor" strokeWidth="1.3"/><line x1="1" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1.3"/><line x1="1" y1="11" x2="12" y2="11" stroke="currentColor" strokeWidth="1.3"/><line x1="1" y1="2" x2="1" y2="11" stroke="currentColor" strokeWidth="1.3"/></svg>,
    channel:  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><line x1="1" y1="3" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4"/><line x1="1" y1="7" x2="12" y2="13" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5"/></svg>,
    text:     <Type size={13} strokeWidth={1.8}/>,
  };

  // Shared style for small toolbar icon buttons
  function tbIco(active=false) {
    return {
      color: active ? '#4f46e5' : (isDark ? '#64748b' : '#64748b'),
      background: active ? 'rgba(79,70,229,0.08)' : 'transparent',
    };
  }

  return (
    <div
      className="flex h-full select-none"
      style={{ fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,sans-serif", background: bg }}
      onClick={()=>{ setShowTfMenu(false); setShowTypeMenu(false); }}
    >

      {/* ── Left drawing toolbar ─────────────────────────── */}
      <div className="flex flex-col items-center py-2 gap-0.5 shrink-0"
        style={{ width:40, background: isDark?'#0d1117':'#fff', borderRight:`1px solid ${border}` }}>

        <button title="Add indicator" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={{color:isDark?'#475569':'#64748b'}}>
          <Plus size={14} strokeWidth={1.8}/>
        </button>
        <div style={{width:24,height:1,background:border,margin:'2px 0'}}/>

        {DRAW_TOOLS.map(({id,label,icon})=>(
          <button key={id} title={label} onClick={e=>{e.stopPropagation();selectDrawTool(id);}}
            className="w-7 h-7 rounded flex items-center justify-center transition-colors"
            style={{
              color:  drawTool===id ? '#4f46e5' : (isDark?'#475569':'#64748b'),
              background: drawTool===id ? 'rgba(79,70,229,0.1)' : 'transparent',
            }}>
            {DRAW_ICONS[icon] ?? <Minus size={13}/>}
          </button>
        ))}

        <div style={{width:24,height:1,background:border,margin:'4px 0'}}/>
        <button title="Lock drawings" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100" style={{color:isDark?'#475569':'#64748b'}}><Lock size={11} strokeWidth={1.8}/></button>
        <button title="Unlock drawings" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100" style={{color:isDark?'#475569':'#64748b'}}><Unlock size={11} strokeWidth={1.8}/></button>
        <button title="Toggle visibility" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100" style={{color:isDark?'#475569':'#64748b'}}><Eye size={11} strokeWidth={1.8}/></button>
        <button title="Clear all drawings" onClick={e=>{e.stopPropagation();clearAllDrawings();}}
          className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100" style={{color:isDark?'#475569':'#64748b'}}><Trash2 size={11} strokeWidth={1.8}/></button>

        <div style={{flex:1}}/>
        <button title="Object tree" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100" style={{color:isDark?'#475569':'#64748b'}}><Layers size={11} strokeWidth={1.8}/></button>
      </div>

      {/* ── Right area ──────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* ── Top toolbar ────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-2 shrink-0"
          style={{ height:44, borderBottom:`1px solid ${border}`, background: isDark?'#0d1117':'#fff' }}
          onClick={e=>e.stopPropagation()}>

          {/* LEFT controls */}
          <div className="flex items-center gap-0.5">

            {/* Theme toggle */}
            {onThemeChange && (
              <button onClick={()=>onThemeChange(isDark?'light':'dark')} title="Toggle theme"
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
                style={{color: isDark?'#f59e0b':'#64748b'}}>
                {isDark ? <Sun size={13} strokeWidth={1.8}/> : <Moon size={13} strokeWidth={1.8}/>}
              </button>
            )}

            {/* Interval dropdown */}
            <div className="relative">
              <button
                onClick={()=>{setShowTfMenu(v=>!v);setShowTypeMenu(false);}}
                className="flex items-center gap-1 px-2 h-7 rounded text-xs font-semibold hover:bg-gray-100 transition-colors"
                style={{color: isDark?'#e2e8f0':'#0f172a', border:`1px solid ${border}`, minWidth:42}}>
                {currentTf?.l??'1D'}<ChevronDown size={10}/>
              </button>
              {showTfMenu&&(
                <div className="absolute top-full left-0 mt-1 rounded-lg shadow-xl z-50 overflow-hidden" style={{background:isDark?'#1e2533':'#fff',border:`1px solid ${border}`,width:110}}>
                  {TIMEFRAMES.map(t=>(
                    <button key={t.v} onClick={()=>{setTf(t.v);setShowTfMenu(false);}}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
                      style={{color:tf===t.v?'#4f46e5':(isDark?'#9db2c8':'#334155'), fontWeight:tf===t.v?600:400}}>
                      {t.l}{tf===t.v&&<Check size={10} style={{color:'#4f46e5'}}/>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chart type */}
            <div className="relative">
              <button
                onClick={()=>{setShowTypeMenu(v=>!v);setShowTfMenu(false);}}
                title="Chart type"
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors"
                style={tbIco()}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="4" width="3" height="6" fill="currentColor" rx="0.5"/>
                  <line x1="2.5" y1="2" x2="2.5" y2="4" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="2.5" y1="10" x2="2.5" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                  <rect x="5.5" y="2" width="3" height="8" fill="currentColor" rx="0.5" opacity="0.7"/>
                  <line x1="7" y1="0.5" x2="7" y2="2" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="7" y1="10" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
              {showTypeMenu&&(
                <div className="absolute top-full left-0 mt-1 rounded-lg shadow-xl z-50 overflow-hidden" style={{background:isDark?'#1e2533':'#fff',border:`1px solid ${border}`,width:148}}>
                  {CANDLE_TYPES.map(ct=>(
                    <button key={ct.v} onClick={()=>{setCandleType(ct.v);setShowTypeMenu(false);}}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
                      style={{color:candleType===ct.v?'#4f46e5':(isDark?'#9db2c8':'#334155'), fontWeight:candleType===ct.v?600:400, background:candleType===ct.v?'rgba(79,70,229,0.06)':'transparent'}}>
                      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                        <rect x="1" y="2" width="3" height="6" fill="currentColor" rx="0.5"/><rect x="6" y="0" width="3" height="10" fill="currentColor" rx="0.5" opacity="0.7"/>
                      </svg>
                      {ct.l}{candleType===ct.v&&<Check size={10} className="ml-auto" style={{color:'#4f46e5'}}/>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* fx Indicators */}
            <button onClick={e=>{e.stopPropagation();setShowIndModal(true);}}
              className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium hover:bg-gray-100 transition-colors"
              style={{color: isDark?'#9db2c8':'#334155'}}>
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <polyline points="1,9 3.5,5 6,7 8.5,2 11,4" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
              <span style={{fontStyle:'italic',fontFamily:'Georgia,serif',marginRight:-1}}>f</span>
              <span>x</span>
              <span className="ml-0.5">Indicators</span>
              {activeIndsState.size>0&&(
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold ml-0.5" style={{background:'#4f46e5',color:'#fff'}}>
                  {activeIndsState.size}
                </span>
              )}
            </button>

            {/* Layout */}
            <button title="Chart layout" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </button>

            <div style={{width:1,height:20,background:border,margin:'0 2px'}}/>

            {/* Instant Orders toggle */}
            <div className="flex items-center gap-1.5 px-1.5">
              <span className="text-xs whitespace-nowrap" style={{color: isDark?'#9db2c8':'#334155'}}>Instant Orders</span>
              <button onClick={()=>setInstantOrders(v=>!v)}
                className="relative inline-flex rounded-full transition-colors shrink-0"
                style={{width:32,height:18,background:instantOrders?'#4f46e5':'#d1d5db'}}>
                <span className="absolute rounded-full bg-white shadow-sm transition-transform"
                  style={{top:2,width:14,height:14,transform:instantOrders?'translateX(16px)':'translateX(2px)'}}/>
              </button>
            </div>

            {/* AI sparkle */}
            <button title="AI Analysis" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1L8 5.2L12 7L8 8.8L7 13L6 8.8L2 7L6 5.2Z" stroke="#7c3aed" strokeWidth="1.2" fill="rgba(124,58,237,0.12)" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* RIGHT controls */}
          <div className="flex items-center gap-0.5">
            <button title="Undo" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><RotateCcw size={13} strokeWidth={1.8}/></button>
            <button title="Redo" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><RotateCw  size={13} strokeWidth={1.8}/></button>
            <button title="Help" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><HelpCircle size={13} strokeWidth={1.8}/></button>
            <button title="Alert" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><Bell size={13} strokeWidth={1.8}/></button>

            <div style={{width:1,height:20,background:border,margin:'0 2px'}}/>

            <button title="Zoom in" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><ZoomIn size={13} strokeWidth={1.8}/></button>
            <button title="Refresh" onClick={e=>{e.stopPropagation();fetchData(tf,symbol,resolvedExchange,resolvedToken);}} disabled={loading}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}>
              <RefreshCw size={13} strokeWidth={1.8} className={loading?'animate-spin':''}/>
            </button>

            <div style={{width:1,height:20,background:border,margin:'0 2px'}}/>

            <button title="Fullscreen" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><Maximize2 size={13} strokeWidth={1.8}/></button>

            {/* Save button */}
            <div className="flex rounded overflow-hidden" style={{border:`1px solid ${border}`}}>
              <button className="px-2.5 h-7 text-xs font-semibold hover:bg-gray-50 transition-colors" style={{color: isDark?'#e2e8f0':'#0f172a'}}>Save</button>
              <div style={{width:1,background:border}}/>
              <button className="px-1.5 h-7 hover:bg-gray-50 transition-colors" style={{color:'#94a3b8',fontSize:9}}>▾</button>
            </div>

            <button title="Settings" className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}><Settings size={13} strokeWidth={1.8}/></button>
            <button title="Screenshot"
              onClick={e=>{e.stopPropagation();const chart=kChart.current;if(chart){try{const c=(chart as unknown as {takeScreenshot:()=>HTMLCanvasElement}).takeScreenshot();const a=document.createElement('a');a.href=c.toDataURL();a.download=`${symbol}_chart.png`;a.click();}catch{/**/}}}}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-gray-100 transition-colors" style={tbIco()}>
              <Camera size={13} strokeWidth={1.8}/>
            </button>
          </div>
        </div>

        {/* ── Chart canvas ───────────────────────────────── */}
        <div className="flex-1 min-h-0 relative" style={{background:bg}}>
          {loading&&(
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2"
              style={{background:isDark?'rgba(13,17,23,0.75)':'rgba(255,255,255,0.82)'}}>
              <Loader2 size={28} className="animate-spin" style={{color:'#4f46e5'}}/>
              <span className="text-xs" style={{color:dim}}>Loading {symbol}…</span>
            </div>
          )}
          {error&&!loading&&(
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6">
              <div className="text-sm font-semibold" style={{color:'#ef4444'}}>Chart unavailable</div>
              <div className="text-xs text-center max-w-xs leading-relaxed" style={{color:dim}}>{error}</div>
              <button onClick={()=>fetchData(tf,symbol,resolvedExchange,resolvedToken)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                style={{background:'rgba(79,70,229,0.12)',color:'#4f46e5',border:'1px solid rgba(79,70,229,0.3)'}}>
                Retry
              </button>
            </div>
          )}
          <div ref={chartRef} style={{width:'100%',height:'100%'}}/>
        </div>

        {/* ── Bottom Range & Time bar ─────────────────────── */}
        <div className="flex items-center justify-between px-3 shrink-0"
          style={{height:36,borderTop:`1px solid ${border}`,background:isDark?'#0d1117':'#fff'}}>
          <div className="flex items-center gap-0.5">
            {RANGES.map(r=>(
              <button key={r} onClick={()=>applyRange(r)}
                className="px-2 h-6 rounded text-xs font-medium hover:bg-blue-50 hover:text-indigo-600 transition-colors"
                style={{color: isDark?'#9db2c8':'#334155'}}>
                {r}
              </button>
            ))}
            <button title="Custom date range" className="ml-1 w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100" style={{color: isDark?'#475569':'#64748b'}}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{color: isDark?'#475569':'#64748b'}}>
            {bars>0&&<><span className="font-medium" style={{color:isDark?'#22c55e':'#16a34a'}}>{bars.toLocaleString()} bars</span><span>·</span></>}
            <span className="font-mono tabular-nums">{istTime} (UTC+5:30)</span>
            <button className="px-1.5 py-0.5 rounded hover:bg-gray-100 font-medium" style={{color:isDark?'#9db2c8':'#334155'}}>%</button>
            <button className="px-1.5 py-0.5 rounded hover:bg-gray-100" style={{color:isDark?'#9db2c8':'#334155'}}>log</button>
            <button className="px-1.5 py-0.5 rounded hover:bg-gray-100" style={{color:isDark?'#9db2c8':'#334155'}}>auto</button>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showIndModal&&(
        <IndicatorsModal
          active={activeIndsState}
          onToggle={toggleIndicator}
          onCustom={()=>{setShowIndModal(false);setShowFormula(true);}}
          onClose={()=>setShowIndModal(false)}
          isDark={isDark}
        />
      )}
      {showFormula&&(
        <FormulaDialog
          onAdd={addCustomIndicator}
          onClose={()=>setShowFormula(false)}
          isDark={isDark}
        />
      )}
    </div>
  );
}
