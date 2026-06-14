'use client';

import { useState } from 'react';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';

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
  '99926000': { token: '26000', mktsegid: 1 },  // NIFTY 50   (NSE_EQ=1)
  '99926009': { token: '26009', mktsegid: 1 },  // BANKNIFTY  (NSE_EQ=1)
  '99926037': { token: '26037', mktsegid: 1 },  // FINNIFTY   (NSE_EQ=1)
  '99926008': { token: '26008', mktsegid: 1 },  // NIFTY IT   (NSE_EQ=1)
  '99919000': { token: '19000', mktsegid: 8 },  // SENSEX     (BSE_EQ=8)
  '99919016': { token: '19016', mktsegid: 8 },  // BSE MIDCAP (BSE_EQ=8)
};

// Segment ID mapping (from Religare API spec):
// 1=NSE_EQ  2=NSE_FO  3=NSE_CUR  4=BSE_FO  8=BSE_EQ
export function toMktSegId(exchange: string, instrumentType?: string, segment?: string): number {
  const ex  = (exchange      ?? '').toUpperCase();
  const it  = (instrumentType ?? '').toUpperCase();
  const seg = (segment        ?? '').toUpperCase();
  const isFO  = ['FUTIDX','FUTSTK','OPTIDX','OPTSTK','CE','PE','FUT'].includes(it) || seg === 'FO';
  const isCUR = seg === 'CD' || seg === 'CUR' || it === 'CUR';
  if (ex === 'BSE') return isFO ? 4 : 8;   // BSE_FO=4, BSE_EQ=8
  if (ex === 'MCX') return 5;
  if (isCUR)        return 3;               // NSE_CUR=3
  return isFO ? 2 : 1;                      // NSE_FO=2, NSE_EQ=1
}

export function ReligareChart({
  token,
  mktsegid  = 1,
  theme     = 'light',
  interval  = 'MIN',
  chartStyle = 'line',
}: Props) {
  const devToolsOpen = useDevToolsDetection();
  const [mountId] = useState(() => Date.now());

  if (devToolsOpen) return null;

  // Remap AngelOne index virtual tokens → actual Religare tokens
  const mapped = ANGEL_TO_RELIGARE[token];
  const resolvedToken    = mapped ? mapped.token    : token;
  const resolvedMktsegid = mapped ? mapped.mktsegid : mktsegid;

  const themeParam = theme === 'dark' ? 'n' : 'd';

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
    theme:      themeParam,
    span:       '',
    continuous: '',
    group:      'g1',
    apikey:     API_KEY,
    userid:     'test4',
    _cb:        String(mountId),  // cache-buster: new value on every remount
  });

  return (
    <iframe
      src={`${BASE}?${params.toString()}`}
      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      allowFullScreen
    />
  );
}
