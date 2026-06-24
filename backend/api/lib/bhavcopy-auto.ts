// Server-side only — Auto-downloads NSE CM bhavcopy daily at 3:45 PM IST.
// Saves CSV to the bhavcopy_data volume at ./Bhavcopy/ then triggers loadBhavcopy().

import fs   from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { redis } from './redis-client';

const BHAVCOPY_DIR = path.join(process.cwd(), 'Bhavcopy');
const DOWNLOAD_KEY = 'at:bhavcopy:autodownload:last'; // Redis key to track last download date

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function istNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function dateStr(d: Date): string {
  // YYYY-MM-DD in IST
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── NSE bhavcopy URLs ──────────────────────────────────────────────────────────
// Old archives (no cookie needed, works most of the time)
function oldNseUrl(d: Date): string {
  const dd  = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const yy  = d.getFullYear();
  return `https://archives.nseindia.com/content/historical/EQUITIES/${yy}/${mon}/cm${dd}${mon}${yy}bhav.csv.zip`;
}

// New NSE archives (requires session cookie)
function newNseUrl(d: Date): string {
  const yy  = d.getFullYear();
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const dd  = String(d.getDate()).padStart(2, '0');
  return `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${yy}${mm}${dd}_F_0000.csv.zip`;
}

const NSE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchZip(url: string, cookies = ''): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': NSE_UA,
        'Accept': 'application/zip, application/octet-stream, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok || res.status !== 200) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return null; // NSE error page
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function getNseCookies(): Promise<string> {
  try {
    const res = await fetch('https://www.nseindia.com', {
      headers: { 'User-Agent': NSE_UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(15_000),
    });
    return res.headers.get('set-cookie')?.split(',')
      .map(c => c.split(';')[0].trim()).join('; ') ?? '';
  } catch {
    return '';
  }
}

async function downloadBhavzip(date: Date): Promise<Buffer | null> {
  // Try old archives first (no auth)
  const buf1 = await fetchZip(oldNseUrl(date));
  if (buf1) {
    console.log('[bhavcopy-auto] Downloaded via old NSE archives');
    return buf1;
  }

  // Try new archives with session cookie
  const cookies = await getNseCookies();
  const buf2    = await fetchZip(newNseUrl(date), cookies);
  if (buf2) {
    console.log('[bhavcopy-auto] Downloaded via new NSE archives');
    return buf2;
  }

  return null;
}

// ── Main download-and-load ─────────────────────────────────────────────────────
export async function downloadAndLoadBhavcopy(forDate?: Date): Promise<void> {
  const date    = forDate ?? istNow();
  const today   = dateStr(date);

  // Skip weekends
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return;

  // Check if already downloaded today
  const last = await redis.get(DOWNLOAD_KEY).catch(() => null);
  if (last === today) {
    console.log('[bhavcopy-auto] Already downloaded for', today);
    return;
  }

  console.log('[bhavcopy-auto] Downloading NSE CM bhavcopy for', today, '...');

  const zipBuf = await downloadBhavzip(date);
  if (!zipBuf) {
    console.warn('[bhavcopy-auto] Download failed — market may not be open today or file not yet available');
    return;
  }

  // Extract CSV from zip
  let csvContent: string;
  try {
    const zip     = new AdmZip(zipBuf);
    const entries = zip.getEntries().filter(e => e.entryName.toLowerCase().endsWith('.csv'));
    if (!entries.length) { console.warn('[bhavcopy-auto] No CSV found in zip'); return; }
    csvContent = zip.readAsText(entries[0]);
  } catch (e) {
    console.error('[bhavcopy-auto] Unzip failed:', (e as Error).message);
    return;
  }

  // Save to Bhavcopy directory (mounted as bhavcopy_data volume)
  if (!fs.existsSync(BHAVCOPY_DIR)) fs.mkdirSync(BHAVCOPY_DIR, { recursive: true });

  const filename = `nse_cm_${today}.csv`;
  const outPath  = path.join(BHAVCOPY_DIR, filename);
  fs.writeFileSync(outPath, csvContent, 'utf8');
  console.log('[bhavcopy-auto] Saved', filename, `(${(csvContent.length / 1024).toFixed(0)} KB)`);

  // Load into security_master
  const { loadBhavcopy } = await import('./bhavcopy');
  const stats = await loadBhavcopy();
  console.log(`[bhavcopy-auto] Loaded — ${stats.totalLoaded} rows updated, ${stats.totalSkipped} skipped`);

  // Record success in Redis
  await redis.setex(DOWNLOAD_KEY, 60 * 60 * 48, today).catch(() => {});

  // Update bhavcopy status key so /api/bhavcopy GET shows it
  const STATUS_KEY = 'at:bhavcopy:last';
  await redis.set(STATUS_KEY, JSON.stringify({ ...stats, loadedAt: new Date().toISOString(), autoDownload: true })).catch(() => {});
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
declare global { var _bhavcopyCronStarted: boolean | undefined; }

export function scheduleBhavcopyCron(): void {
  if (global._bhavcopyCronStarted) return;
  global._bhavcopyCronStarted = true;

  // Check every minute whether it's time to download (3:45-4:30 PM IST, Mon-Fri)
  setInterval(() => {
    const ist = istNow();
    const dow = ist.getDay();
    if (dow === 0 || dow === 6) return; // weekends

    const t = ist.getHours() * 60 + ist.getMinutes();
    if (t >= 15 * 60 + 45 && t <= 16 * 60 + 30) {
      downloadAndLoadBhavcopy(ist).catch(e =>
        console.error('[bhavcopy-auto] Cron error:', e.message)
      );
    }
  }, 60_000); // check every minute

  // Also try once at startup (catches restarts after market close)
  setTimeout(async () => {
    const ist = istNow();
    const dow = ist.getDay();
    if (dow === 0 || dow === 6) return;
    const t = ist.getHours() * 60 + ist.getMinutes();
    if (t >= 15 * 60 + 45) { // past 3:45 PM
      await downloadAndLoadBhavcopy(ist).catch(() => {});
    }
  }, 30_000);

  console.log('[bhavcopy-auto] Scheduler started — will download NSE CM bhavcopy Mon–Fri at 15:45 IST');
}
