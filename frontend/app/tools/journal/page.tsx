'use client';
import { useState } from 'react';
import { BookOpen, Plus, Trash2, Tag, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Outcome = 'win' | 'loss' | 'breakeven';
type Setup = 'breakout' | 'reversal' | 'trend' | 'options' | 'earnings' | 'other';

interface TradeNote {
  id: number;
  date: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  outcome: Outcome;
  setup: Setup;
  notes: string;
  tags: string[];
  emotions: string;
}

const MOCK_JOURNAL: TradeNote[] = [
  { id:1, date:'2025-06-08', symbol:'NIFTY',    side:'LONG',  entry:24700, exit:24910, qty:50,  pnl:10500, outcome:'win',       setup:'breakout',  notes:'Clean breakout of 24700 resistance. Held through 1st target, exited before close.', tags:['trend','momentum'], emotions:'Confident' },
  { id:2, date:'2025-06-07', symbol:'RELIANCE', side:'LONG',  entry:2960,  exit:2931,  qty:100, pnl:-2900, outcome:'loss',      setup:'reversal',  notes:'Thought support at 2940 would hold. Stopped out. Should have waited for confirmation.', tags:['mistake','impatient'], emotions:'Frustrated' },
  { id:3, date:'2025-06-06', symbol:'TCS',      side:'SHORT', entry:4200,  exit:4198,  qty:50,  pnl:100,   outcome:'breakeven', setup:'earnings',  notes:'Earnings play — IV crush killed the options premium. Will size down on earnings trades.', tags:['iv-crush','lesson'], emotions:'Neutral' },
  { id:4, date:'2025-06-05', symbol:'HDFCBANK', side:'LONG',  entry:1640,  exit:1685,  qty:200, pnl:9000,  outcome:'win',       setup:'trend',     notes:'Strong uptrend continuation. Added on dip, exited at pre-planned target.', tags:['trend','discipline'], emotions:'Happy' },
  { id:5, date:'2025-06-04', symbol:'INFY',     side:'SHORT', entry:1760,  exit:1740,  qty:150, pnl:3000,  outcome:'win',       setup:'reversal',  notes:'Overbought on RSI, bearish divergence. Quick 20 point move. Scalp trade.', tags:['rsi','scalp'], emotions:'Focused' },
];

const OUTCOME_STYLE: Record<Outcome, { bg: string; color: string; icon: React.ReactNode }> = {
  win:       { bg:'rgba(var(--gain-rgb),0.12)',  color:'var(--accent-green)',  icon:<TrendingUp size={11} /> },
  loss:      { bg:'rgba(var(--loss-rgb),0.12)',  color:'var(--accent-red)',  icon:<TrendingDown size={11} /> },
  breakeven: { bg:'rgba(107,127,163,0.12)',color:'var(--text-dim)',         icon:<Minus size={11} /> },
};

const SETUP_COLORS: Record<Setup, string> = {
  breakout: 'rgba(41,121,255,0.6)',
  reversal: 'rgba(170,0,255,0.6)',
  trend:    'rgba(0,212,255,0.6)',
  options:  'rgba(255,214,0,0.6)',
  earnings: 'rgba(255,107,0,0.6)',
  other:    'rgba(107,127,163,0.6)',
};

export default function JournalPage() {
  const [notes] = useState<TradeNote[]>(MOCK_JOURNAL);
  const [selected, setSelected] = useState<TradeNote | null>(null);
  const [showForm, setShowForm] = useState(false);

  const totalPnl = notes.reduce((s, n) => s + n.pnl, 0);
  const wins  = notes.filter(n => n.outcome === 'win').length;
  const losses= notes.filter(n => n.outcome === 'loss').length;
  const winRate = notes.length > 0 ? ((wins / notes.length) * 100).toFixed(0) : '0';

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Trade Journal</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>Record, review, and learn from every trade</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background:'rgba(41,121,255,0.15)', color:'#2979ff', border:'1px solid rgba(41,121,255,0.35)' }}>
          <Plus size={13} /> Add Entry
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label:'Total P&L',  val: `${totalPnl >= 0 ? '+' : ''}₹${Math.abs(totalPnl).toLocaleString('en-IN')}`, color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
          { label:'Win Rate',   val: `${winRate}%`,      color: 'var(--accent-blue)'  },
          { label:'Wins',       val: String(wins),       color: 'var(--accent-green)' },
          { label:'Losses',     val: String(losses),     color: 'var(--accent-red)'   },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{s.val}</div>
            <div className="text-[10px] mt-0.5" style={{ color:'var(--text-label)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Journal list */}
        <div className="lg:col-span-2 space-y-2">
          {notes.map(note => {
            const os = OUTCOME_STYLE[note.outcome];
            const isSelected = selected?.id === note.id;
            return (
              <div key={note.id} onClick={() => setSelected(isSelected ? null : note)}
                className="glass rounded-xl p-3 cursor-pointer transition-all"
                style={{ borderColor: isSelected ? 'rgba(41,121,255,0.4)' : undefined,
                  background: isSelected ? 'rgba(41,121,255,0.06)' : undefined }}>
                <div className="flex items-start gap-3">
                  {/* Outcome indicator */}
                  <div className="shrink-0 flex flex-col items-center justify-center w-10 h-10 rounded-lg"
                    style={{ background: os.bg, border:`1px solid ${os.color}40` }}>
                    <span style={{ color: os.color }}>{os.icon}</span>
                    <div className="text-[8px] font-bold mt-0.5" style={{ color: os.color }}>
                      {note.outcome.toUpperCase().slice(0, 3)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>{note.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: note.side === 'LONG' ? 'rgba(var(--gain-rgb),0.1)' : 'rgba(var(--loss-rgb),0.1)',
                          color: note.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)',
                          border: `1px solid ${note.side === 'LONG' ? 'rgba(var(--gain-rgb),0.25)' : 'rgba(var(--loss-rgb),0.25)'}` }}>
                        {note.side}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold capitalize"
                        style={{ background:`${SETUP_COLORS[note.setup]}20`, color: SETUP_COLORS[note.setup],
                          border:`1px solid ${SETUP_COLORS[note.setup]}50` }}>
                        {note.setup}
                      </span>
                      <span className="text-[10px] ml-auto font-bold font-mono" style={{ color: os.color }}>
                        {note.pnl >= 0 ? '+' : ''}₹{Math.abs(note.pnl).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-[10px] mt-1 line-clamp-1" style={{ color: 'var(--text-dim)' }}>{note.notes}</div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {note.tags.map(tag => (
                        <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded-full"
                          style={{ background:'rgba(255,255,255,0.05)', color:'var(--text-label)', border:'1px solid var(--panel-divider)' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {/* Expanded detail */}
                {isSelected && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop:'1px solid var(--panel-divider)' }}>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      {[['Entry', `₹${note.entry}`],['Exit', `₹${note.exit}`],['Qty', String(note.qty)],
                        ['Date', note.date],['Emotions', note.emotions],['Setup', note.setup]].map(([k,v]) => (
                        <div key={k}>
                          <span style={{ color:'var(--text-label)' }}>{k}: </span>
                          <span className="font-semibold" style={{ color:'var(--text-secondary)' }}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10px] rounded-lg p-2.5" style={{ background:'rgba(255,255,255,0.03)', color:'var(--text-accent)' }}>
                      {note.notes}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar insights */}
        <div className="space-y-3">
          <div className="glass rounded-xl p-3">
            <div className="text-xs font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>Performance by Setup</div>
            {(Object.keys(SETUP_COLORS) as Setup[]).map(setup => {
              const setupNotes = notes.filter(n => n.setup === setup);
              if (!setupNotes.length) return null;
              const setupPnl = setupNotes.reduce((s, n) => s + n.pnl, 0);
              return (
                <div key={setup} className="flex items-center justify-between py-1.5"
                  style={{ borderBottom: '1px solid var(--row-border)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: SETUP_COLORS[setup] }} />
                    <span className="text-[10px] capitalize" style={{ color: 'var(--text-accent)' }}>{setup}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-label)' }}>({setupNotes.length})</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold"
                    style={{ color: setupPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {setupPnl >= 0 ? '+' : ''}₹{Math.abs(setupPnl).toLocaleString('en-IN')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="glass rounded-xl p-3">
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>Common Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set(notes.flatMap(n => n.tags))).map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background:'rgba(41,121,255,0.1)', color:'#2979ff', border:'1px solid rgba(41,121,255,0.2)' }}>
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
