import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'theme/app_theme.dart';
import 'providers/app_provider.dart';
import 'screens/main_screen.dart';
// ignore: unused_import
import 'screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
  ));
  runApp(const AbhiTradeApp());
}

class AbhiTradeApp extends StatelessWidget {
  const AbhiTradeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ThemeProvider()..init()),
        ChangeNotifierProvider(create: (_) => AuthProvider()..init()),
        ChangeNotifierProvider(create: (_) => TradingModeProvider()..init()),
        ChangeNotifierProvider(create: (_) => MarketProvider()),
        ChangeNotifierProvider(create: (_) => PortfolioProvider()),
        ChangeNotifierProvider(create: (_) => WatchlistProvider()),
        ChangeNotifierProvider(create: (_) => OrdersProvider()),
      ],
      child: Consumer<ThemeProvider>(
        builder: (_, theme, __) => MaterialApp(
          title: 'AbhiTrade',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: theme.mode,
          home: const _RootGuard(),
        ),
      ),
    );
  }
}

class _RootGuard extends StatelessWidget {
  const _RootGuard();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    // Show main app if logged in, otherwise login screen
    if (auth.isLoggedIn) return const MainScreen();
    // Guest mode: show main app with paper trading by default
    // Comment this line out and uncomment next to force login
    return const MainScreen();
    // return const LoginScreen();
  }
}
