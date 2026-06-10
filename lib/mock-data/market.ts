import { MarketIndex, WatchlistItem, OptionContract } from '@/types';

// Real instrument tokens from NSE/BSE security master (loaded from Redis)
// Prices are simulated — real scrip metadata (token, ISIN, name) from Redis
export const marketIndices: MarketIndex[] = [
  { symbol: 'NIFTY 50',   name: 'NIFTY 50',          ltp: 24850.65, change: 123.45,  changePercent:  0.50, open: 24750.20, high: 24910.30, low: 24720.15, prevClose: 24727.20 },
  { symbol: 'SENSEX',     name: 'BSE SENSEX',         ltp: 81432.10, change: 412.80,  changePercent:  0.51, open: 81100.50, high: 81520.60, low: 81050.30, prevClose: 81019.30 },
  { symbol: 'BANKNIFTY',  name: 'BANK NIFTY',         ltp: 52340.75, change: -145.20, changePercent: -0.28, open: 52500.30, high: 52680.90, low: 52280.40, prevClose: 52485.95 },
  { symbol: 'BANKEX',     name: 'BSE BANKEX',         ltp: 61820.40, change: 380.60,  changePercent:  0.62, open: 61560.00, high: 61950.20, low: 61480.10, prevClose: 61439.80 },
  { symbol: 'MIDCPNIFTY', name: 'NIFTY MIDCAP SELECT',ltp: 12340.80, change: 68.30,   changePercent:  0.56, open: 12290.00, high: 12380.00, low: 12270.00, prevClose: 12272.50 },
  { symbol: 'FINNIFTY',   name: 'NIFTY FIN SERVICE',  ltp: 23840.55, change: 184.30,  changePercent:  0.78, open: 23700.00, high: 23900.50, low: 23680.20, prevClose: 23656.25 },
  { symbol: 'NIFTYNXT50', name: 'NIFTY NEXT 50',      ltp: 67520.30, change: 420.10,  changePercent:  0.63, open: 67200.00, high: 67640.00, low: 67100.00, prevClose: 67100.20 },
  { symbol: 'INDIA VIX',  name: 'INDIA VIX',          ltp: 13.82,    change: -0.48,   changePercent: -3.35, open: 14.10,    high: 14.25,    low: 13.75,    prevClose: 14.30 },
  { symbol: 'NIFTY IT',   name: 'NIFTY IT',           ltp: 38920.40, change: 280.60,  changePercent:  0.73, open: 38750.00, high: 38980.20, low: 38700.10, prevClose: 38639.80 },
];

