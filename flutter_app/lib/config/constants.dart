class AppConstants {
  AppConstants._();

  static const apiBase = 'https://abhitrade.online/api';

  // Shared-prefs keys
  static const keyAccessToken  = 'access_token';
  static const keyRefreshToken = 'refresh_token';
  static const keyUserJson     = 'user_json';
  static const keyThemeMode    = 'theme_mode'; // 'dark' | 'light' | 'system'
  static const keyTradingMode  = 'trading_mode'; // 'live' | 'paper'

  // Paper trading initial balance
  static const paperBalance = 1000000.0; // ₹10 lakh virtual money
}
