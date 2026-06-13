// Next.js instrumentation hook — runs once on server process startup.
// Schedules the AngelOne market data sync (initial + every 4 h).
// Also schedules the Groww top movers sync every 60s during market hours.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleMarketSync } = await import('./lib/market-sync');
    scheduleMarketSync();

    const { scheduleMoversSync } = await import('./lib/groww-movers');
    scheduleMoversSync();
  }
}
