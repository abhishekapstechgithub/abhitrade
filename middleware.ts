import { NextRequest, NextResponse } from 'next/server';

// Inline the cookie name — do NOT import from @/lib/session here.
// Middleware runs on the Edge runtime; importing session.ts would pull in ioredis
// which uses node: protocol modules that Edge doesn't support.
const SESSION_COOKIE = 'at_sid';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/register',
  '/api/health',
  '/api/search',
  '/api/ws-credentials',
  '/api/market-data',
  '/api/gainers-losers',
  '/api/market-movers',
  '/api/index-prices',
  '/api/bhavcopy',
  '/api/index-bhavcopy',
  '/api/yahoo-chart',
  '/api/chart',
  '/_next',
  '/favicon.ico',
];

// Origins allowed to make cross-origin requests (mobile web preview, emulator, etc.)
const ALLOWED_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006',
  'http://10.0.2.2:8081',
];

function withCors(req: NextRequest, res: NextResponse): NextResponse {
  const origin = req.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Handle CORS preflight for all API routes
  if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const preflight = new NextResponse(null, { status: 204 });
    return withCors(req, preflight);
  }

  // Allow public paths without a session
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return withCors(req, NextResponse.next());
  }

  // Static files / images
  if (pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|ttf|eot|css|js)$/)) {
    return NextResponse.next();
  }

  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return withCors(req, NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
