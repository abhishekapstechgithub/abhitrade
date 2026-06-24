import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'theme/app_theme.dart';
import 'providers/app_provider.dart';
import 'screens/main_screen.dart';
// ignore: unused_import
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'widgets/paper_texture.dart';
import 'features/strategy/data/repositories/strategy_repository_impl.dart';
import 'features/strategy/presentation/providers/strategy_provider.dart';

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
        ChangeNotifierProvider(
          create: (_) => StrategyProvider(StrategyRepositoryImpl()),
        ),
      ],
      child: Consumer<ThemeProvider>(
        builder: (_, theme, __) => MaterialApp(
          title: 'AbhiTrade',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: theme.mode,
          home: const SplashScreen(),
          builder: (context, child) {
            final isDark = Theme.of(context).brightness == Brightness.dark;
            final scaled = MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: const TextScaler.linear(0.75),
              ),
              child: child!,
            );
            return isDark ? scaled : PaperBackground(child: scaled);
          },
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
    if (auth.isLoggedIn) return const MainScreen();
    return const LoginScreen();
  }
}
