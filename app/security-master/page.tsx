'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, File, CheckCircle, XCircle, RefreshCw,
  Database, Clock, AlertCircle, TrendingUp, BarChart2, LineChart,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type FileType = 'NSE_CM' | 'BSE_CM' | 'NSE_FO' | 'BSE_FO';

interface JobStatus {
  jobId: string;
  status: string;
  progress: number;
  filename?: string;
  fileType?: string;
  segment?: string;
  exchange?: string;
  totalRows?: number;
  inserted?: number;
  updated?: number;
  failed?: number;
  loaded?: number;
  durationMs?: number;
  error?: string;
  completedAt?: string;
  createdAt?: string;
  collections?: string; // JSON string
}

// ─── File type config ─────────────────────────────────────────────────────────
const FILE_TYPES: { id: FileType; label: string; exchange: string; segment: string; desc: string; color: string; collections: string[] }[] = [
  {
    id: 'NSE_CM',
    label: 'NSE CM',
    exchange: 'NSE',
    segment: 'CM',
    desc: 'NSE Cash Market — Equity security master',
    color: '#2563eb',
    collections: ['NSE_E_EQUITY'],
  },
  {
    id: 'BSE_CM',
    label: 'BSE CM',
    exchange: 'BSE',
    segment: 'CM',
    desc: 'BSE Cash Market — Equity scrip master',
    color: '#7c3aed',
    collections: ['BSE_E_EQUITY'],
  },
  {
    id: 'NSE_FO',
    label: 'NSE F&O',
    exchange: 'NSE',
    segment: 'FO',
    desc: 'NSE Futures & Options — contract master',
    color: '#059669',
    collections: ['NSE_D_FUTIDX', 'NSE_D_FUTSTK', 'NSE_D_OPTIDX', 'NSE_D_OPTSTK'],
  },
  {
    id: 'BSE_FO',
    label: 'BSE F&O',
    exchange: 'BSE',
    segment: 'FO',
    desc: 'BSE Futures & Options — contract master',
    color: '#dc2626',
    collections: ['BSE_D_FUTIDX', 'BSE_D_FUTSTK', 'BSE_D_OPTIDX', 'BSE_D_OPTSTK'],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBytes(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
  return (n / 1024).toFixed(0) + ' KB';
}
function fmtDur(ms?: number) {
  if (!ms) return '—';
  return ms >= 60000 ? (ms / 60000).toFixed(1) + 'm' : (ms / 1000).toFixed(1) + 's';
}

// ─── Bhavcopy uploader sub-component ─────────────────────────────────────────

interface BhavResult {
  files: number;
  totalLoaded: number;
  totalSkipped: number;
  savedFiles?: string[];
  loadedAt?: string | null;
  results?: Array<{ file: string; loaded: number; skipped: number; errors: string[]; date: string | null }>;
  error?: string;
}

function BhavcopyTab() {
  const [dragging, setDragging]     = useState(false);
  const [files, setFiles]           = useState<File[]>([]);
  const [loading, setLoading]       = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [result, setResult]         = useState<BhavResult | null>(null);
  const [lastLoad, setLastLoad]     = useState<BhavResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch last load status on mount
  useEffect(() => {
    fetch('/api/bhavcopy')
      .then(r => r.ok ? r.json() : null)
      .then((d: BhavResult | null) => { if (d?.loadedAt) setLastLoad(d); })
      .catch(() => {});
  }, []);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const csvs = Array.from(incoming).filter(f => /\.csv$/i.test(f.name));
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...csvs.filter(f => !names.has(f.name))];
    });
    setResult(null);
  }

  async function handleUpload() {
    if (!files.length || loading) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    files.forEach(f => fd.append('file', f));
    try {
      const r = await fetch('/api/bhavcopy/upload', { method: 'POST', body: fd });
      let d: BhavResult;
      try {
        d = await r.json();
      } catch {
        d = { files: 0, totalLoaded: 0, totalSkipped: 0, error: `Server returned non-JSON response (status ${r.status}). Check if you are logged in.` };
      }
      if (!r.ok && !d.error) {
        d = { ...d, error: `Upload failed with status ${r.status}` };
      }
      setResult(d);
      if (!d.error) {
        setLastLoad(d);
        setFiles([]);
      }
    } catch (e) {
      setResult({ files: 0, totalLoaded: 0, totalSkipped: 0, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function handleServerLoad() {
    if (serverLoading) return;
    setServerLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/bhavcopy', { method: 'POST' });
      let d: BhavResult;
      try {
        d = await r.json();
      } catch {
        d = { files: 0, totalLoaded: 0, totalSkipped: 0, error: `Server returned non-JSON (status ${r.status})` };
      }
      setResult(d);
      if (!d.error) setLastLoad({ ...d, loadedAt: new Date().toISOString() });
    } catch (e) {
      setResult({ files: 0, totalLoaded: 0, totalSkipped: 0, error: String(e) });
    } finally {
      setServerLoading(false);
    }
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="space-y-5">

      {/* Last load status */}
      {lastLoad && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={14} className="text-orange-500" />
            <span className="text-sm font-semibold text-gray-900">Last Bhavcopy Load</span>
            {lastLoad.loadedAt && (
              <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                <Clock size={10} />
                {new Date(lastLoad.loadedAt).toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Files Processed', val: lastLoad.files, color: 'text-blue-700' },
              { label: 'Rows Updated',    val: lastLoad.totalLoaded,  color: 'text-green-700 font-bold' },
              { label: 'Rows Skipped',    val: lastLoad.totalSkipped, color: 'text-gray-500' },
            ].map(s => (
              <div key={s.label} className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.val.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {/* Per-file breakdown */}
          {lastLoad.results && lastLoad.results.length > 0 && (
            <div className="mt-3 space-y-1">
              {lastLoad.results.map(r => (
                <div key={r.file} className="flex items-center justify-between text-xs px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <File size={11} className="text-gray-400" />
                    <span className="font-mono text-gray-700 truncate max-w-[260px]">{r.file}</span>
                    {r.date && <span className="text-gray-400">· {r.date}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-green-700 font-semibold">{r.loaded.toLocaleString('en-IN')} updated</span>
                    <span className="text-gray-400">{r.skipped.toLocaleString('en-IN')} skipped</span>
                    {r.errors.length > 0 && <span className="text-red-500">{r.errors.length} err</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
          <span className="text-sm font-semibold text-gray-900">Select Bhavcopy CSV File(s)</span>
        </div>
        <p className="text-xs text-gray-400 ml-8 mb-4">
          NSE/BSE EOD bhavcopy (new format with <code className="bg-gray-100 px-1 rounded">FinInstrmId</code>, or old CM format).
          Matches <code className="bg-gray-100 px-1 rounded">FinInstrmId</code> → <code className="bg-gray-100 px-1 rounded">token</code> in security_master and updates LTP, OHLC, change%.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/40'
          }`}>
          <input ref={inputRef} type="file" accept=".csv" multiple className="hidden"
            onChange={e => addFiles(e.target.files)} />
          <TrendingUp size={28} className={`mx-auto mb-3 ${dragging ? 'text-orange-400' : 'text-gray-300'}`} />
          {files.length > 0 ? (
            <div className="space-y-1">
              {files.map(f => (
                <div key={f.name} className="flex items-center justify-center gap-2">
                  <File size={13} className="text-orange-500" />
                  <span className="text-sm font-semibold text-gray-800">{f.name}</span>
                  <span className="text-xs text-gray-400">{fmtBytes(f.size)}</span>
                </div>
              ))}
              {files.length > 1 && (
                <div className="text-xs text-gray-400 mt-1">
                  {files.length} files · {fmtBytes(totalSize)} total
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600">Drop bhavcopy CSV file(s) here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Supports NSE/BSE new format (FinInstrmId) and old EQ format · .csv</p>
            </>
          )}
        </div>

        {/* Action row */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleUpload}
            disabled={!files.length || loading || serverLoading}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#f97316' }}>
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Loading prices…</>
              : <><Upload size={14} /> Upload &amp; Update Prices</>}
          </button>
          <button
            onClick={handleServerLoad}
            disabled={loading || serverLoading}
            title="Load CSVs already in server's Bhavcopy/ folder"
            className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap">
            {serverLoading
              ? <><RefreshCw size={13} className="animate-spin" /> Loading…</>
              : <><Database size={13} /> Load from Server</>}
          </button>
          {files.length > 0 && (
            <button
              onClick={() => { setFiles([]); setResult(null); }}
              className="px-4 h-10 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-600">
              Clear
            </button>
          )}
        </div>

        {/* Result */}
        {result && !result.error && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-sm font-semibold text-green-700">Prices updated successfully</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Files',         val: result.files,        c: 'text-blue-700' },
                { label: 'Rows Updated',  val: result.totalLoaded,  c: 'text-green-700 font-bold' },
                { label: 'Rows Skipped',  val: result.totalSkipped, c: 'text-gray-500' },
              ].map(s => (
                <div key={s.label} className="p-2 bg-white rounded-lg border border-green-100">
                  <div className={`text-sm font-bold ${s.c}`}>{s.val.toLocaleString('en-IN')}</div>
                  <div className="text-[10px] text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
            {result.results && result.results.map(r => (
              <div key={r.file} className="mt-2 flex items-center justify-between text-xs px-3 py-2 bg-white rounded-lg border border-green-100">
                <span className="font-mono text-gray-700 truncate">{r.file}</span>
                {r.date && <span className="text-gray-400 mx-2">· {r.date}</span>}
                <div className="flex gap-3 shrink-0">
                  <span className="text-green-700 font-semibold">{r.loaded.toLocaleString('en-IN')} updated</span>
                  {r.errors.length > 0 && (
                    <span className="text-red-500" title={r.errors.slice(0,3).join('\n')}>
                      {r.errors.length} errors
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {result?.error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm text-red-700">{result.error}</span>
          </div>
        )}
      </div>

      {/* Format reference */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Supported Bhavcopy Formats</h3>
        <div className="space-y-3 text-xs text-gray-600">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="font-semibold text-blue-800 mb-1">New Format (NSE/BSE · recommended)</div>
            <div className="font-mono text-[10px] text-blue-700 leading-relaxed">
              TradDt, BizDt, Sgmt, Src, FinInstrmTp, <strong>FinInstrmId</strong>, ISIN, TckrSymb, SctySrs,
              XpryDt, FinInstrmNm, <strong>OpnPric, HghPric, LwPric, ClsPric, LastPric, PrvsClsgPric</strong>,
              UndrlygPric, SttlmPric, <strong>OpnIntrst</strong>, ChngInOpnIntrst, <strong>TtlTradgVol</strong>, …
            </div>
            <div className="mt-1 text-blue-600">Matched by: <code className="bg-blue-100 px-1 rounded">FinInstrmId = token</code></div>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
            <div className="font-semibold text-purple-800 mb-1">Old EQ Format (NSE CM legacy)</div>
            <div className="font-mono text-[10px] text-purple-700 leading-relaxed">
              <strong>SYMBOL</strong>, SERIES, <strong>OPEN, HIGH, LOW, CLOSE, LAST, PREVCLOSE, TOTTRDQTY</strong>, TOTTRDVAL, TIMESTAMP, …
            </div>
            <div className="mt-1 text-purple-600">Matched by: <code className="bg-purple-100 px-1 rounded">SYMBOL + SERIES = security_master.symbol + series</code></div>
          </div>
          <div className="text-gray-500 text-[11px] mt-2">
            Calculated fields — <strong>net_change</strong>: LTP − PrevClose &nbsp;·&nbsp; <strong>change_pct</strong>: (net_change ÷ PrevClose) × 100
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Index Bhavcopy Tab ────────────────────────────────────────────────────────

interface IdxResult {
  files: number;
  totalLoaded: number;
  totalSkipped: number;
  savedFiles?: string[];
  loadedAt?: string | null;
  results?: Array<{ file: string; loaded: number; skipped: number; errors: string[]; date: string | null; exchange: string }>;
  error?: string;
}

function IndexBhavcopyTab() {
  const [dragging, setDragging]   = useState(false);
  const [files, setFiles]         = useState<File[]>([]);
  const [loading, setLoading]     = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [result, setResult]       = useState<IdxResult | null>(null);
  const [lastLoad, setLastLoad]   = useState<IdxResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/index-bhavcopy')
      .then(r => r.ok ? r.json() : null)
      .then((d: IdxResult | null) => { if (d?.loadedAt) setLastLoad(d); })
      .catch(() => {});
  }, []);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    const csvs = Array.from(incoming).filter(f => /\.csv$/i.test(f.name));
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...csvs.filter(f => !names.has(f.name))];
    });
    setResult(null);
  }

  async function handleUpload() {
    if (!files.length || loading) return;
    setLoading(true); setResult(null);
    const fd = new FormData();
    files.forEach(f => fd.append('file', f));
    try {
      const r = await fetch('/api/index-bhavcopy/upload', { method: 'POST', body: fd });
      let d: IdxResult;
      try { d = await r.json(); }
      catch { d = { files: 0, totalLoaded: 0, totalSkipped: 0, error: `Server returned non-JSON (status ${r.status})` }; }
      setResult(d);
      if (!d.error) { setLastLoad(d); setFiles([]); }
    } catch (e) {
      setResult({ files: 0, totalLoaded: 0, totalSkipped: 0, error: String(e) });
    } finally { setLoading(false); }
  }

  async function handleServerLoad() {
    if (serverLoading) return;
    setServerLoading(true); setResult(null);
    try {
      const r = await fetch('/api/index-bhavcopy', { method: 'POST' });
      let d: IdxResult;
      try { d = await r.json(); }
      catch { d = { files: 0, totalLoaded: 0, totalSkipped: 0, error: `Server returned non-JSON (status ${r.status})` }; }
      setResult(d);
      if (!d.error) setLastLoad({ ...d, loadedAt: new Date().toISOString() });
    } catch (e) {
      setResult({ files: 0, totalLoaded: 0, totalSkipped: 0, error: String(e) });
    } finally { setServerLoading(false); }
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const anyLoading = loading || serverLoading;

  return (
    <div className="space-y-5">
      {/* Last load status */}
      {lastLoad && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <LineChart size={14} className="text-teal-500" />
            <span className="text-sm font-semibold text-gray-900">Last Index Load</span>
            {lastLoad.loadedAt && (
              <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                <Clock size={10} />
                {new Date(lastLoad.loadedAt).toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Files Processed', val: lastLoad.files, color: 'text-blue-700' },
              { label: 'Rows Inserted/Updated', val: lastLoad.totalLoaded, color: 'text-green-700 font-bold' },
              { label: 'Rows Skipped', val: lastLoad.totalSkipped, color: 'text-gray-500' },
            ].map(s => (
              <div key={s.label} className="p-3 bg-gray-50 rounded-lg border border-gray-100 text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.val.toLocaleString('en-IN')}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          {lastLoad.results && lastLoad.results.length > 0 && (
            <div className="mt-3 space-y-1">
              {lastLoad.results.map(r => (
                <div key={r.file} className="flex items-center justify-between text-xs px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <File size={11} className="text-gray-400" />
                    <span className="font-mono text-gray-700 truncate max-w-[260px]">{r.file}</span>
                    {r.exchange && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-700">{r.exchange}</span>}
                    {r.date && <span className="text-gray-400">· {r.date}</span>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-green-700 font-semibold">{r.loaded.toLocaleString('en-IN')} rows</span>
                    <span className="text-gray-400">{r.skipped.toLocaleString('en-IN')} skipped</span>
                    {r.errors.length > 0 && <span className="text-red-500">{r.errors.length} err</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
          <span className="text-sm font-semibold text-gray-900">Select Index Bhavcopy CSV File(s)</span>
        </div>
        <p className="text-xs text-gray-400 ml-8 mb-4">
          NSE (<code className="bg-gray-100 px-1 rounded">ind_close_all_*.csv</code>) or BSE (<code className="bg-gray-100 px-1 rounded">INDEXSummary_*.csv</code>) index EOD files.
          Stored in <code className="bg-gray-100 px-1 rounded">index_prices</code> table, matched by index name.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50/40'
          }`}>
          <input ref={inputRef} type="file" accept=".csv" multiple className="hidden"
            onChange={e => addFiles(e.target.files)} />
          <LineChart size={28} className={`mx-auto mb-3 ${dragging ? 'text-teal-400' : 'text-gray-300'}`} />
          {files.length > 0 ? (
            <div className="space-y-1">
              {files.map(f => (
                <div key={f.name} className="flex items-center justify-center gap-2">
                  <File size={13} className="text-teal-500" />
                  <span className="text-sm font-semibold text-gray-800">{f.name}</span>
                  <span className="text-xs text-gray-400">{fmtBytes(f.size)}</span>
                </div>
              ))}
              {files.length > 1 && (
                <div className="text-xs text-gray-400 mt-1">{files.length} files · {fmtBytes(totalSize)} total</div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600">Drop index CSV file(s) here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">NSE ind_close_all · BSE INDEXSummary · .csv</p>
            </>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handleUpload}
            disabled={!files.length || anyLoading}
            className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#0d9488' }}>
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Uploading…</>
              : <><Upload size={14} /> Upload &amp; Load Index Prices</>}
          </button>
          <button
            onClick={handleServerLoad}
            disabled={anyLoading}
            title="Load CSVs already in server's index/ folder"
            className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold border border-teal-300 text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap">
            {serverLoading
              ? <><RefreshCw size={13} className="animate-spin" /> Loading…</>
              : <><Database size={13} /> Load from Server</>}
          </button>
          {files.length > 0 && (
            <button
              onClick={() => { setFiles([]); setResult(null); }}
              className="px-4 h-10 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-600">
              Clear
            </button>
          )}
        </div>

        {result && !result.error && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={14} className="text-green-600" />
              <span className="text-sm font-semibold text-green-700">Index prices loaded successfully</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Files',        val: result.files,        c: 'text-blue-700' },
                { label: 'Rows Loaded',  val: result.totalLoaded,  c: 'text-green-700 font-bold' },
                { label: 'Rows Skipped', val: result.totalSkipped, c: 'text-gray-500' },
              ].map(s => (
                <div key={s.label} className="p-2 bg-white rounded-lg border border-green-100">
                  <div className={`text-sm font-bold ${s.c}`}>{s.val.toLocaleString('en-IN')}</div>
                  <div className="text-[10px] text-gray-400">{s.label}</div>
                </div>
              ))}
            </div>
            {result.results && result.results.map(r => (
              <div key={r.file} className="mt-2 flex items-center justify-between text-xs px-3 py-2 bg-white rounded-lg border border-green-100">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-gray-700 truncate">{r.file}</span>
                  {r.exchange && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-100 text-teal-700">{r.exchange}</span>}
                  {r.date && <span className="text-gray-400">· {r.date}</span>}
                </div>
                <div className="flex gap-3 shrink-0">
                  <span className="text-green-700 font-semibold">{r.loaded.toLocaleString('en-IN')} rows</span>
                  {r.errors.length > 0 && (
                    <span className="text-red-500" title={r.errors.slice(0,3).join('\n')}>{r.errors.length} errors</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {result?.error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm text-red-700">{result.error}</span>
          </div>
        )}
      </div>

      {/* Format reference */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Supported Index Bhavcopy Formats</h3>
        <div className="space-y-3 text-xs text-gray-600">
          <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
            <div className="font-semibold text-teal-800 mb-1">NSE — ind_close_all_DDMMYYYY.csv</div>
            <div className="font-mono text-[10px] text-teal-700 leading-relaxed">
              <strong>Index Name</strong>, <strong>Index Date</strong>, Open Index Value, High Index Value,
              Low Index Value, <strong>Closing Index Value</strong>, Points Change, Change(%),
              Volume, Turnover (Rs. Cr.), P/E, P/B, Div Yield
            </div>
            <div className="mt-1 text-teal-600">Date from <code className="bg-teal-100 px-1 rounded">Index Date</code> column · exchange = NSE</div>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <div className="font-semibold text-indigo-800 mb-1">BSE — INDEXSummary_DDMMYYYY.csv</div>
            <div className="font-mono text-[10px] text-indigo-700 leading-relaxed">
              IndexCode, <strong>IndexID</strong>, <strong>IndexName</strong>, PreviousClose,
              <strong>OpenPrice, HighPrice, LowPrice, ClosePrice</strong>, 52weeksHigh, 52weeksLow
            </div>
            <div className="mt-1 text-indigo-600">Date from filename (DDMMYYYY) · exchange = BSE</div>
          </div>
          <div className="text-gray-500 text-[11px] mt-2">
            Stored in: <code className="bg-gray-100 px-1 rounded">index_prices</code> table · upserted by (symbol, price_date)
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SecurityMasterPage() {
  const [activeTab, setActiveTab]     = useState<'security-master' | 'bhavcopy' | 'index'>('security-master');
  const [fileType, setFileType]       = useState<FileType | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [overwrite, setOverwrite]     = useState(false);
  const [dragOver, setDragOver]       = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [activeJob, setActiveJob]     = useState<JobStatus | null>(null);
  const [jobHistory, setJobHistory]   = useState<JobStatus[]>([]);
  const [dbStatus, setDbStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const fileRef  = useRef<HTMLInputElement>(null);
  const pollRef  = useRef<NodeJS.Timeout | null>(null);

  const checkDb = useCallback(async () => {
    try {
      const r = await fetch('/api/health');
      const d = await r.json();
      setDbStatus(d.services?.postgres_live === 'connected' ? 'ok' : 'error');
    } catch { setDbStatus('error'); }
  }, []);

  useEffect(() => {
    checkDb();
    const id = setInterval(checkDb, 20_000);
    return () => clearInterval(id);
  }, [checkDb]);

  // Poll job status
  const startPolling = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/upload/status/${jobId}`);
        if (r.ok) {
          const job: JobStatus = await r.json();
          setActiveJob(job);
          if (job.status === 'done' || job.status === 'error') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setUploading(false);
            setJobHistory(prev => [job, ...prev.filter(j => j.jobId !== job.jobId)].slice(0, 20));
          }
        }
      } catch { /* ignore */ }
    }, 800);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleFile = (file: File) => { setSelectedFile(file); setActiveJob(null); };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !fileType || uploading) return;
    setUploading(true); setActiveJob(null);
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('fileType', fileType);
    fd.append('overwrite', String(overwrite));
    try {
      const r    = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) {
        setActiveJob({ jobId: '', status: 'error', progress: 0, error: data.error });
        setUploading(false);
        return;
      }
      setActiveJob({ jobId: data.jobId, status: 'queued', progress: 0, filename: selectedFile.name, fileType });
      startPolling(data.jobId);
    } catch (e) {
      setActiveJob({ jobId: '', status: 'error', progress: 0, error: String(e) });
      setUploading(false);
    }
  };

  const isDone  = activeJob?.status === 'done';
  const isError = activeJob?.status === 'error';
  const pct     = activeJob?.progress ?? 0;
  const ft      = FILE_TYPES.find(f => f.id === fileType);

  // Parse collections JSON from job
  function parseCollections(job: JobStatus): Record<string, number> {
    try { return job.collections ? JSON.parse(job.collections) : {}; } catch { return {}; }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Data Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">Upload security master files and EOD bhavcopy prices</p>
          </div>
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium border
            ${dbStatus === 'ok' ? 'bg-green-50 border-green-200 text-green-700' :
              dbStatus === 'error' ? 'bg-red-50 border-red-200 text-red-600' :
              'bg-gray-50 border-gray-200 text-gray-500'}`}>
            <Database size={12} />
            {dbStatus === 'ok' ? 'PostgreSQL Connected' : dbStatus === 'error' ? 'PostgreSQL Offline' : 'Checking…'}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white rounded-xl border border-gray-200 shadow-sm w-fit">
          {[
            { id: 'security-master' as const, label: 'Security Master',     icon: <Database    size={13} /> },
            { id: 'bhavcopy'        as const, label: 'Bhavcopy EOD Prices', icon: <TrendingUp  size={13} /> },
            { id: 'index'           as const, label: 'Index Prices',        icon: <LineChart   size={13} /> },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bhavcopy Tab */}
        {activeTab === 'bhavcopy' && <BhavcopyTab />}

        {/* Index Prices Tab */}
        {activeTab === 'index' && <IndexBhavcopyTab />}

        {/* Security Master Tab */}
        {activeTab === 'security-master' && <>

        {/* Step 1 — File Type Selector */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
            <span className="text-sm font-semibold text-gray-900">Select File Type</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {FILE_TYPES.map(ft => (
              <button
                key={ft.id}
                onClick={() => { setFileType(ft.id); setActiveJob(null); }}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  fileType === ft.id
                    ? 'border-current shadow-md'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
                style={fileType === ft.id ? { borderColor: ft.color, background: `${ft.color}0d` } : {}}>
                {/* Exchange badge */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: `${ft.color}20`, color: ft.color }}>
                    {ft.exchange}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ background: ft.segment === 'CM' ? '#dbeafe' : '#dcfce7', color: ft.segment === 'CM' ? '#1d4ed8' : '#15803d' }}>
                    {ft.segment}
                  </span>
                </div>
                <div className="text-base font-bold" style={{ color: ft.color }}>{ft.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">{ft.desc}</div>
                {/* Collections preview */}
                <div className="mt-2 space-y-0.5">
                  {ft.collections.map(c => (
                    <div key={c} className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${ft.color}15`, color: ft.color }}>
                      → {c}
                    </div>
                  ))}
                </div>
                {fileType === ft.id && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle size={14} style={{ color: ft.color }} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2 — File Upload */}
        <div className={`bg-white rounded-xl border shadow-sm p-5 transition-opacity ${!fileType ? 'opacity-50 pointer-events-none' : ''}`}
          style={{ borderColor: fileType && ft ? `${ft.color}40` : '#e5e7eb' }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <span className="text-sm font-semibold text-gray-900">
              Upload {fileType ?? 'File'}
              {fileType && <span className="ml-2 text-xs font-normal text-gray-500">segment will be set to <strong>{ft?.segment}</strong></span>}
            </span>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
            }`}>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Upload size={28} className={`mx-auto mb-3 ${dragOver ? 'text-blue-500' : 'text-gray-300'}`} />
            {selectedFile ? (
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <File size={15} className="text-blue-600" />
                  <span className="text-sm font-semibold text-gray-900">{selectedFile.name}</span>
                </div>
                <div className="text-xs text-gray-400">{fmtBytes(selectedFile.size)}</div>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600">Drop CSV file here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supports .csv · .txt · up to 200 MB</p>
              </>
            )}
          </div>

          {/* Options */}
          <div className="flex items-center gap-6 mt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)}
                className="rounded border-gray-300 text-blue-600" />
              <span className="text-xs text-gray-600">Overwrite existing records (by FinInstrmId)</span>
            </label>
          </div>

          {/* Progress */}
          {(uploading || activeJob) && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600">
                  {activeJob?.status === 'queued'  && 'Queued…'}
                  {activeJob?.status === 'parsing' && 'Parsing CSV…'}
                  {activeJob?.status === 'wiping'  && `Wiping existing data from ${FILE_TYPES.find(f=>f.id===activeJob.fileType)?.collections.join(', ')}…`}
                  {activeJob?.status === 'loading' && `Inserting into MongoDB… ${(activeJob.loaded ?? 0).toLocaleString('en-IN')} / ${(activeJob.totalRows ?? 0).toLocaleString('en-IN')}`}
                  {activeJob?.status === 'done'    && '✓ Done'}
                  {activeJob?.status === 'error'   && '✗ Error'}
                </span>
                <span className="font-mono font-semibold" style={{ color: isError ? '#ef4444' : isDone ? '#16a34a' : '#2563eb' }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: isError ? '#ef4444' : isDone ? '#16a34a' : (ft?.color ?? '#2563eb'),
                  }} />
              </div>
              {activeJob?.fileType && (
                <div className="text-[11px] text-gray-400 flex gap-3">
                  <span>Type: <span className="font-semibold text-gray-700">{activeJob.fileType}</span></span>
                  <span>Segment: <span className="font-semibold text-gray-700">{activeJob.segment}</span></span>
                  {activeJob.totalRows && <span>Rows: <span className="font-semibold text-gray-700">{Number(activeJob.totalRows).toLocaleString('en-IN')}</span></span>}
                </div>
              )}
            </div>
          )}

          {/* Done summary */}
          {isDone && activeJob && (
            <div className="mt-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-green-600" />
                <span className="text-sm font-semibold text-green-700">Import complete</span>
                <span className="ml-auto text-xs text-green-500">{fmtDur(Number(activeJob.durationMs))}</span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                {[
                  { label: 'Wiped',      val: Number((activeJob as JobStatus & {wiped?:number}).wiped ?? 0).toLocaleString('en-IN'), c: 'text-orange-600 font-bold' },
                  { label: 'Total Rows', val: Number(activeJob.totalRows ?? 0).toLocaleString('en-IN'), c: 'text-gray-700' },
                  { label: 'Inserted',   val: Number(activeJob.inserted  ?? 0).toLocaleString('en-IN'), c: 'text-green-700 font-bold' },
                  { label: 'Updated',    val: Number(activeJob.updated   ?? 0).toLocaleString('en-IN'), c: 'text-blue-700' },
                ].map(s => (
                  <div key={s.label} className="p-2 bg-white rounded-lg border border-green-100">
                    <div className={`text-sm font-bold ${s.c}`}>{s.val}</div>
                    <div className="text-[10px] text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Per-collection breakdown */}
              {activeJob.collections && Object.keys(parseCollections(activeJob)).length > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Collections written:</div>
                  {Object.entries(parseCollections(activeJob)).map(([col, cnt]) => (
                    <div key={col} className="flex items-center justify-between text-xs px-2 py-1 bg-white rounded border border-green-100">
                      <span className="font-mono text-gray-700">{col}</span>
                      <span className="font-bold text-green-700">{Number(cnt).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-sm text-red-700">{activeJob?.error ?? 'Upload failed'}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !fileType || uploading}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: ft?.color ?? '#2563eb' }}>
              {uploading
                ? <><RefreshCw size={14} className="animate-spin" /> Processing…</>
                : <><Upload size={14} /> Upload &amp; Import to MongoDB</>}
            </button>
            {selectedFile && (
              <button
                onClick={() => { setSelectedFile(null); setActiveJob(null); }}
                className="px-4 h-10 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-600">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Collection map reference */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Collection Routing</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {['File Type', 'Segment', 'Instrument Type (FinInstrmNm)', 'MongoDB Collection'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  ['NSE_CM', 'CM', 'All (Equity)',   'NSE_E_EQUITY',  '#2563eb'],
                  ['BSE_CM', 'CM', 'All (Equity)',   'BSE_E_EQUITY',  '#7c3aed'],
                  ['NSE_FO', 'FO', 'OPTIDX',         'NSE_D_OPTIDX',  '#059669'],
                  ['NSE_FO', 'FO', 'OPTSTK',         'NSE_D_OPTSTK',  '#059669'],
                  ['NSE_FO', 'FO', 'FUTIDX',         'NSE_D_FUTIDX',  '#059669'],
                  ['NSE_FO', 'FO', 'FUTSTK',         'NSE_D_FUTSTK',  '#059669'],
                  ['BSE_FO', 'FO', 'OPTIDX / IO',    'BSE_D_OPTIDX',  '#dc2626'],
                  ['BSE_FO', 'FO', 'OPTSTK / SO',    'BSE_D_OPTSTK',  '#dc2626'],
                  ['BSE_FO', 'FO', 'FUTIDX / IF',    'BSE_D_FUTIDX',  '#dc2626'],
                  ['BSE_FO', 'FO', 'FUTSTK / SF',    'BSE_D_FUTSTK',  '#dc2626'],
                ].map(([type, seg, instr, col, color]) => (
                  <tr key={`${type}-${col}`}>
                    <td className="py-2 pr-4 font-bold" style={{ color: color as string }}>{type}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${seg === 'CM' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{seg}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-gray-600">{instr}</td>
                    <td className="py-2 font-mono font-semibold text-gray-900">{col}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Job history */}
        {activeTab === 'security-master' && jobHistory.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Upload History</h3>
              <span className="text-xs text-gray-400">{jobHistory.length} job{jobHistory.length !== 1 ? 's' : ''} this session</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['File', 'Type', 'Segment', 'Status', 'Total', 'Inserted', 'Updated', 'Duration', 'Time'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobHistory.map(job => {
                    const jft = FILE_TYPES.find(f => f.id === job.fileType);
                    return (
                      <tr key={job.jobId} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <File size={11} className="text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-800 truncate max-w-[160px]">{job.filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-[11px]" style={{ color: jft?.color }}>{job.fileType}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${job.segment === 'CM' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {job.segment ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {job.status === 'done'  ? <CheckCircle size={11} className="text-green-600" /> :
                             job.status === 'error' ? <XCircle     size={11} className="text-red-500"   /> :
                                                      <RefreshCw   size={11} className="text-blue-500 animate-spin" />}
                            <span className={`font-medium ${job.status === 'done' ? 'text-green-700' : job.status === 'error' ? 'text-red-600' : 'text-blue-600'}`}>
                              {job.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{job.totalRows ? Number(job.totalRows).toLocaleString('en-IN') : '—'}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{job.inserted ? Number(job.inserted).toLocaleString('en-IN') : '—'}</td>
                        <td className="px-4 py-3 text-blue-700">{job.updated ? Number(job.updated).toLocaleString('en-IN') : '—'}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono">{fmtDur(Number(job.durationMs))}</td>
                        <td className="px-4 py-3 text-gray-400 flex items-center gap-1">
                          <Clock size={10} />
                          {job.completedAt ? new Date(job.completedAt).toLocaleTimeString('en-IN') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        </> /* end security-master tab */}

      </div>
    </div>
  );
}
