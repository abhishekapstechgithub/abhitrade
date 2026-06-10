'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, File, CheckCircle, XCircle, RefreshCw, Database, Search } from 'lucide-react';
import { cn } from '@/lib/utils/format';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const COLUMN_MAPPINGS = [
  'Symbol', 'Instrument Token', 'Exchange Token', 'Expiry', 'Strike',
  'Option Type', 'Lot Size', 'Tick Size', 'Segment', 'Trading Symbol',
  'Underlying', 'ISIN', 'Series', 'Freeze Qty', 'Instrument Type',
];

interface JobStatus {
  jobId: string;
  status: string;
  progress: number;
  filename?: string;
  format?: string;
  exchange?: string;
  totalRows?: number;
  valid?: number;
  invalid?: number;
  loaded?: number;
  durationMs?: number;
  error?: string;
  completedAt?: string;
  createdAt?: string;
}

interface RedisStats {
  totalEntries: number;
  nseEntries: number;
  bseEntries: number;
  available: boolean;
}

interface SearchResult {
  token: string;
  exchange: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  instrumentType: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
}

export default function SecurityMasterPage() {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const [jobHistory, setJobHistory] = useState<JobStatus[]>([]);
  const [redisStats, setRedisStats] = useState<RedisStats | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<{ deleted: number; message: string } | null>(null);
  const [testResults, setTestResults] = useState<SearchResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Load Redis stats on mount and periodically
  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/redis-stats');
      if (r.ok) setRedisStats(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 15000);
    return () => clearInterval(id);
  }, [fetchStats]);

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
            setJobHistory(prev => [job, ...prev.filter(j => j.jobId !== job.jobId)]);
            fetchStats();
          }
        }
      } catch { /* ignore */ }
    }, 1000);
  }, [fetchStats]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleFile = (file: File) => {
    setSelectedFile(file);
    setActiveJob(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setActiveJob(null);

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('overwrite', String(overwrite));

    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) {
        setActiveJob({ jobId: '', status: 'error', progress: 0, error: data.error });
        setUploading(false);
        return;
      }
      setActiveJob({ jobId: data.jobId, status: 'queued', progress: 0, filename: selectedFile.name });
      startPolling(data.jobId);
    } catch (e) {
      setActiveJob({ jobId: '', status: 'error', progress: 0, error: String(e) });
      setUploading(false);
    }
  };

  // Live search test
  useEffect(() => {
    if (!testQuery || testQuery.length < 2) { setTestResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(testQuery)}&limit=8`);
        if (r.ok) {
          const data = await r.json();
          setTestResults(data.results ?? []);
        }
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(timer);
  }, [testQuery]);

  const handleClearRedis = async () => {
    if (!confirm('This will delete all instrument data from Redis (tk:* keys). The data in PostgreSQL is NOT affected. Continue?')) return;
    setClearing(true);
    setClearResult(null);
    try {
      const r = await fetch('/api/redis-clear', { method: 'DELETE' });
      const data = await r.json();
      if (r.ok) {
        setClearResult({ deleted: data.deleted, message: data.message });
        fetchStats();
      } else {
        alert(data.error ?? 'Failed to clear Redis');
      }
    } catch (e) {
      alert('Request failed');
    } finally {
      setClearing(false);
    }
  };

  const progressPct = activeJob?.progress ?? 0;
  const isDone = activeJob?.status === 'done';
  const isError = activeJob?.status === 'error';

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Security Master Upload</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload NSE/BSE security master CSV files to load contracts into Redis</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 border rounded-lg',
            redisStats?.available ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
          )}>
            <Database size={13} className={redisStats?.available ? 'text-green-600' : 'text-red-500'} />
            <span className={cn('font-medium', redisStats?.available ? 'text-green-700' : 'text-red-600')}>
              {redisStats?.available ? 'Redis: Connected' : 'Redis: Offline'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Upload panel */}
        <div className="xl:col-span-2 space-y-4">
          <Card>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Upload File</h2>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
              )}>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              <Upload size={32} className={cn('mx-auto mb-3', dragOver ? 'text-blue-600' : 'text-gray-400')} />
              {selectedFile ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <File size={16} className="text-blue-600" />
                    <span className="text-sm font-semibold text-gray-900">{selectedFile.name}</span>
                  </div>
                  <div className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-700 font-medium">Drop file here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">Supports .csv, .txt up to 100 MB</p>
                  <p className="text-xs text-gray-400">NSE_CM / NSE_FO / BSE_EQD / BSE_EQ formats auto-detected</p>
                </>
              )}
            </div>

            {/* Options row */}
            <div className="flex items-center gap-4 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600" />
                <span className="text-xs text-gray-600">Overwrite existing records</span>
              </label>
            </div>

            {/* Progress bar */}
            {(uploading || activeJob) && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    {activeJob?.status === 'queued' && 'Queued...'}
                    {activeJob?.status === 'parsing' && 'Parsing CSV...'}
                    {activeJob?.status === 'loading' && `Loading into Redis... ${activeJob.loaded?.toLocaleString('en-IN') ?? 0} / ${activeJob.valid?.toLocaleString('en-IN') ?? '?'}`}
                    {activeJob?.status === 'done' && 'Complete!'}
                    {activeJob?.status === 'error' && 'Error'}
                  </span>
                  <span>{progressPct.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-300',
                      isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-600')}
                    style={{ width: `${progressPct}%` }} />
                </div>
                {activeJob?.format && (
                  <div className="text-xs text-gray-400">
                    Format: <span className="font-medium text-gray-600">{activeJob.format}</span>
                    {activeJob.exchange && <> · Exchange: <span className="font-medium text-gray-600">{activeJob.exchange}</span></>}
                    {activeJob.totalRows && <> · {activeJob.totalRows.toLocaleString('en-IN')} rows</>}
                  </div>
                )}
              </div>
            )}

            {isDone && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm font-semibold text-green-700">Loaded into Redis successfully</span>
                </div>
                {activeJob && (
                  <div className="text-xs text-green-600 space-x-3 ml-5">
                    <span>✓ {activeJob.valid?.toLocaleString('en-IN')} valid</span>
                    <span>✗ {activeJob.invalid} invalid</span>
                    <span>⏱ {activeJob.durationMs ? (activeJob.durationMs / 1000).toFixed(1) + 's' : ''}</span>
                  </div>
                )}
              </div>
            )}

            {isError && (
              <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <span className="text-sm text-red-700">{activeJob?.error ?? 'Upload failed'}</span>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button variant="primary" onClick={handleUpload} disabled={!selectedFile || uploading} className="flex-1">
                {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
                {uploading ? 'Processing...' : 'Upload & Import'}
              </Button>
              {selectedFile && (
                <Button variant="outline" onClick={() => { setSelectedFile(null); setActiveJob(null); }}>
                  Clear
                </Button>
              )}
            </div>
          </Card>

          {/* Column mapping */}
          <Card>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Supported Column Mapping</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {COLUMN_MAPPINGS.map((col) => (
                <div key={col} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg">
                  <div className="w-2 h-2 bg-blue-400 rounded-full shrink-0" />
                  <span className="text-xs font-medium text-gray-700">{col}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">Auto-detected from abbreviated NSE/BSE column headers (FinInstrmId, TckrSymb, XpryDt, StrkPric…)</p>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Redis stats */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Redis Index Stats</h3>
            <div className="space-y-3">
              {[
                { label: 'Autocomplete Entries', value: redisStats?.totalEntries.toLocaleString('en-IN') ?? '—' },
                { label: 'NSE Entries', value: redisStats?.nseEntries.toLocaleString('en-IN') ?? '—' },
                { label: 'BSE Entries', value: redisStats?.bseEntries.toLocaleString('en-IN') ?? '—' },
                { label: 'Redis Status', value: redisStats?.available ? 'Online ✓' : 'Offline ✗' },
              ].map((stat) => (
                <div key={stat.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-xs text-gray-500">{stat.label}</span>
                  <span className="text-xs font-semibold text-gray-900">{stat.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={fetchStats} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <RefreshCw size={11} /> Refresh
              </button>
              <button
                onClick={handleClearRedis}
                disabled={clearing || !redisStats?.available}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed ml-auto"
              >
                <XCircle size={11} /> {clearing ? 'Clearing…' : 'Clear Redis'}
              </button>
            </div>
            {clearResult && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700 font-medium">{clearResult.message}</p>
              </div>
            )}
          </Card>

          {/* Live search test */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Live Search Test</h3>
            <div className="relative mb-3">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={testQuery}
                onChange={e => setTestQuery(e.target.value)}
                placeholder="Type RELIANCE, NIFTY..."
                className="w-full h-8 pl-8 pr-3 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {testResults.length === 0 && testQuery.length >= 2 && (
                <p className="text-xs text-gray-400 text-center py-3">No results found</p>
              )}
              {testResults.map((r) => (
                <div key={`${r.exchange}:${r.token}`} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md hover:bg-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{r.tradingSymbol}</div>
                    <div className="text-xs text-gray-400 truncate">{r.name}</div>
                  </div>
                  <div className="shrink-0 flex gap-1">
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">{r.exchange}</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium',
                      r.instrumentType === 'EQ' ? 'bg-gray-100 text-gray-600' :
                      r.instrumentType === 'CE' ? 'bg-green-100 text-green-700' :
                      r.instrumentType === 'PE' ? 'bg-red-100 text-red-700' :
                      'bg-orange-100 text-orange-700'
                    )}>{r.instrumentType}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Bulk load hint */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">CLI Bulk Load</h3>
            <p className="text-xs text-gray-500 mb-2">Pre-load all 4 CSV files without the UI:</p>
            <pre className="text-xs bg-gray-900 text-green-400 p-2.5 rounded-lg overflow-x-auto">
{`node scripts/bulk-load.mjs`}
            </pre>
            <p className="text-xs text-gray-400 mt-2">Edit file paths at the top of <code className="font-mono bg-gray-100 px-1 rounded">scripts/bulk-load.mjs</code></p>
          </Card>
        </div>
      </div>

      {/* Job history */}
      {jobHistory.length > 0 && (
        <Card padding="none">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Upload History (this session)</h2>
            <Badge variant="neutral" size="sm">{jobHistory.length} job{jobHistory.length !== 1 ? 's' : ''}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Job ID', 'File', 'Format', 'Status', 'Total', 'Valid', 'Invalid', 'Duration', 'Completed'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobHistory.map((job) => (
                  <tr key={job.jobId} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 font-mono text-gray-400 text-xs">{job.jobId.slice(0, 8)}…</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <File size={12} className="text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-900 truncate max-w-40">{job.filename}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3"><Badge variant="info" size="sm">{job.format ?? '—'}</Badge></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {job.status === 'done' ? <CheckCircle size={12} className="text-green-600" /> :
                          job.status === 'error' ? <XCircle size={12} className="text-red-600" /> :
                            <RefreshCw size={12} className="text-blue-600 animate-spin" />}
                        <Badge variant={job.status === 'done' ? 'success' : job.status === 'error' ? 'danger' : 'info'} size="sm">
                          {job.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{job.totalRows?.toLocaleString('en-IN') ?? '—'}</td>
                    <td className="px-3 py-3 text-green-700 font-semibold">{job.valid?.toLocaleString('en-IN') ?? '—'}</td>
                    <td className="px-3 py-3 text-red-600">{job.invalid ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{job.durationMs ? (job.durationMs / 1000).toFixed(1) + 's' : '—'}</td>
                    <td className="px-3 py-3 text-gray-400">{job.completedAt ? new Date(job.completedAt).toLocaleTimeString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
