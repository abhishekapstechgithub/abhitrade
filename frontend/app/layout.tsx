import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { MarketTickerProvider } from '@/components/layout/MarketTickerProvider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ChartNavigator } from '@/components/charts/ChartNavigator';
import { FirstLoginGuide } from '@/components/onboarding/FirstLoginGuide';
import { TokenAutoFetch } from '@/components/auth/TokenAutoFetch';
import Link from 'next/link';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'AbhiTrade — Professional Trading Platform',
  description: 'Professional-grade options & strategy trading for Indian markets',
};

// Hidden prefetch links — pre-warms all page routes in the background so they compile before the user clicks
const PREFETCH_ROUTES = ['/strategy','/strategy/builder','/strategy/backtest','/watchlist','/portfolio','/orders','/positions','/tools','/profile','/security-master'];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inline script to set data-theme before first paint — prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `
  try {
    var t = localStorage.getItem('at-theme') || 'light';
    var resolved = t === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
    document.documentElement.setAttribute('data-theme', resolved);
    var f = localStorage.getItem('at-fontsize') || 'normal';
    document.documentElement.setAttribute('data-font-size', f);
  } catch(e) {}
` }} />
      </head>
      <body className={`${inter.variable} font-sans min-h-screen antialiased grid-bg hero-glow`}
        style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
        <ThemeProvider>
          <MarketTickerProvider>
            {/* Invisible prefetch links — pre-warms all page routes */}
            <div style={{ position:'absolute', width:0, height:0, overflow:'hidden', pointerEvents:'none' }} aria-hidden>
              {PREFETCH_ROUTES.map(r => <Link key={r} href={r} prefetch={true}>{r}</Link>)}
            </div>
            <TokenAutoFetch />
            <AppShell>{children}</AppShell>
            <ChartNavigator />
            <FirstLoginGuide />
          </MarketTickerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
