// Next.js instrumentation hook — runs once on server process startup.
// Schedules all background jobs: market sync, movers, live WS feed, bhavcopy auto-download.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. AngelOne REST quote sync (full every 4h, index prices every 60s)
    const { scheduleMarketSync } = await import('./lib/market-sync');
    scheduleMarketSync();

    // 2. Groww top movers sync (every 60s during market hours)
    const { scheduleMoversSync } = await import('./lib/groww-movers');
    scheduleMoversSync();

    // 3. AngelOne SmartStream WebSocket live feed (Mon-Fri 09:00-15:35 IST)
    //    Starts 20s after startup so market-sync has time to log in and cache feedToken
    const { scheduleWsLive } = await import('./lib/angelone/ws-live');
    scheduleWsLive();

    // 4. NSE CM bhavcopy auto-download (Mon-Fri at 15:45 IST)
    const { scheduleBhavcopyCron } = await import('./lib/bhavcopy-auto');
    scheduleBhavcopyCron();
  }
}
