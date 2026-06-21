/**
 * Data-access layer — always uses abhitrade_live.
 */
import { livePool } from './client';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SecurityMasterRow {
  id?: number;
  token: string;
  exchange: string;
  symbol: string;
  trading_symbol?: string;
  name?: string;
  isin?: string;
  instrument_type: string;
  segment?: string;
  lot_size: number;
  tick_size: number;
  strike?: number;
  expiry?: string;
  option_type?: string;
  underlying?: string;
  freeze_quantity?: number;
  // EOD prices (populated from bhavcopy)
  ltp?:              number | null;
  open_price?:       number | null;
  high_price?:       number | null;
  low_price?:        number | null;
  close_price?:      number | null;
  prev_close?:       number | null;
  net_change?:       number | null;
  change_pct?:       number | null;
  volume?:           number | null;
  open_interest?:    number | null;
  price_date?:       string | null;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface OrderRow {
  id: string;
  user_id: string;
  exchange: string;
  symbol: string;
  transaction_type: string;
  order_type: string;
  product_type: string;
  quantity: number;
  price?: number;
  trigger_price?: number;
  status: string;
  filled_quantity: number;
  average_price?: number;
  placed_at: string;
}

export interface AlertRow {
  id: string;
  user_id: string;
  exchange: string;
  symbol: string;
  condition: string;
  target_value: number;
  message?: string;
  status: string;
  triggered_at?: string;
  expires_at?: string;
}

// ─── Security Master ──────────────────────────────────────────────────────────

export async function upsertInstrumentsBatch(rows: SecurityMasterRow[]): Promise<number> {
  if (!rows.length) return 0;

  const cols = [
    'token','exchange','symbol','trading_symbol','name','isin',
    'instrument_type','segment','lot_size','tick_size',
    'strike','expiry','option_type','underlying','freeze_quantity',
  ];
  const placeholders: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const r of rows) {
    const slots = cols.map(() => `$${idx++}`);
    placeholders.push(`(${slots.join(',')})`);
    values.push(
      r.token, r.exchange, r.symbol, r.trading_symbol ?? null, r.name ?? null,
      r.isin ?? null, r.instrument_type, r.segment ?? null,
      r.lot_size, r.tick_size,
      r.strike ?? null, r.expiry ?? null, r.option_type ?? null,
      r.underlying ?? null, r.freeze_quantity ?? null,
    );
  }

  const sql = `
    INSERT INTO security_master (${cols.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT (token, exchange) DO UPDATE SET
      symbol           = EXCLUDED.symbol,
      trading_symbol   = EXCLUDED.trading_symbol,
      name             = EXCLUDED.name,
      isin             = EXCLUDED.isin,
      instrument_type  = EXCLUDED.instrument_type,
      segment          = EXCLUDED.segment,
      lot_size         = EXCLUDED.lot_size,
      tick_size        = EXCLUDED.tick_size,
      strike           = EXCLUDED.strike,
      expiry           = EXCLUDED.expiry,
      option_type      = EXCLUDED.option_type,
      underlying       = EXCLUDED.underlying,
      freeze_quantity  = EXCLUDED.freeze_quantity,
      updated_at       = NOW()
  `;
  const res = await livePool.query(sql, values);
  return res.rowCount ?? 0;
}

export async function searchInstrumentsPg(
  q: string,
  opts: { exchange?: string; type?: string; limit?: number } = {},
): Promise<SecurityMasterRow[]> {
  const { exchange, type, limit = 20 } = opts;
  const params: any[] = [`${q.toUpperCase()}%`, limit];
  let where = 'is_active = TRUE AND (symbol ILIKE $1 OR trading_symbol ILIKE $1)';
  let n = 3;
  if (exchange) { where += ` AND exchange = $${n++}`; params.push(exchange); }
  if (type)     { where += ` AND instrument_type = $${n++}`; params.push(type); }

  const res = await livePool.query<SecurityMasterRow>(
    `SELECT * FROM (
       SELECT DISTINCT ON (symbol, exchange, instrument_type, trading_symbol) *
       FROM security_master WHERE ${where}
       ORDER BY symbol, exchange, instrument_type, trading_symbol, token
     ) deduped
     ORDER BY
       CASE WHEN symbol ILIKE $1 THEN 0 ELSE 1 END,
       CASE
         WHEN exchange = 'NSE' AND instrument_type = 'EQ'    THEN 0
         WHEN exchange = 'BSE' AND instrument_type = 'EQ'    THEN 1
         WHEN exchange = 'NSE' AND instrument_type = 'INDEX' THEN 2
         WHEN exchange = 'BSE' AND instrument_type = 'INDEX' THEN 3
         ELSE 4
       END,
       symbol
     LIMIT $2`,
    params,
  );
  return res.rows;
}

