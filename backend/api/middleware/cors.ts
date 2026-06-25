import cors from 'cors';

// Origins allowed to send credentialed requests (cookies)
const ALLOWED_ORIGINS = [
  // Production
  'https://abhitrade.com',
  'https://www.abhitrade.com',
  // Local dev
  'http://localhost',        // nginx dev proxy (port 80)
  'http://localhost:3000',   // Next.js direct
  'http://localhost:3001',   // backend direct
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
  'http://10.0.2.2:8081',
  ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
];

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
});
