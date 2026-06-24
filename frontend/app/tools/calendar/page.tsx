'use client';
import { useState } from 'react';
import { Calendar, Clock, AlertCircle, TrendingUp } from 'lucide-react';

type EventType = 'earnings' | 'corporate' | 'economic' | 'expiry';

interface CalEvent {
  id: number;
  date: string;
  symbol?: string;
  title: string;
  type: EventType;
  impact: 'high' | 'medium' | 'low';
  detail: string;
}

const EVENTS: CalEvent[] = [
  { id:1,  date:'2025-06-09', symbol:'RELIANCE',  title:'Q4 Earnings',          type:'earnings',   impact:'high',   detail:'Expected EPS ₹23.4, Revenue ₹2.2L Cr' },
  { id:2,  date:'2025-06-09', symbol:'INFY',       title:'Board Meeting',        type:'corporate',  impact:'medium', detail:'Dividend announcement expected' },
  { id:3,  date:'2025-06-10', symbol:'',           title:'CPI Inflation Data',   type:'economic',   impact:'high',   detail:'May 2025 CPI. Forecast: 4.7%' },
  { id:4,  date:'2025-06-10', symbol:'TCS',        title:'Q4 Earnings',          type:'earnings',   impact:'high',   detail:'Expected EPS ₹28.1, Revenue ₹62K Cr' },
  { id:5,  date:'2025-06-11', symbol:'HDFCBANK',   title:'Q4 Results',           type:'earnings',   impact:'high',   detail:'NII growth 8-10% YoY expected' },
  { id:6,  date:'2025-06-12', symbol:'',           title:'WPI Data',             type:'economic',   impact:'medium', detail:'Wholesale Price Index for May 2025' },
  { id:7,  date:'2025-06-12', symbol:'WIPRO',      title:'AGM',                  type:'corporate',  impact:'low',    detail:'Annual General Meeting' },
  { id:8,  date:'2025-06-13', symbol:'',           title:'RBI Policy Minutes',   type:'economic',   impact:'high',   detail:'Minutes of June 2025 MPC meeting' },
  { id:9,  date:'2025-06-13', symbol:'SUNPHARMA',  title:'Q4 Earnings',          type:'earnings',   impact:'medium', detail:'Expected EPS ₹14.2' },
  { id:10, date:'2025-06-14', symbol:'',           title:'June F&O Expiry',      type:'expiry',     impact:'high',   detail:'Monthly contracts expire. High volatility expected.' },
  { id:11, date:'2025-06-16', symbol:'MARUTI',     title:'Q4 Results',           type:'earnings',   impact:'medium', detail:'Auto sales recovery expected' },
  { id:12, date:'2025-06-17', symbol:'ITC',        title:'Dividend Ex-Date',     type:'corporate',  impact:'medium', detail:'₹7.50/share dividend ex-date' },
  { id:13, date:'2025-06-18', symbol:'',           title:'US Fed Meeting',       type:'economic',   impact:'high',   detail:'FOMC rate decision — rate hold expected' },
  { id:14, date:'2025-06-19', symbol:'ICICIBANK',  title:'Q4 Earnings',          type:'earnings',   impact:'high',   detail:'Credit growth and NPA commentary key' },
  { id:15, date:'2025-06-20', symbol:'BAJAJ-AUTO', title:'Q4 Results',           type:'earnings',   impact:'medium', detail:'Strong two-wheeler domestic demand' },
];

const TYPE_CONFIG: Record<EventType, { label: string; color: string; bg: string }> = {
  earnings:  { label: 'Earnings',  color: 'rgb(41,121,255)',  bg: 'rgba(41,121,255,0.12)'  },
  corporate: { label: 'Corporate', color: 'rgb(0,212,255)',   bg: 'rgba(0,212,255,0.12)'   },
  economic:  { label: 'Economic',  color: 'rgb(255,214,0)',   bg: 'rgba(255,214,0,0.12)'   },
  expiry:    { label: 'Expiry',    color: 'var(--accent-red)',   bg: 'rgba(var(--loss-rgb),0.12)'   },
};

const IMPACT_CONFIG = {
  high:   { color: 'var(--accent-red)',  bg: 'rgba(var(--loss-rgb),0.12)',  label: 'High'   },
  medium: { color: 'rgb(255,214,0)',  bg: 'rgba(255,214,0,0.12)',  label: 'Medium' },
  low:    { color: 'var(--accent-green)',  bg: 'rgba(var(--gain-rgb),0.12)', label: 'Low'    },
};

function groupByDate(events: CalEvent[]) {
  const map: Record<string, CalEvent[]> = {};
  events.forEach(e => {
    if (!map[e.date]) map[e.date] = [];
    map[e.date].push(e);
  });
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
}

function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CalendarPage() {
  const [filter, setFilter] = useState<EventType | 'all'>('all');

  const filtered = filter === 'all' ? EVENTS : EVENTS.filter(e => e.type === filter);
  const grouped = groupByDate(filtered);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Event Calendar</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>Earnings, corporate actions, economic events & F&O expiry</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-label)' }}>
          <Calendar size={12} />
          <span>June 2025</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([['all','All Events','rgba(139,164,204,0.5)'], ['earnings','Earnings','rgba(41,121,255,0.5)'],
           ['corporate','Corporate','rgba(0,212,255,0.5)'], ['economic','Economic','rgba(255,214,0,0.5)'],
           ['expiry','Expiry','rgba(var(--loss-rgb),0.5)']] as const).map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val as typeof filter)}
            className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
            style={filter === val
              ? { background: val === 'all' ? 'rgba(139,164,204,0.15)' : TYPE_CONFIG[val as EventType]?.bg ?? 'rgba(139,164,204,0.15)',
                  color: val === 'all' ? 'var(--text-secondary)' : TYPE_CONFIG[val as EventType]?.color ?? 'var(--text-secondary)',
                  border: `1px solid ${val === 'all' ? 'rgba(139,164,204,0.3)' : TYPE_CONFIG[val as EventType]?.color ?? 'rgba(139,164,204,0.3)'}` }
              : { background: 'var(--card-inner-bg)', color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Events by date */}
      <div className="space-y-4">
        {grouped.map(([date, events]) => (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xs font-bold" style={{ color: 'var(--text-accent)' }}>{fmtDate(date)}</div>
              <div className="flex-1 h-px" style={{ background: 'var(--card-inner-border)' }} />
              <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{events.length} event{events.length > 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {events.map(ev => {
                const tc = TYPE_CONFIG[ev.type];
                const ic = IMPACT_CONFIG[ev.impact];
                return (
                  <div key={ev.id} className="glass rounded-xl px-4 py-3 flex items-start gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer">
                    {/* Type pill */}
                    <div className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide mt-0.5"
                      style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.color}30` }}>
                      {tc.label}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>{ev.title}</span>
                        {ev.symbol && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: 'rgba(41,121,255,0.12)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.25)' }}>
                            {ev.symbol}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-label)' }}>{ev.detail}</div>
                    </div>
                    {/* Impact */}
                    <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
                      style={{ background: ic.bg, color: ic.color, border: `1px solid ${ic.color}40` }}>
                      <AlertCircle size={9} />
                      {ic.label} Impact
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