// Real scrip tokens from Redis (tk:instr:NSE:{token})
// symbol/name/token/isin are real; prices are mock (no live feed)
export const watchlistItems: WatchlistItem[] = [
  { id: '16328',  symbol: 'RELIANCE',  name: 'RELIANCE INDUSTRIES LTD',  exchange: 'NSE', instrumentType: 'EQ', ltp: 2945.60, change: 32.40,   changePercent:  1.11, bid: 2945.55, ask: 2945.65, volume: 8423156,  high: 2962.00, low: 2918.30, open: 2920.50, prevClose: 2913.20 },
  { id: '11131',  symbol: 'TCS',       name: 'TATA CONSULTANCY SERV LT',  exchange: 'NSE', instrumentType: 'EQ', ltp: 4156.80, change: -28.50,  changePercent: -0.68, bid: 4156.75, ask: 4156.85, volume: 1234567,  high: 4200.00, low: 4140.20, open: 4185.00, prevClose: 4185.30 },
  { id: '1594',   symbol: 'INFY',      name: 'INFOSYS LIMITED',           exchange: 'NSE', instrumentType: 'EQ', ltp: 1842.35, change: 15.70,   changePercent:  0.86, bid: 1842.30, ask: 1842.40, volume: 3456789,  high: 1856.00, low: 1830.50, open: 1835.00, prevClose: 1826.65 },
  { id: '15854',  symbol: 'HDFCBANK',  name: 'HDFC BANK LTD',            exchange: 'NSE', instrumentType: 'EQ', ltp: 1678.90, change: -12.30,  changePercent: -0.73, bid: 1678.85, ask: 1678.95, volume: 6789012,  high: 1695.00, low: 1672.00, open: 1690.00, prevClose: 1691.20 },
  { id: '4963',   symbol: 'ICICIBANK', name: 'ICICI BANK LTD.',           exchange: 'NSE', instrumentType: 'EQ', ltp: 1234.50, change: 18.90,   changePercent:  1.55, bid: 1234.45, ask: 1234.55, volume: 9012345,  high: 1245.00, low: 1220.30, open: 1225.00, prevClose: 1215.60 },
  { id: '11136',  symbol: 'WIPRO',     name: 'WIPRO LTD',                 exchange: 'NSE', instrumentType: 'EQ', ltp: 567.80,  change: 4.30,    changePercent:  0.76, bid: 567.75,  ask: 567.85,  volume: 2345678,  high: 572.00,  low: 563.00,  open: 565.00,  prevClose: 563.50 },
  { id: '3045',   symbol: 'SBIN',      name: 'STATE BANK OF INDIA',       exchange: 'NSE', instrumentType: 'EQ', ltp: 823.45,  change: -6.70,   changePercent: -0.81, bid: 823.40,  ask: 823.50,  volume: 12345678, high: 832.00,  low: 820.00,  open: 828.00,  prevClose: 830.15 },
  { id: '15852',  symbol: 'HCLTECH',   name: 'HCL TECHNOLOGIES LTD',      exchange: 'NSE', instrumentType: 'EQ', ltp: 1342.60, change: 12.80,   changePercent:  0.96, bid: 1342.55, ask: 1342.65, volume: 1876543,  high: 1358.00, low: 1330.00, open: 1335.00, prevClose: 1329.80 },
  { id: '757077', symbol: 'AXISBANK',  name: 'AXIS BANK LIMITED',         exchange: 'NSE', instrumentType: 'EQ', ltp: 1072.40, change: 8.30,    changePercent:  0.78, bid: 1072.35, ask: 1072.45, volume: 5432198,  high: 1085.00, low: 1065.00, open: 1068.00, prevClose: 1064.10 },
  { id: '5669',   symbol: 'KOTAKBANK', name: 'KOTAK MAHINDRA BANK LTD',   exchange: 'NSE', instrumentType: 'EQ', ltp: 1854.20, change: -17.10,  changePercent: -0.91, bid: 1854.15, ask: 1854.25, volume: 3214567,  high: 1880.00, low: 1848.00, open: 1875.00, prevClose: 1871.30 },
  { id: '11093',  symbol: 'BHARTIARTL',name: 'BHARTI AIRTEL LIMITED',      exchange: 'NSE', instrumentType: 'EQ', ltp: 1680.75, change: 22.45,   changePercent:  1.35, bid: 1680.70, ask: 1680.80, volume: 4523678,  high: 1695.00, low: 1665.00, open: 1668.00, prevClose: 1658.30 },
  { id: '11130',  symbol: 'SUNPHARMA', name: 'SUN PHARMACEUTICAL IND L',  exchange: 'NSE', instrumentType: 'EQ', ltp: 1620.30, change: -30.20,  changePercent: -1.83, bid: 1620.25, ask: 1620.35, volume: 2134567,  high: 1658.00, low: 1615.00, open: 1655.00, prevClose: 1650.50 },
  { id: '757188', symbol: 'DRREDDY',   name: 'DR. REDDY S LABORATORIES',  exchange: 'NSE', instrumentType: 'EQ', ltp: 6122.50, change: 40.30,   changePercent:  0.66, bid: 6122.45, ask: 6122.55, volume: 567890,   high: 6145.00, low: 6080.00, open: 6085.00, prevClose: 6082.20 },
  { id: '16107',  symbol: 'MARUTI',    name: 'MARUTI SUZUKI INDIA LTD.',   exchange: 'NSE', instrumentType: 'EQ', ltp: 12450.80,change: 145.60,  changePercent:  1.18, bid: 12450.75,ask: 12450.85,volume: 456789,   high: 12530.00,low: 12310.00,open: 12330.00,prevClose: 12305.20 },
  { id: '15531',  symbol: 'BAJFINANCE',name: 'BAJAJ FINANCE LIMITED',      exchange: 'NSE', instrumentType: 'EQ', ltp: 7340.60, change: -52.30,  changePercent: -0.71, bid: 7340.55, ask: 7340.65, volume: 1234890,  high: 7410.00, low: 7290.00, open: 7395.00, prevClose: 7392.90 },
  // Real NIFTY options (trading symbols from Redis)
  { id: 'NIFTY26JUN25000CE', symbol: 'NIFTY26JUN25000CE', name: 'NIFTY Jun 25000 CE', exchange: 'NSE', instrumentType: 'CE', ltp: 185.40, change: 22.60, changePercent: 13.89, bid: 185.30, ask: 185.50, volume: 234567, high: 195.00, low: 162.00, open: 165.00, prevClose: 162.80, oi: 3456789, iv: 14.23, pinned: true },
  { id: 'NIFTY26JUN24000PE', symbol: 'NIFTY26JUN24000PE', name: 'NIFTY Jun 24000 PE', exchange: 'NSE', instrumentType: 'PE', ltp: 95.60,  change: -18.40, changePercent: -16.14, bid: 95.50, ask: 95.70, volume: 189234, high: 115.00, low: 92.00, open: 114.00, prevClose: 114.00, oi: 2345678, iv: 12.56 },
  // Additional Nifty50 stocks
  { id: '28642',  symbol: 'TITAN',     name: 'TITAN COMPANY LIMITED',      exchange: 'NSE', instrumentType: 'EQ', ltp: 3356.40, change: 28.90,   changePercent:  0.87, bid: 3356.35, ask: 3356.45, volume: 789012,   high: 3380.00, low: 3325.00, open: 3330.00, prevClose: 3327.50 },
  { id: '11088',  symbol: 'ASIANPAINT',name: 'ASIAN PAINTS LIMITED',       exchange: 'NSE', instrumentType: 'EQ', ltp: 2456.80, change: -32.10,  changePercent: -1.29, bid: 2456.75, ask: 2456.85, volume: 678901,   high: 2498.00, low: 2445.00, open: 2490.00, prevClose: 2488.90 },
  { id: '11117',  symbol: 'LT',        name: 'LARSEN & TOUBRO LTD.',        exchange: 'NSE', instrumentType: 'EQ', ltp: 3645.20, change: 41.80,   changePercent:  1.16, bid: 3645.15, ask: 3645.25, volume: 1234567,  high: 3670.00, low: 3610.00, open: 3615.00, prevClose: 3603.40 },
];

