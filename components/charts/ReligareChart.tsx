'use client';

interface Props {
  token:        string;
  mktsegid?:    number;  // 1=NSE CM, 2=NSE FO, 3=BSE CM, 4=BSE FO
  theme?:       'light' | 'dark';
  interval?:    string;  // MIN 3MIN 5MIN 15MIN 30MIN 60MIN DAY WEEK MONTH
  chartStyle?:  'line' | 'candle' | 'bar';
}

const API_KEY = process.env.NEXT_PUBLIC_RELIGARE_API_KEY ?? '0HVTVTkNzEg7Dwjd80T0bXbO8t8FThd';
const BASE    = 'https://leap.religareonline.com/TV/index.html';

// AngelOne uses virtual index tokens (99926000, 99926009 …) that differ from
// Religare's NSE/BSE index tokens. Equities share the same NSE-assigned token.
// Confirmed via Religare's ScripDetailsForChartUI + LookUp APIs.
const ANGEL_TO_RELIGARE: Record<string, { token: string; mktsegid: number }> = {
  '99926000': { token: '26000', mktsegid: 1 },  // NIFTY 50
  '99926009': { token: '26009', mktsegid: 1 },  // BANKNIFTY
  '99926037': { token: '26037', mktsegid: 1 },  // FINNIFTY
  '99926008': { token: '26008', mktsegid: 1 },  // NIFTY IT
  '99919000': { token: '19000', mktsegid: 3 },  // SENSEX (BSE)
  '99919016': { token: '19016', mktsegid: 3 },  // BSE MIDCAP
};

// Derives Religare market segment ID from exchange + instrument type
export function toMktSegId(exchange: string, instrumentType?: string): number {
  const ex = (exchange ?? '').toUpperCase();
  const it = (instrumentType ?? '').toUpperCase();
  const isFO = ['FUTIDX','FUTSTK','OPTIDX','OPTSTK','CE','PE','FUT'].includes(it);
  if (ex === 'BSE') return isFO ? 4 : 3;
  if (ex === 'MCX') return 5;
  return isFO ? 2 : 1; // NSE default
}

export function ReligareChart({
  token,
  mktsegid  = 1,
  theme     = 'light',
  interval  = 'MIN',
  chartStyle = 'line',
}: Props) {
  // Remap AngelOne index virtual tokens → actual Religare tokens
  const mapped = ANGEL_TO_RELIGARE[token];
  const resolvedToken    = mapped ? mapped.token    : token;
  const resolvedMktsegid = mapped ? mapped.mktsegid : mktsegid;

  const params = new URLSearchParams({
    ver:        'v1',
    mode:       'advance',
    pid:        '2',
    mktsegid:   String(resolvedMktsegid),
    tkn:        resolvedToken,
    period:     '1',
    interval,
    style:      chartStyle,
    zoom:       'y',
    xaxis:      'y',
    yaxis:      'y',
    hdr:        'y',
    title:      'n',
    headsup:    'y',
    buysell:    'y',
    lookup:     'y',
    theme:      theme === 'dark' ? 'd' : 'l',
    span:       '',
    continuous: '',
    group:      'g1',
    apikey:     API_KEY,
  });

  return (
    <iframe
      key={`${resolvedToken}-${resolvedMktsegid}-${interval}-${theme}`}
      src={`${BASE}?${params.toString()}`}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      allowFullScreen
    />
  );
}
