// Server-side AngelOne SmartAPI client — used in Next.js API routes only

const BASE = 'https://apiconnect.angelone.in';

function headers(apiKey: string, accessToken?: string) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '106.51.128.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': apiKey,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

async function callApi<T>(
  path: string,
  method: 'GET' | 'POST',
  apiKey: string,
  accessToken: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(apiKey, accessToken),
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });

  const text = await res.text();
  let json: { status?: boolean; errorcode?: string; message?: string; data?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    // AngelOne returns plain text for rate-limit / access errors
    throw new Error(text.includes('rate') || text.includes('Access denied')
      ? 'Rate limit exceeded — please wait and retry'
      : text.substring(0, 200));
  }

  if (!json.status && json.errorcode) {
    throw new Error(`${json.errorcode}: ${json.message}`);
  }
  return json.data as T;
}

// ── Profile ───────────────────────────────────────────────────────────────────
export function getProfile(apiKey: string, accessToken: string) {
  return callApi<{
    clientcode: string; name: string; email: string; mobileno: string;
    exchanges: string[]; products: string[]; lastlogintime: string; brokerid: string;
  }>('/rest/secure/angelbroking/user/v1/getProfile', 'GET', apiKey, accessToken);
}

// ── Funds / RMS ───────────────────────────────────────────────────────────────
export function getRMS(apiKey: string, accessToken: string) {
  return callApi<{
    net: string; availablecash: string; availableintradaypayin: string;
    utiliseddebits: string; collateral: string; m2munrealized: string; m2mrealized: string;
  }>('/rest/secure/angelbroking/user/v1/getRMS', 'GET', apiKey, accessToken);
}

// ── Holdings ──────────────────────────────────────────────────────────────────
export function getAllHolding(apiKey: string, accessToken: string) {
  return callApi<{
    totalholding: {
      totalholdingvalue: string; totalinvvalue: string; totalprofitandloss: string;
      totalpnlpercentage: string;
    };
    holdings: Array<{
      tradingsymbol: string; symboltoken: string; exchange: string; isin: string;
      t1quantity: number; realisedquantity: number; quantity: number; authorisedquantity: number;
      product: string; collateralquantity: number | null; collateraltype: string | null;
      haircut: number; averageprice: number; ltp: number; symbolname: string; close: number;
      profitandloss: number; pnlpercentage: number;
    }>;
  }>('/rest/secure/angelbroking/portfolio/v1/getAllHolding', 'GET', apiKey, accessToken);
}

// ── Positions ─────────────────────────────────────────────────────────────────
export function getPosition(apiKey: string, accessToken: string) {
  return callApi<Array<{
    exchange: string; symboltoken: string; producttype: string; tradingsymbol: string;
    symbolname: string; instrumenttype: string; priceden: string; pricenumerator: string;
    genpriceden: string; genpricenumerator: string; precision: string; multiplier: string;
    boardlotsize: string; buyqty: string; sellqty: string; buyamount: string; sellamount: string;
    symbolgroup: string; strikeprice: string; optiontype: string; expirydate: string;
    lotsize: string; cfbuyqty: string; cfsellamount: string; cfbuyamount: string;
    cfbuyavgprice: string; cfsellqty: string; cfsellavgprice: string; buyavgprice: string;
    sellavgprice: string; avg_price: string; netqty: string; netamount: string;
    day_buy_qty: string; day_sell_qty: string; day_buy_amount: string; day_sell_amount: string;
    day_buy_avg_price: string; day_sell_avg_price: string; cfnetqty: string; cfnetamount: string;
    totalbuyvalue: string; totalsellvalue: string; cfbuyquantity: string; cfsellquantity: string;
    flttradingsymbol: string; close: string; ltp: string; realised: string; unrealised: string;
    mtm: string; pnl: string;
  }>>('/rest/secure/angelbroking/order/v1/getPosition', 'GET', apiKey, accessToken);
}

// ── Order Book ────────────────────────────────────────────────────────────────
export function getOrderBook(apiKey: string, accessToken: string) {
  return callApi<Array<{
    variety: string; ordertype: string; producttype: string; duration: string;
    price: string; triggerprice: string; quantity: string; disclosedquantity: string;
    amount: string; exchange: string; tradingsymbol: string; symboltoken: string;
    ordertag: string; instrumenttype: string; strikeprice: string; optiontype: string;
    expirydate: string; lotsize: string; cancelsize: string; status: string;
    orderid: string; text: string; loginid: string; clientcode: string;
    orderUpdateTime: string; exchtime: string; exchorderupdatetime: string;
    fillid: string; filltime: string; parentorderid: string; uniqueorderid: string;
    exchangeorderid: string; filledshares: string; unfilledshares: string;
    averageprice: string; transactiontype: string; symbolname: string; ordernumber: string;
  }>>('/rest/secure/angelbroking/order/v1/getOrderBook', 'GET', apiKey, accessToken);
}

