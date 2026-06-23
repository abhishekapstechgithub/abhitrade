class AppConstants {
  AppConstants._();

  static const apiBase = 'https://abhitrade.com';

  // Shared-prefs keys
  static const keyAccessToken  = 'access_token';
  static const keyRefreshToken = 'refresh_token';
  static const keyUserJson     = 'user_json';
  static const keyThemeMode    = 'theme_mode'; // 'dark' | 'light' | 'system'
  static const keyTradingMode  = 'trading_mode'; // 'live' | 'paper'

  // Paper trading initial balance
  static const paperBalance = 1000000.0; // ₹10 lakh virtual money

  // Religare chart base URL
  static const religareChartBase =
      'https://leap.religareonline.com/TV/index.html';
  static const religareApiKey = '0HVTVTkNzEg7Dwjd80T0bXbO8t8FThd';
}

/// Maps exchange/segment name → Religare mktsegid.
/// Segment IDs per Religare Price Feed API docs:
///  1=NSE Cash, 2=NSE F&O, 3=BSE Cash, 4=BSE F&O,
///  5=MCX Futures, 6=MCX Spot, 7=NCDEX Futures, 8=NCDEX Spot,
///  11=MSE Currency Futures, 13=NSE Currency (CDS), 14=NSE Currency Spot
int mktsegIdForExchange(String exchange) {
  switch (exchange.toUpperCase()) {
    case 'NSE':    return 1;
    case 'NFO':    return 2;  // NSE F&O
    case 'BSE':    return 3;  // BSE Cash
    case 'BFO':    return 4;  // BSE F&O
    case 'MCX':    return 5;  // MCX Futures
    case 'MCXSX':  return 6;  // MCX Spot
    case 'NCDEX':  return 7;  // NCDEX Futures
    case 'MSE':    return 11; // MSE Currency Futures
    case 'CDS':    return 13; // NSE Currency Derivatives
    case 'CDSSPOT':return 14; // NSE Currency Spot
    default:       return 1;  // fallback: NSE Cash
  }
}

// Instrument tokens for NSE Cash (mktsegid=1) used by the Religare chart
const kNseTokens = <String, String>{
  // Indices — NSE (mktsegid=1)
  'NIFTY 50':   '26000', 'NIFTY':       '26000',
  'BANKNIFTY':  '26009', 'BANK NIFTY':  '26009',
  'FINNIFTY':   '26025',
  // BSE indices (SENSEX, BANKEX) — token not in public Religare docs; user searches via lookup=y
  // NIFTY 50 constituents
  'RELIANCE':   '2885',  'TCS':         '11536',
  'HDFCBANK':   '1333',  'ICICIBANK':   '4963',
  'INFY':       '1594',  'HINDUNILVR':  '1394',
  'ITC':        '1660',  'SBIN':        '3045',
  'BHARTIARTL': '10604', 'KOTAKBANK':   '1922',
  'LT':         '11483', 'AXISBANK':    '5900',
  'BAJFINANCE': '317',   'ASIANPAINT':  '236',
  'TITAN':      '3506',  'MARUTI':      '10999',
  'SUNPHARMA':  '3351',  'TATAMOTORS':  '3456',
  'WIPRO':      '3787',  'HCLTECH':     '7229',
  'ULTRACEMCO': '2963',  'M&M':         '2031',
  'ONGC':       '2475',  'POWERGRID':   '14977',
  'NTPC':       '11630', 'JSWSTEEL':    '11723',
  'TATASTEEL':  '3499',  'ADANIENT':    '25',
  'ADANIPORTS': '15083', 'BAJAJ-AUTO':  '16669',
  'DRREDDY':    '881',   'CIPLA':       '694',
  'COALINDIA':  '20374', 'EICHERMOT':   '910',
  'NESTLEIND':  '17963', 'GRASIM':      '1232',
  'HINDALCO':   '1363',  'TECHM':       '13538',
  'DIVISLAB':   '10940', 'BPCL':        '526',
  'BRITANNIA':  '547',   'HEROMOTOCO':  '1348',
  'INDUSINDBK': '5258',  'APOLLOHOSP':  '157',
  'TATACONSUM': '3432',  'BAJAJFINSV':  '16675',
  'SBILIFE':    '21808', 'HDFCLIFE':    '119',
  'VEDL':       '3063',  'LTIM':        '17818',
  // Other popular stocks
  'ZOMATO':     '2123553', 'NYKAA':     '2855383',
  'PAYTM':      '2150101', 'IRFC':      '4338',
  'RVNL':       '532155',  'HAL':       '541154',
  'BEL':        '503169',  'IRCTC':     '543228',
  'CDSL':       '543208',  'DMART':     '541112',
  'PIDILITIND': '2255',    'MUTHOOTFIN':'533398',
  'CHOLAFIN':   '1591',    'RECLTD':    '532955',
  'PFC':        '532810',  'TATACHEM':  '3426',
  'AMBUJACEM':  '1270',    'TATAPOWER': '3426',
  'CONCOR':     '730',     'NAVINFLUOR':'2954',
};

// BSE indices that use JS auto-search instead of a token.
// Value = the exact search term to type into the Religare chart search box.
const kBseIndexSearch = <String, String>{
  'SENSEX': 'SENSEX BSE EQ',
  'BANKEX': 'BANKEX BSE EQ',
};
