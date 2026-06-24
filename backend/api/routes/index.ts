import type { Express } from 'express';
import authRouter       from './auth.js';
import watchlistsRouter from './watchlists.js';
import ordersRouter     from './orders.js';
import portfolioRouter  from './portfolio.js';
import alertsRouter     from './alerts.js';
import systemRouter     from './system.js';
import angeloneRouter   from './angelone.js';
import optionchainRouter from './optionchain.js';
import quotesRouter     from './quotes.js';
import marketRouter     from './market.js';
import bhavcopyCRouter  from './bhavcopy.js';
import uploadRouter     from './upload.js';
import chartRouter      from './chart.js';

export function registerRoutes(app: Express) {
  // Auth
  app.use('/api/auth',         authRouter);

  // User data (auth-protected CRUD)
  app.use('/api/watchlists',   watchlistsRouter);
  app.use('/api/orders',       ordersRouter);
  app.use('/api',              portfolioRouter);   // /api/positions, /api/holdings
  app.use('/api/alerts',       alertsRouter);

  // Angel One broker integration
  app.use('/api/angel-one',    angeloneRouter);

  // Option chain
  app.use('/api/optionchain',  optionchainRouter);

  // Market data (quotes, search, tokens, scrips, instruments)
  app.use('/api',              quotesRouter);

  // Market streams & movers
  app.use('/api',              marketRouter);

  // Bhavcopy loaders
  app.use('/api',              bhavcopyCRouter);

  // File upload (security master)
  app.use('/api/upload',       uploadRouter);

  // Charts
  app.use('/api',              chartRouter);

  // System (health, redis-stats, etc.)
  app.use('/api',              systemRouter);
}
