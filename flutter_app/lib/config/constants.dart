class AppConstants {
  AppConstants._();

  static const apiBase = 'https://abhitrade.com/api';

  // Shared-prefs keys
  static const keyAccessToken  = 'access_token';
  static const keyRefreshToken = 'refresh_token';
  static const keyUserJson     = 'user_json';
  static const keyThemeMode    = 'theme_mode';   // 'dark' | 'light'
  static const keyTradingMode  = 'trading_mode'; // 'live' | 'paper'

  // Paper trading initial balance
  static const paperBalance = 1000000.0; // ₹10 lakh

  // Market mover type keys (match web API ?type= param)
  static const moverGainers        = 'gainers';
  static const moverLosers         = 'losers';
  static const moverVolumeShockers = 'volume_shockers';
  static const moverTopByVolume    = 'top_by_volume';
  static const mover52wHigh        = '52w_high';
  static const mover52wLow         = '52w_low';

  static const allMoverTypes = [
    moverGainers,
    moverLosers,
    moverVolumeShockers,
    moverTopByVolume,
    mover52wHigh,
    mover52wLow,
  ];

  static const moverLabels = {
    moverGainers:        'Gainers',
    moverLosers:         'Losers',
    moverVolumeShockers: 'Vol Shockers',
    moverTopByVolume:    'Top Volume',
    mover52wHigh:        '52W High',
    mover52wLow:         '52W Low',
  };
}
