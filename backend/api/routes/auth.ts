import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getUserByEmail, storeRefreshToken, createUser } from '../lib/db/repositories.js';
import { isDbAvailable } from '../lib/db/client.js';
import { isRedisAvailable } from '../lib/redis-client.js';
import { generateOtp, storeOtp, sendOtp } from '../lib/otp.js';
import { getAuthPayload } from '../lib/auth.js';
import { deleteSession, SESSION_COOKIE } from '../lib/session.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'abhitrade-dev-secret';
const ACCESS_TTL = '15m';
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1000;

function signAccess(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, name, register } = req.body;
    if (!email || !password) { res.status(400).json({ error: 'email and password are required' }); return; }
    if (!(await isDbAvailable())) { res.status(503).json({ error: 'Database unavailable' }); return; }

    if (register) {
      if (!name) { res.status(400).json({ error: 'name is required for registration' }); return; }
      const existing = await getUserByEmail(email);
      if (existing) { res.status(409).json({ error: 'Email already registered' }); return; }
      const hash = await bcrypt.hash(password, 12);
      const user = await createUser({ email, name, password_hash: hash });
      const accessToken = signAccess(user.id, user.email);
      const refreshRaw = crypto.randomBytes(40).toString('hex');
      await storeRefreshToken(user.id, crypto.createHash('sha256').update(refreshRaw).digest('hex'), new Date(Date.now() + REFRESH_TTL));
      res.cookie('tk_refresh', refreshRaw, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: REFRESH_TTL / 1000, path: '/api/auth' });
      res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
      return;
    }

    const user = await getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' }); return;
    }
    const accessToken = signAccess(user.id, user.email);
    const refreshRaw = crypto.randomBytes(40).toString('hex');
    await storeRefreshToken(user.id, crypto.createHash('sha256').update(refreshRaw).digest('hex'), new Date(Date.now() + REFRESH_TTL));
    res.cookie('tk_refresh', refreshRaw, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: REFRESH_TTL / 1000, path: '/api/auth' });
    res.json({ accessToken, user: { id: user.id, email: user.email, name: user.name, kyc_status: user.kyc_status } });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (sessionId) await deleteSession(sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[logout]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response) => {
  const payload = await getAuthPayload(req.headers.cookie);
  if (!payload) { res.status(401).json({ error: 'Not authenticated' }); return; }
  res.json({ user: { id: payload.sub, email: payload.email, name: payload.name, phone: payload.phone } });
});

// GET /api/auth/me/token — issue JWT for strategy-api from session
router.get('/me/token', async (req: Request, res: Response) => {
  const payload = await getAuthPayload(req.headers.cookie);
  if (!payload) { res.status(401).json({ error: 'Not authenticated' }); return; }
  const accessToken = jwt.sign({ sub: payload.sub, email: payload.email }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ accessToken });
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, phone } = req.body;
    if (!name?.trim() || !email?.trim() || !phone?.trim()) { res.status(400).json({ error: 'name, email and phone are required' }); return; }
    const emailLower = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) { res.status(400).json({ error: 'Invalid email address' }); return; }
    const phoneClean = phone.replace(/\D/g, '');
    if (phoneClean.length < 10) { res.status(400).json({ error: 'Invalid mobile number' }); return; }
    if (!(await isDbAvailable())) { res.status(503).json({ error: 'Database unavailable' }); return; }
    if (!(await isRedisAvailable())) { res.status(503).json({ error: 'Service unavailable — Redis offline' }); return; }
    const existing = await getUserByEmail(emailLower);
    if (existing) { res.status(409).json({ error: 'An account with this email already exists.' }); return; }
    await createUser({ email: emailLower, phone: phoneClean, name: name.trim(), password_hash: '' });
    const otp = generateOtp();
    await storeOtp(emailLower, otp);
    const { devOtp } = await sendOtp(emailLower, otp, 'email');
    res.status(201).json({ ok: true, message: `Account created. OTP sent to ${emailLower}`, ...(devOtp ? { devOtp } : {}) });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/send-otp
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;
    const target = email ?? phone;
    if (!target) { res.status(400).json({ error: 'email or phone is required' }); return; }
    const otp = generateOtp();
    await storeOtp(target, otp);
    const { devOtp } = await sendOtp(target, otp, email ? 'email' : 'sms');
    res.json({ ok: true, ...(devOtp ? { devOtp } : {}) });
  } catch (err) {
    console.error('[send-otp]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, phone, otp } = req.body;
    if (!otp) { res.status(400).json({ error: 'otp is required' }); return; }
    const target = email ?? phone;
    if (!target) { res.status(400).json({ error: 'email or phone is required' }); return; }
    const { verifyOtp } = await import('../lib/otp.js');
    const valid = await verifyOtp(target, otp);
    if (!valid) { res.status(401).json({ error: 'Invalid or expired OTP' }); return; }
    res.json({ ok: true });
  } catch (err) {
    console.error('[verify-otp]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  res.status(501).json({ error: 'Refresh token flow not yet implemented in Express backend' });
});

export default router;
