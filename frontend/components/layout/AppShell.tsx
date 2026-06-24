'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { OrderPanel } from '@/components/orders/OrderPanel';

// Routes that should render WITHOUT the trading shell (no header, no order panel, no banner)
const AUTH_ROUTES = ['/login'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '?'));

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-3.5rem)]">
        {children}
      </main>
      <GlobalSearch />
      <OrderPanel />
    </>
  );
}