export async function getInstrumentByToken(token: string, exchange: string) {
  const res = await livePool.query<SecurityMasterRow>(
    'SELECT * FROM security_master WHERE token = $1 AND exchange = $2 LIMIT 1',
    [token, exchange],
  );
  return res.rows[0] ?? null;
}

export async function getExpiryDates(symbol: string, exchange?: string) {
  const params: any[] = [symbol];
  let where = 'underlying = $1 AND expiry IS NOT NULL';
  if (exchange) { where += ' AND exchange = $2'; params.push(exchange); }
  const res = await livePool.query<{ expiry: string }>(
    `SELECT DISTINCT expiry FROM security_master WHERE ${where} AND is_active = TRUE ORDER BY expiry`,
    params,
  );
  return res.rows.map(r => r.expiry);
}

// ─── Option Chain Queries ─────────────────────────────────────────────────────

export async function loadOptionInstruments() {
  const res = await livePool.query<{
    token: string; exchange: string; underlying: string;
    expiry: string; strike: number; option_type: string;
    trading_symbol: string; lot_size: number;
  }>(
    `SELECT token, exchange, underlying,
            to_char(expiry, 'YYYY-MM-DD') AS expiry,
            strike, option_type, trading_symbol, lot_size
     FROM   security_master
     WHERE  instrument_type IN ('OPTIDX','OPTSTK')
       AND  is_active  = TRUE
       AND  underlying IS NOT NULL
       AND  expiry     IS NOT NULL
       AND  strike     IS NOT NULL
       AND  option_type IN ('CE','PE')
     ORDER  BY underlying, expiry, strike`,
  );
  return res.rows;
}

export async function getOptionExpiries(symbol: string, exchange?: string): Promise<string[]> {
  const params: unknown[] = [symbol.toUpperCase()];
  let where = `underlying = $1
    AND instrument_type IN ('OPTIDX','OPTSTK')
    AND is_active = TRUE
    AND expiry IS NOT NULL`;
  if (exchange) { where += ' AND exchange = $2'; params.push(exchange.toUpperCase()); }
  const res = await livePool.query<{ expiry: string }>(
    `SELECT DISTINCT to_char(expiry,'YYYY-MM-DD') AS expiry
     FROM   security_master
     WHERE  ${where}
     ORDER  BY expiry`,
    params,
  );
  return res.rows.map(r => r.expiry);
}

// ─── Upload Jobs ──────────────────────────────────────────────────────────────

export async function createUploadJob(
  data: { user_id?: string; filename: string; file_path: string; file_size: number; source_exchange?: string },
) {
  const res = await livePool.query<{ id: string }>(
    `INSERT INTO upload_jobs (user_id, filename, file_path, file_size, source_exchange)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [data.user_id ?? null, data.filename, data.file_path, data.file_size, data.source_exchange ?? 'AUTO'],
  );
  return res.rows[0].id;
}

export async function updateUploadJob(
  id: string,
  data: { status?: string; total_rows?: number; valid_rows?: number; invalid_rows?: number; duplicate_rows?: number; error_message?: string; started_at?: string; completed_at?: string },
) {
  const sets: string[] = [];
  const vals: any[] = [];
  let n = 1;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { sets.push(`${k} = $${n++}`); vals.push(v); }
  }
  if (!sets.length) return;
  vals.push(id);
  await livePool.query(`UPDATE upload_jobs SET ${sets.join(',')} WHERE id = $${n}`, vals);
}

export async function getUploadJob(id: string) {
  const res = await livePool.query('SELECT * FROM upload_jobs WHERE id = $1', [id]);
  return res.rows[0] ?? null;
}

// ─── Watchlists ───────────────────────────────────────────────────────────────

export async function getWatchlists(userId: string): Promise<WatchlistRow[]> {
  const res = await livePool.query<WatchlistRow>(
    'SELECT * FROM watchlists WHERE user_id = $1 ORDER BY sort_order, created_at',
    [userId],
  );
  return res.rows;
}

export async function createWatchlist(userId: string, name: string) {
  const res = await livePool.query<WatchlistRow>(
    'INSERT INTO watchlists (user_id, name) VALUES ($1,$2) RETURNING *',
    [userId, name],
  );
  return res.rows[0];
}

export async function updateWatchlist(id: string, userId: string, data: Partial<WatchlistRow>) {
  const { name, sort_order } = data;
  const res = await livePool.query<WatchlistRow>(
    'UPDATE watchlists SET name=COALESCE($3,name), sort_order=COALESCE($4,sort_order) WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId, name ?? null, sort_order ?? null],
  );
  return res.rows[0] ?? null;
}

export async function deleteWatchlist(id: string, userId: string) {
  await livePool.query('DELETE FROM watchlists WHERE id=$1 AND user_id=$2', [id, userId]);
}

export async function getWatchlistItems(watchlistId: string) {
  const res = await livePool.query(
    'SELECT * FROM watchlist_items WHERE watchlist_id=$1 ORDER BY sort_order, added_at',
    [watchlistId],
  );
  return res.rows;
}

export async function addWatchlistItem(
  watchlistId: string,
  item: { token?: string; exchange: string; symbol: string; trading_symbol?: string; instrument_type?: string },
) {
  const res = await livePool.query(
    `INSERT INTO watchlist_items (watchlist_id, token, exchange, symbol, trading_symbol, instrument_type)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (watchlist_id, symbol, exchange) DO NOTHING RETURNING *`,
    [watchlistId, item.token ?? null, item.exchange, item.symbol, item.trading_symbol ?? null, item.instrument_type ?? null],
  );
  return res.rows[0] ?? null;
}

export async function removeWatchlistItem(itemId: string, watchlistId: string) {
  await livePool.query('DELETE FROM watchlist_items WHERE id=$1 AND watchlist_id=$2', [itemId, watchlistId]);
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function getOrders(
  userId: string,
  opts: { status?: string; limit?: number; offset?: number } = {},
) {
  const { status, limit = 50, offset = 0 } = opts;
  const params: any[] = [userId];
  let where = 'user_id = $1';
  if (status) { where += ` AND status = $${params.push(status)}`; }
  const res = await livePool.query<OrderRow>(
    `SELECT * FROM orders WHERE ${where} ORDER BY placed_at DESC LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
    params,
  );
  return res.rows;
}

