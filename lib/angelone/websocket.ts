// AngelOne WebSocket Streaming 2.0 — client-side singleton manager.
// wss://smartapisocket.angelone.in/smart-stream
//
// Binary response format (Little Endian):
//   [0]     mode       int8   — 1=LTP, 2=Quote, 3=SnapQuote
//   [1]     exchType   int8   — 1=nse_cm, 2=nse_fo, 3=bse_cm, 4=bse_fo, 5=mcx_fo
//   [2-26]  token      25 B   — null-terminated UTF-8 string
//   [27-34] seqNo      int64
//   [35-42] exchTs     int64  — epoch ms
//   [43-50] ltp        int64  — paise (/100 = ₹)
// Quote mode adds at [51-122]:
//   [67-74] volume     int64
//   [91-98] open       int64  paise
//   [99-106] high      int64  paise
//   [107-114] low      int64  paise
//   [115-122] close    int64  paise (previous day close)

export interface PriceTick {
  token:        string;
  exchangeType: number;
  ltp:          number;
  open?:        number;
  high?:        number;
  low?:         number;
  close?:       number;
  volume?:      number;
}

type Listener = (tick: PriceTick) => void;

class AngelOneWebSocket {
  private ws:          WebSocket | null = null;
  private creds:       { feedToken: string; clientCode: string; apiKey: string } | null = null;
  private listeners  = new Set<Listener>();
  private subs       = new Map<number, Set<string>>(); // exchangeType → tokens
  private hbTimer:   ReturnType<typeof setInterval>  | null = null;
  private reconnTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnDelay  = 2_000;
  private live         = false;
  private pendingConnect = false;

  setCredentials(creds: { feedToken: string; clientCode: string; apiKey: string }) {
    this.creds = creds;
  }

  connect() {
    if (!this.creds || this.ws || this.pendingConnect) return;
    this.pendingConnect = true;
    const { feedToken, clientCode, apiKey } = this.creds;
    const url = [
      'wss://smartapisocket.angelone.in/smart-stream',
      `?clientCode=${encodeURIComponent(clientCode)}`,
      `&feedToken=${encodeURIComponent(feedToken)}`,
      `&apiKey=${encodeURIComponent(apiKey)}`,
    ].join('');

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.pendingConnect = false;
      this.live = true;
      this.reconnDelay = 2_000;
      this.clearTimers();
      // Heartbeat every 30 s
      this.hbTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 30_000);
      // Restore all subscriptions after reconnect
      this.sendAllSubs();
    };

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') return; // 'pong' or JSON error — ignore
      const tick = this.parse(evt.data as ArrayBuffer);
      if (tick) this.listeners.forEach(l => l(tick));
    };

    ws.onclose = () => {
      this.pendingConnect = false;
      this.live = false;
      this.ws   = null;
      this.clearTimers();
      // Exponential back-off reconnect (max 30 s)
      this.reconnTimer = setTimeout(() => {
        this.reconnDelay = Math.min(this.reconnDelay * 2, 30_000);
        this.connect();
      }, this.reconnDelay);
    };

    ws.onerror = () => ws.close();
  }

  // ── Binary parser ─────────────────────────────────────────────────────────
  private parse(buf: ArrayBuffer): PriceTick | null {
    if (buf.byteLength < 51) return null;
    const v = new DataView(buf);
    const mode         = v.getInt8(0);
    const exchangeType = v.getInt8(1);

    // Token: 25 bytes at offset 2, null-terminated
    const tb = new Uint8Array(buf, 2, 25);
    let token = '';
    for (let i = 0; i < 25 && tb[i] !== 0; i++) token += String.fromCharCode(tb[i]);

    const ltp = Number(v.getBigInt64(43, true)) / 100;
    const tick: PriceTick = { token, exchangeType, ltp };

    if (mode >= 2 && buf.byteLength >= 123) {
      tick.volume = Number(v.getBigInt64(67, true));
      tick.open   = Number(v.getBigInt64(91,  true)) / 100;
      tick.high   = Number(v.getBigInt64(99,  true)) / 100;
      tick.low    = Number(v.getBigInt64(107, true)) / 100;
      tick.close  = Number(v.getBigInt64(115, true)) / 100;
    }
    return tick;
  }

  // ── Subscription helpers ──────────────────────────────────────────────────
  private send(payload: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private sendAllSubs() {
    const tokenList = Array.from(this.subs.entries())
      .filter(([, toks]) => toks.size > 0)
      .map(([exchangeType, toks]) => ({ exchangeType, tokens: Array.from(toks) }));
    if (!tokenList.length) return;
    this.send({ correlationID: 'tk001', action: 1, params: { mode: 2, tokenList } });
  }

  subscribe(exchangeType: number, tokens: string[]) {
    if (!this.subs.has(exchangeType)) this.subs.set(exchangeType, new Set());
    const set  = this.subs.get(exchangeType)!;
    const news = tokens.filter(t => t && !set.has(t));
    if (!news.length) return;
    news.forEach(t => set.add(t));
    this.send({
      correlationID: 'tk001', action: 1,
      params: { mode: 2, tokenList: [{ exchangeType, tokens: news }] },
    });
  }

  unsubscribe(exchangeType: number, tokens: string[]) {
    const set = this.subs.get(exchangeType);
    if (!set) return;
    tokens.forEach(t => set.delete(t));
    if (this.live) {
      this.send({
        correlationID: 'tk001', action: 0,
        params: { mode: 2, tokenList: [{ exchangeType, tokens }] },
      });
    }
  }

  addListener(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get isConnected() { return this.live; }

  disconnect() {
    this.clearTimers();
    this.ws?.close();
    this.ws   = null;
    this.live = false;
    this.creds = null;
  }

  private clearTimers() {
    if (this.hbTimer)    { clearInterval(this.hbTimer);   this.hbTimer    = null; }
    if (this.reconnTimer){ clearTimeout(this.reconnTimer); this.reconnTimer = null; }
  }
}

// Lazy singleton — only created in the browser
let _ws: AngelOneWebSocket | null = null;
export function getAngelWs(): AngelOneWebSocket | null {
  if (typeof window === 'undefined') return null;
  if (!_ws) _ws = new AngelOneWebSocket();
  return _ws;
}