// ── Trade Book ────────────────────────────────────────────────────────────────
export function getTradeBook(apiKey: string, accessToken: string) {
  return callApi<Array<{
    exchange: string; producttype: string; tradingsymbol: string; instrumenttype: string;
    symboltoken: string; transactiontype: string; variety: string;
    tradevalue: string; quantity: string; price: string; carryforward: string;
    expiry: string; lotsize: string; uniqueorderid: string; orderid: string;
    fillid: string; filltime: string; tradevalue2: string;
  }>>('/rest/secure/angelbroking/order/v1/getTradeBook', 'GET', apiKey, accessToken);
}

// ── Historical Candles ────────────────────────────────────────────────────────
// Native AngelOne intervals — pass these directly to the API
export type CandleInterval =
  | 'ONE_MINUTE' | 'THREE_MINUTE' | 'FIVE_MINUTE' | 'TEN_MINUTE'
  | 'FIFTEEN_MINUTE' | 'THIRTY_MINUTE' | 'ONE_HOUR' | 'ONE_DAY';

// Extended set used internally (TWO_HOUR/FOUR_HOUR/ONE_WEEK/ONE_MONTH are
// aggregated from ONE_HOUR/ONE_DAY by the mongo-chart bucketing layer)
export type ExtendedInterval = CandleInterval
  | 'TWO_HOUR' | 'FOUR_HOUR' | 'ONE_WEEK' | 'ONE_MONTH';

export function getCandleData(
  apiKey: string, accessToken: string,
  exchange: string, symboltoken: string,
  interval: CandleInterval,
  fromdate: string, todate: string
) {
  return callApi<Array<[string, number, number, number, number, number]>>(
    '/rest/secure/angelbroking/historical/v1/getCandleData',
    'POST', apiKey, accessToken,
    { exchange, symboltoken, interval, fromdate, todate }
  );
}

// ── Market Quote ──────────────────────────────────────────────────────────────
export function getMarketQuote(
  apiKey: string, accessToken: string,
  mode: 'LTP' | 'OHLC' | 'FULL',
  exchangeTokens: Record<string, string[]>
) {
  return callApi<{
    fetched: Array<{
      exchange: string; tradingSymbol: string; symbolToken: string;
      ltp: number; open: number; high: number; low: number; close: number;
      lastTradeQty: number; exchFeedTime: string; exchTradeTime: string;
      netChange: number; percentChange: number; avgPrice: number;
      tradeVolume: number; opnInterest: number;
      upperCircuit: string; lowerCircuit: string;
      '52WeekLow': number; '52WeekHigh': number;
    }>;
    unfetched: string[];
  }>('/rest/secure/angelbroking/market/v1/quote', 'POST', apiKey, accessToken,
    { mode, exchangeTokens }
  );
}

// ── Search Scrip ──────────────────────────────────────────────────────────────
export function searchScrip(
  apiKey: string, accessToken: string,
  exchange: string, searchscrip: string
) {
  return callApi<Array<{
    exchange: string; tradingsymbol: string; symboltoken: string;
    name: string; instrumenttype: string; expiry: string; strike: string;
    lotsize: string;
  }>>('/rest/secure/angelbroking/order/v1/searchScrip', 'POST', apiKey, accessToken,
    { exchange, searchscrip }
  );
}

// ── Order Margin ──────────────────────────────────────────────────────────────
export function getOrderMargin(
  apiKey: string, accessToken: string,
  positions: Array<{
    exchange: string;
    qty: number;
    price: number;
    productType: 'DELIVERY' | 'INTRADAY' | 'CARRYFORWARD';
    token: string;
    tradeType: 'BUY' | 'SELL';
  }>
) {
  return callApi<{
    positionList: unknown[];
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
  }>('/rest/secure/angelbroking/order/v1/getMargin', 'POST', apiKey, accessToken, { positions });
}

// ── Market Analytics ──────────────────────────────────────────────────────────
export function getGainersLosers(
  apiKey: string, accessToken: string,
  datatype: 'PercPriceGainers' | 'PercPriceLosers' | 'PercOIGainers' | 'PercOILosers'
) {
  return callApi<unknown>('/rest/secure/angelbroking/marketData/v1/gainersLosers',
    'POST', apiKey, accessToken, { datatype }
  );
}

// ── Option Greeks ─────────────────────────────────────────────────────────────
// Provides Delta, Gamma, Theta, Vega, IV and trade volume for all strikes
// of a given underlying + expiry pair.
//
// name       : underlying symbol, e.g. "NIFTY", "TCS"
// expirydate : "DDMMMYYYY", e.g. "26JUN2025"   (NOT YYYY-MM-DD)
export interface AngelGreekRecord {
  name:              string;
  expiry:            string;   // echoed back as "DDMMMYYYY"
  strikePrice:       string;   // e.g. "24500.000000"
  optionType:        'CE' | 'PE';
  delta:             string;
  gamma:             string;
  theta:             string;
  vega:              string;
  impliedVolatility: string;   // percentage, e.g. "16.33"
  tradeVolume:       string;
}

export function getOptionGreeks(
  apiKey: string,
  accessToken: string,
  name: string,
  expirydate: string,          // "DDMMMYYYY"
) {
  return callApi<AngelGreekRecord[]>(
    '/rest/secure/angelbroking/marketData/v1/optionGreek',
    'POST', apiKey, accessToken,
    { name, expirydate },
  );
}
