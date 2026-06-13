import { NextRequest } from 'next/server';

const BASE    = 'https://leap.religareonline.com/TV/index.html';
const API_KEY = process.env.RELIGARE_API_KEY ?? process.env.NEXT_PUBLIC_RELIGARE_API_KEY ?? '0HVTVTkNzEg7Dwjd80T0bXbO8t8FThd';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const token    = sp.get('t') ?? '';
  const mktsegid = sp.get('s') ?? '1';
  const interval = sp.get('i') ?? 'MIN';
  const style    = sp.get('cs') ?? 'line';
  const theme    = sp.get('th') ?? 'light';

  if (!token) {
    return new Response('Bad request', { status: 400 });
  }

  const params = new URLSearchParams({
    ver:        'v1',
    mode:       'advance',
    pid:        '2',
    mktsegid,
    tkn:        token,
    period:     '1',
    interval,
    style,
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
    userid:     'test4',
  });

  try {
    const resp = await fetch(`${BASE}?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!resp.ok) {
      return errorPage(resp.status);
    }

    let html = await resp.text();

    // Inject <base> so relative sub-resources (JS/CSS) resolve against Religare's origin
    const baseTag = '<base href="https://leap.religareonline.com/TV/">';
    if (/<head/i.test(html)) {
      html = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    } else {
      html = baseTag + html;
    }

    return new Response(html, {
      headers: {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch {
    return errorPage(502);
  }
}

function errorPage(status: number) {
  return new Response(
    `<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#94a3b8;background:#f8fafc">Chart unavailable</body></html>`,
    { status, headers: { 'Content-Type': 'text/html' } },
  );
}
