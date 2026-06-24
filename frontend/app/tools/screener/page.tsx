'use client';
import { useState, useMemo, useEffect } from 'react';
import { Filter, Download, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

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

interface Stock {
  symbol: string;
  company: string;
  sector: string;
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: string;
  capCategory: 'Large' | 'Mid' | 'Small';
  pe: number;
  rsi: number;
}

// Base data — real names from Redis will overlay company field on mount
const MOCK_STOCKS: Stock[] = [
  { symbol: 'RELIANCE',    company: 'RELIANCE INDUSTRIES LTD',   sector: 'Energy',    ltp: 2945.30,  change: 42.10,  changePct: 1.45,  volume: 8240000,  marketCap: '19.8L Cr', capCategory: 'Large', pe: 28.4, rsi: 61.2 },
  { symbol: 'TCS',         company: 'TATA CONSULTANCY SERV LT',  sector: 'IT',        ltp: 3820.55,  change: -28.45, changePct: -0.74, volume: 3120000,  marketCap: '13.9L Cr', capCategory: 'Large', pe: 31.2, rsi: 48.7 },
  { symbol: 'INFY',        company: 'INFOSYS LIMITED',            sector: 'IT',        ltp: 1850.20,  change: 22.30,  changePct: 1.22,  volume: 5680000,  marketCap: '7.7L Cr',  capCategory: 'Large', pe: 27.8, rsi: 55.4 },
  { symbol: 'HDFCBANK',    company: 'HDFC BANK LTD',             sector: 'Banking',   ltp: 1680.75,  change: -12.50, changePct: -0.74, volume: 9450000,  marketCap: '12.8L Cr', capCategory: 'Large', pe: 22.1, rsi: 43.1 },
  { symbol: 'ICICIBANK',   company: 'ICICI BANK LTD.',            sector: 'Banking',   ltp: 1245.80,  change: 18.90,  changePct: 1.54,  volume: 7830000,  marketCap: '8.8L Cr',  capCategory: 'Large', pe: 19.8, rsi: 58.9 },
  { symbol: 'WIPRO',       company: 'WIPRO LTD',                  sector: 'IT',        ltp: 490.35,   change: -5.60,  changePct: -1.13, volume: 4210000,  marketCap: '2.7L Cr',  capCategory: 'Large', pe: 23.4, rsi: 41.8 },
  { symbol: 'SBIN',        company: 'STATE BANK OF INDIA',        sector: 'Banking',   ltp: 845.60,   change: 9.40,   changePct: 1.12,  volume: 11200000, marketCap: '7.5L Cr',  capCategory: 'Large', pe: 14.2, rsi: 52.3 },
  { symbol: 'AXISBANK',    company: 'AXIS BANK LIMITED',          sector: 'Banking',   ltp: 1145.25,  change: 14.75,  changePct: 1.30,  volume: 5920000,  marketCap: '3.5L Cr',  capCategory: 'Large', pe: 17.3, rsi: 57.6 },
  { symbol: 'KOTAKBANK',   company: 'KOTAK MAHINDRA BANK LTD',   sector: 'Banking',   ltp: 1840.90,  change: -8.30,  changePct: -0.45, volume: 2840000,  marketCap: '3.7L Cr',  capCategory: 'Large', pe: 25.1, rsi: 46.2 },
  { symbol: 'BAJFINANCE',  company: 'BAJAJ FINANCE LIMITED',      sector: 'Finance',   ltp: 7245.60,  change: 112.40, changePct: 1.58,  volume: 1240000,  marketCap: '4.4L Cr',  capCategory: 'Large', pe: 34.8, rsi: 64.7 },
  { symbol: 'HINDUNILVR',  company: 'HINDUSTAN UNILEVER LTD.',    sector: 'FMCG',      ltp: 2420.30,  change: 15.80,  changePct: 0.66,  volume: 1890000,  marketCap: '5.7L Cr',  capCategory: 'Large', pe: 58.2, rsi: 50.1 },
  { symbol: 'ITC',         company: 'ITC LTD',                    sector: 'FMCG',      ltp: 482.55,   change: 3.25,   changePct: 0.68,  volume: 12400000, marketCap: '6.0L Cr',  capCategory: 'Large', pe: 28.9, rsi: 53.8 },
  { symbol: 'MARUTI',      company: 'MARUTI SUZUKI INDIA LTD.',   sector: 'Auto',      ltp: 11240.70, change: -85.40, changePct: -0.75, volume: 890000,   marketCap: '3.4L Cr',  capCategory: 'Large', pe: 26.7, rsi: 44.9 },
  { symbol: 'TITAN',       company: 'TITAN COMPANY LIMITED',      sector: 'Consumer',  ltp: 3480.25,  change: 52.10,  changePct: 1.52,  volume: 1580000,  marketCap: '3.1L Cr',  capCategory: 'Large', pe: 88.4, rsi: 68.3 },
  { symbol: 'SUNPHARMA',   company: 'SUN PHARMACEUTICAL IND L',   sector: 'Pharma',    ltp: 1620.30,  change: -30.20, changePct: -1.83, volume: 2134567,  marketCap: '3.9L Cr',  capCategory: 'Large', pe: 34.2, rsi: 38.7 },
  { symbol: 'DRREDDY',     company: 'DR. REDDY S LABORATORIES',   sector: 'Pharma',    ltp: 6122.50,  change: 40.30,  changePct: 0.66,  volume: 567890,   marketCap: '1.0L Cr',  capCategory: 'Large', pe: 22.8, rsi: 52.4 },
  { symbol: 'HCLTECH',     company: 'HCL TECHNOLOGIES LTD',       sector: 'IT',        ltp: 1342.60,  change: 12.80,  changePct: 0.96,  volume: 1876543,  marketCap: '3.6L Cr',  capCategory: 'Large', pe: 25.6, rsi: 54.8 },
  { symbol: 'BHARTIARTL',  company: 'BHARTI AIRTEL LIMITED',       sector: 'Telecom',   ltp: 1680.75,  change: 22.45,  changePct: 1.35,  volume: 4523678,  marketCap: '10.1L Cr', capCategory: 'Large', pe: 38.4, rsi: 62.1 },
  { symbol: 'LT',          company: 'LARSEN & TOUBRO LTD.',        sector: 'Capital',   ltp: 3645.20,  change: 41.80,  changePct: 1.16,  volume: 1234567,  marketCap: '5.0L Cr',  capCategory: 'Large', pe: 30.2, rsi: 57.3 },
  { symbol: 'ASIANPAINT',  company: 'ASIAN PAINTS LIMITED',        sector: 'Consumer',  ltp: 2456.80,  change: -32.10, changePct: -1.29, volume: 678901,   marketCap: '2.4L Cr',  capCategory: 'Large', pe: 64.8, rsi: 41.2 },
];

const SECTORS = ['All', 'IT', 'Banking', 'Energy', 'FMCG', 'Auto', 'Finance', 'Consumer', 'Pharma', 'Telecom', 'Capital'];

export default function ScreenerPage() {
  const [stocks, setStocks] = useState<Stock[]>(MOCK_STOCKS);
  const [redisLoaded, setRedisLoaded] = useState(false);
  const [sector, setSector] = useState('All');
  const [capFilter, setCapFilter] = useState('All');
  const [minChange, setMinChange] = useState('');
  const [maxChange, setMaxChange] = useState('');
  const [minVolume, setMinVolume] = useState('');
  const [maxPE, setMaxPE] = useState('');
  const [sortCol, setSortCol] = useState<keyof Stock>('changePct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Fetch real names from Redis on mount
  useEffect(() => {
    const syms = MOCK_STOCKS.map(s => s.symbol).join(',');
    fetch(`/api/scrips?symbols=${syms}&exchange=NSE`)
      .then(r => r.json())
      .then((d: { results: { symbol: string; name: string }[] }) => {
        if (!d.results?.length) return;
        const nameMap = new Map(d.results.map(r => [r.symbol, r.name]));
        setStocks(MOCK_STOCKS.map(s => ({ ...s, company: nameMap.get(s.symbol) ?? s.company })));
        setRedisLoaded(true);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let data = [...stocks];
    if (sector !== 'All') data = data.filter(s => s.sector === sector);
    if (capFilter !== 'All') data = data.filter(s => s.capCategory === capFilter);
    if (minChange !== '') data = data.filter(s => s.changePct >= parseFloat(minChange));
    if (maxChange !== '') data = data.filter(s => s.changePct <= parseFloat(maxChange));
    if (minVolume !== '') data = data.filter(s => s.volume >= parseFloat(minVolume) * 1000);
    if (maxPE !== '') data = data.filter(s => s.pe <= parseFloat(maxPE));
    data.sort((a, b) => {
      const av = a[sortCol] as number, bv = b[sortCol] as number;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
    return data;
  }, [stocks, sector, capFilter, minChange, maxChange, minVolume, maxPE, sortCol, sortDir]);

  const handleSort = (col: keyof Stock) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const thStyle: React.CSSProperties = { color: 'var(--text-accent)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '8px 10px', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', fontSize: '12px', borderBottom: '1px solid var(--row-border)', whiteSpace: 'nowrap' };

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Stock Screener</h1>
          <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-label)' }}>
            Filter and discover stocks by fundamentals and technicals
            {redisLoaded && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: 'rgba(var(--gain-rgb),0.12)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }}>
                ✓ Real scrip names from Redis
              </span>
            )}
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: 'rgb(0,212,255)' }}>
          <Download size={13} /> Export
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Filter Panel */}
        <div className="glass rounded-xl p-4 space-y-4 h-fit">
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: 'rgb(41,121,255)' }} />
            <span className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Filters</span>
          </div>
          <div>
            <label style={labelStyle}>Market Cap</label>
            <div className="flex flex-col gap-1">
              {['All', 'Large', 'Mid', 'Small'].map(c => (
                <button key={c} onClick={() => setCapFilter(c)}
                  className="text-left px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: capFilter === c ? 'rgba(41,121,255,0.2)' : 'transparent',
                    color: capFilter === c ? 'rgb(41,121,255)' : 'var(--text-accent)',
                    border: capFilter === c ? '1px solid rgba(41,121,255,0.3)' : '1px solid transparent',
                  }}>{c} Cap</button>
              ))}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Sector</label>
            <select style={inputStyle} value={sector} onChange={e => setSector(e.target.value)}>
              {SECTORS.map(s => <option key={s} style={{ background: '#081020' }}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label style={labelStyle}>Change% Min</label>
              <input type="number" placeholder="-5" style={inputStyle} value={minChange} onChange={e => setMinChange(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Change% Max</label>
              <input type="number" placeholder="5" style={inputStyle} value={maxChange} onChange={e => setMaxChange(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Volume {">"} (K)</label>
            <input type="number" placeholder="1000" style={inputStyle} value={minVolume} onChange={e => setMinVolume(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>PE Ratio {"<"}</label>
            <input type="number" placeholder="50" style={inputStyle} value={maxPE} onChange={e => setMaxPE(e.target.value)} />
          </div>
          <button onClick={() => { setSector('All'); setCapFilter('All'); setMinChange(''); setMaxChange(''); setMinVolume(''); setMaxPE(''); }}
            className="w-full py-1.5 rounded-lg text-xs"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)', color: 'var(--text-accent)' }}>
            Reset Filters
          </button>
        </div>

        {/* Results Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>Results</span>
            <span className="text-xs" style={{ color: 'var(--text-label)' }}>{filtered.length} stocks found</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  {[
                    { label: 'Symbol', col: 'symbol' },
                    { label: 'Company', col: 'company' },
                    { label: 'Sector', col: 'sector' },
                    { label: 'LTP', col: 'ltp' },
                    { label: 'Change%', col: 'changePct' },
                    { label: 'Volume', col: 'volume' },
                    { label: 'Mkt Cap', col: 'marketCap' },
                    { label: 'PE', col: 'pe' },
                    { label: 'RSI', col: 'rsi' },
                  ].map(h => (
                    <th key={h.label} style={thStyle} onClick={() => handleSort(h.col as keyof Stock)}>
                      {h.label} {sortCol === h.col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.symbol}
                    className="transition-colors"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(41,121,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={tdStyle}>
                      <span className="font-bold text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(41,121,255,0.12)', color: 'rgb(41,121,255)' }}>{s.symbol}</span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.company}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-accent)' }}>{s.sector}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-bright)', fontWeight: 700 }}>₹{s.ltp.toLocaleString('en-IN')}</td>
                    <td style={tdStyle}>
                      <span className="flex items-center gap-0.5" style={{ color: s.changePct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
                        {s.changePct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-accent)' }}>{(s.volume / 1000).toFixed(0)}K</td>
                    <td style={{ ...tdStyle, color: 'var(--text-accent)' }}>{s.marketCap}</td>
                    <td style={{ ...tdStyle, color: s.pe > 40 ? 'rgb(255,214,0)' : 'var(--text-secondary)' }}>{s.pe.toFixed(1)}</td>
                    <td style={tdStyle}>
                      <span style={{
                        color: s.rsi > 70 ? 'var(--accent-red)' : s.rsi < 30 ? 'var(--accent-green)' : 'var(--text-secondary)',
                        fontWeight: s.rsi > 70 || s.rsi < 30 ? 700 : 400,
                      }}>{s.rsi.toFixed(1)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-10 text-xs" style={{ color: 'var(--text-label)' }}>No stocks match the current filters.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