export async function createOrder(userId: string, data: Omit<OrderRow, 'id'|'user_id'|'placed_at'>) {
  const res = await livePool.query<OrderRow>(
    `INSERT INTO orders
     (user_id, exchange, symbol, trading_symbol, transaction_type, order_type, product_type,
      quantity, price, trigger_price, variety, tag)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [userId, data.exchange, data.symbol, (data as any).trading_symbol ?? null,
     data.transaction_type, data.order_type, data.product_type,
     data.quantity, data.price ?? null, data.trigger_price ?? null,
     (data as any).variety ?? 'NORMAL', (data as any).tag ?? null],
  );
  return res.rows[0];
}

export async function updateOrder(
  id: string, userId: string,
  data: { status?: string; filled_quantity?: number; average_price?: number; broker_order_id?: string; rejection_reason?: string },
) {
  const sets: string[] = [];
  const vals: any[] = [id, userId];
  let n = 3;
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { sets.push(`${k} = $${n++}`); vals.push(v); }
  }
  if (!sets.length) return null;
  const res = await livePool.query<OrderRow>(
    `UPDATE orders SET ${sets.join(',')} WHERE id=$1 AND user_id=$2 RETURNING *`, vals,
  );
  return res.rows[0] ?? null;
}

export async function cancelOrder(id: string, userId: string) {
  const res = await livePool.query<OrderRow>(
    `UPDATE orders SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status IN ('pending','open') RETURNING *`,
    [id, userId],
  );
  return res.rows[0] ?? null;
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export async function getHoldings(userId: string) {
  const res = await livePool.query(
    'SELECT * FROM holdings WHERE user_id=$1 AND quantity > 0 ORDER BY symbol',
    [userId],
  );
  return res.rows;
}

export async function upsertHolding(
  userId: string,
  data: { token?: string; exchange: string; symbol: string; trading_symbol?: string; isin?: string; quantity: number; average_price: number; group_name?: string },
) {
  await livePool.query(
    `INSERT INTO holdings (user_id,token,exchange,symbol,trading_symbol,isin,quantity,average_price,group_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (user_id, symbol, exchange) DO UPDATE SET
       quantity=EXCLUDED.quantity, average_price=EXCLUDED.average_price, updated_at=NOW()`,
    [userId, data.token ?? null, data.exchange, data.symbol, data.trading_symbol ?? null,
     data.isin ?? null, data.quantity, data.average_price, data.group_name ?? null],
  );
}

// ─── Positions ────────────────────────────────────────────────────────────────

export async function getPositions(userId: string, opts: { date?: string } = {}) {
  const { date = new Date().toISOString().slice(0,10) } = opts;
  const res = await livePool.query(
    'SELECT * FROM positions WHERE user_id=$1 AND trade_date=$2 ORDER BY symbol',
    [userId, date],
  );
  return res.rows;
}

export async function upsertPosition(
  userId: string,
  data: { token?: string; exchange: string; symbol: string; product_type: string; quantity: number; buy_quantity: number; sell_quantity: number; average_price?: number; buy_average?: number; sell_average?: number; last_price?: number; realized_pnl?: number },
) {
  const today = new Date().toISOString().slice(0,10);
  await livePool.query(
    `INSERT INTO positions
     (user_id,token,exchange,symbol,product_type,quantity,buy_quantity,sell_quantity,
      average_price,buy_average,sell_average,last_price,realized_pnl,trade_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id,symbol,exchange,product_type,trade_date) DO UPDATE SET
       quantity=EXCLUDED.quantity, buy_quantity=EXCLUDED.buy_quantity,
       sell_quantity=EXCLUDED.sell_quantity, average_price=EXCLUDED.average_price,
       buy_average=EXCLUDED.buy_average, sell_average=EXCLUDED.sell_average,
       last_price=EXCLUDED.last_price, realized_pnl=EXCLUDED.realized_pnl, updated_at=NOW()`,
    [userId, data.token ?? null, data.exchange, data.symbol, data.product_type,
     data.quantity, data.buy_quantity, data.sell_quantity,
     data.average_price ?? null, data.buy_average ?? null, data.sell_average ?? null,
     data.last_price ?? null, data.realized_pnl ?? 0, today],
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function getAlerts(userId: string, status?: string) {
  const params: any[] = [userId];
  let where = 'user_id = $1';
  if (status) where += ` AND status = $${params.push(status)}`;
  const res = await livePool.query<AlertRow>(
    `SELECT * FROM alerts WHERE ${where} ORDER BY created_at DESC`, params,
  );
  return res.rows;
}

export async function createAlert(userId: string, data: Omit<AlertRow, 'id'|'user_id'>) {
  const res = await livePool.query<AlertRow>(
    `INSERT INTO alerts (user_id, token, exchange, symbol, condition, target_value, message, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, (data as any).token ?? null, data.exchange, data.symbol,
     data.condition, data.target_value, data.message ?? null, data.expires_at ?? null],
  );
  return res.rows[0];
}

export async function updateAlert(id: string, userId: string, data: Partial<AlertRow>) {
  const sets: string[] = [];
  const vals: any[] = [id, userId];
  let n = 3;
  const allowed = ['status','target_value','message','expires_at','notify_email','notify_push'];
  for (const key of allowed) {
    const v = (data as any)[key];
    if (v !== undefined) { sets.push(`${key} = $${n++}`); vals.push(v); }
  }
  if (!sets.length) return null;
  const res = await livePool.query<AlertRow>(
    `UPDATE alerts SET ${sets.join(',')} WHERE id=$1 AND user_id=$2 RETURNING *`, vals,
  );
  return res.rows[0] ?? null;
}

export async function deleteAlert(id: string, userId: string) {
  await livePool.query('DELETE FROM alerts WHERE id=$1 AND user_id=$2', [id, userId]);
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string) {
  const res = await livePool.query('SELECT * FROM users WHERE email=$1 LIMIT 1', [email]);
  return res.rows[0] ?? null;
}

export async function getUserByName(name: string) {
  const res = await livePool.query(
    'SELECT * FROM users WHERE LOWER(name) = LOWER($1) LIMIT 1',
    [name.trim()],
  );
  return res.rows[0] ?? null;
}

export async function getUserById(id: string) {
  const res = await livePool.query(
    'SELECT id,email,phone,name,kyc_status,avatar_url,created_at FROM users WHERE id=$1', [id],
  );
  return res.rows[0] ?? null;
}

export async function createUser(data: { email: string; phone?: string; name: string; password_hash?: string }) {
  const res = await livePool.query(
    'INSERT INTO users (email,phone,name,password_hash) VALUES ($1,$2,$3,$4) RETURNING id,email,name,phone',
    [data.email, data.phone ?? null, data.name, data.password_hash ?? null],
  );
  return res.rows[0];
}

export async function storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
  await livePool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [userId, tokenHash, expiresAt],
  );
}

export async function getRefreshToken(tokenHash: string) {
  const res = await livePool.query(
    'SELECT * FROM refresh_tokens WHERE token_hash=$1 AND expires_at > NOW() LIMIT 1',
    [tokenHash],
  );
  return res.rows[0] ?? null;
}

export async function revokeRefreshToken(tokenHash: string) {
  await livePool.query('DELETE FROM refresh_tokens WHERE token_hash=$1', [tokenHash]);
}