// Real BANKNIFTY option contracts (strikes based on current BANKNIFTY ~52340)
export const optionChainData: OptionContract[] = [
  { symbol: 'NIFTY26JUN25200CE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 25200, optionType: 'CE', ltp: 42.50,  bid: 42.40,  ask: 42.60,  iv: 11.23, oi: 1234567, changeOi: 45678,  volume: 89012,  delta: 0.18, gamma: 0.002, theta: -8.5,  vega: 12.3 },
  { symbol: 'NIFTY26JUN25100CE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 25100, optionType: 'CE', ltp: 78.30,  bid: 78.20,  ask: 78.40,  iv: 12.45, oi: 2345678, changeOi: 67890,  volume: 123456, delta: 0.28, gamma: 0.003, theta: -10.2, vega: 15.6 },
  { symbol: 'NIFTY26JUN25000CE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 25000, optionType: 'CE', ltp: 132.80, bid: 132.70, ask: 132.90, iv: 13.56, oi: 3456789, changeOi: 89012,  volume: 234567, delta: 0.40, gamma: 0.004, theta: -12.8, vega: 18.9 },
  { symbol: 'NIFTY26JUN24900CE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 24900, optionType: 'CE', ltp: 201.50, bid: 201.40, ask: 201.60, iv: 14.23, oi: 4567890, changeOi: 112233, volume: 345678, delta: 0.52, gamma: 0.004, theta: -14.5, vega: 20.1, isAtm: true },
  { symbol: 'NIFTY26JUN24800CE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 24800, optionType: 'CE', ltp: 285.60, bid: 285.50, ask: 285.70, iv: 15.12, oi: 3234567, changeOi: 78901,  volume: 234567, delta: 0.64, gamma: 0.003, theta: -13.2, vega: 18.4, isItm: true },
  { symbol: 'NIFTY26JUN24700CE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 24700, optionType: 'CE', ltp: 380.40, bid: 380.30, ask: 380.50, iv: 16.34, oi: 2123456, changeOi: 45678,  volume: 167890, delta: 0.75, gamma: 0.002, theta: -11.8, vega: 16.2, isItm: true },
  { symbol: 'NIFTY26JUN24700PE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 24700, optionType: 'PE', ltp: 42.80,  bid: 42.70,  ask: 42.90,  iv: 10.56, oi: 1876543, changeOi: 23456,  volume: 89012,  delta: -0.18, gamma: 0.002, theta: -7.8,  vega: 11.2 },
  { symbol: 'NIFTY26JUN24800PE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 24800, optionType: 'PE', ltp: 78.90,  bid: 78.80,  ask: 79.00,  iv: 11.89, oi: 2987654, changeOi: 56789,  volume: 145678, delta: -0.29, gamma: 0.003, theta: -9.4,  vega: 14.5 },
  { symbol: 'NIFTY26JUN24900PE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 24900, optionType: 'PE', ltp: 135.60, bid: 135.50, ask: 135.70, iv: 13.12, oi: 3876543, changeOi: 89012,  volume: 212345, delta: -0.41, gamma: 0.004, theta: -11.6, vega: 17.8, isAtm: true },
  { symbol: 'NIFTY26JUN25000PE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 25000, optionType: 'PE', ltp: 210.40, bid: 210.30, ask: 210.50, iv: 14.45, oi: 4123456, changeOi: 102345, volume: 289012, delta: -0.53, gamma: 0.004, theta: -13.2, vega: 19.6, isItm: true },
  { symbol: 'NIFTY26JUN25100PE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 25100, optionType: 'PE', ltp: 298.70, bid: 298.60, ask: 298.80, iv: 15.78, oi: 2987654, changeOi: 67890,  volume: 198765, delta: -0.65, gamma: 0.003, theta: -12.1, vega: 17.4, isItm: true },
  { symbol: 'NIFTY26JUN25200PE', underlying: 'NIFTY', expiry: '2026-06-25', strike: 25200, optionType: 'PE', ltp: 398.90, bid: 398.80, ask: 399.00, iv: 17.23, oi: 1876543, changeOi: 34567,  volume: 134567, delta: -0.76, gamma: 0.002, theta: -10.5, vega: 15.1, isItm: true },
];
