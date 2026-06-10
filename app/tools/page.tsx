'use client';
import { BarChart2, TrendingUp, PieChart, Calculator, Zap, Bell, BookOpen, FileText, Filter, Activity, Globe, Calendar, AlignLeft, Layers } from 'lucide-react';
import Link from 'next/link';
import { ElementType } from 'react';

const TOOL_GROUPS: { title: string; col: string; tools: { label: string; icon: ElementType; href: string; desc: string }[] }[] = [
  {
    title: 'Trading Tools', col: '41,121,255',
    tools: [
      { label:'Option Chain',      icon:BarChart2,    href:'/markets?tab=option-chain', desc:'Live OI, IV, Greeks' },
      { label:'Strategy Builder',  icon:Layers,       href:'/markets?tab=strategies',   desc:'Build option strategies' },
      { label:'OI Charts',         icon:Activity,     href:'#',                         desc:'Open interest analysis' },
      { label:'IV Chart',          icon:TrendingUp,   href:'#',                         desc:'Implied volatility trends' },
      { label:'Greeks Calculator', icon:Calculator,   href:'/tools/calculators',        desc:'Delta, Gamma, Theta, Vega' },
      { label:'P&L Calculator',    icon:Calculator,   href:'/tools/calculators',        desc:'Strategy P&L scenarios' },
      { label:'Brokerage Calc',    icon:Calculator,   href:'/tools/calculators',        desc:'Calculate trading costs' },
      { label:'Margin Calculator', icon:Calculator,   href:'/tools/calculators',        desc:'F&O margin requirements' },
      { label:'Risk-Reward',       icon:BarChart2,    href:'#',                         desc:'Trade risk analysis' },
      { label:'Payoff Chart',      icon:TrendingUp,   href:'#',                         desc:'Options payoff visualization' },
      { label:'Volatility Surface',icon:Globe,        href:'#',                         desc:'3D IV surface' },
      { label:'Market Depth',      icon:AlignLeft,    href:'#',                         desc:'Level 2 order book' },
    ],
  },
  {
    title: 'Screening & Analysis', col: '0,212,255',
    tools: [
      { label:'Stock Screener',    icon:Filter,       href:'/tools/screener',             desc:'Filter stocks by criteria' },
      { label:'Options Screener',  icon:Filter,       href:'#',                           desc:'Screen option contracts' },
      { label:'Market Heatmap',    icon:PieChart,     href:'/tools/heatmap',              desc:'Visualize market movement' },
      { label:'Sector Heatmap',    icon:PieChart,     href:'/markets?tab=composition',    desc:'Sector performance map' },
      { label:'Technical Signals', icon:Zap,          href:'#',                           desc:'RSI, MACD signals' },
      { label:'Event Calendar',    icon:Calendar,     href:'/tools/calendar',             desc:'Upcoming market events' },
      { label:'Earnings Calendar', icon:Calendar,     href:'/tools/calendar',             desc:'Company results schedule' },
      { label:'FII/DII Flow',      icon:Activity,     href:'#',                           desc:'Institutional activity' },
    ],
  },
  {
    title: 'Trading Utilities', col: '170,0,255',
    tools: [
      { label:'Basket Creator',  icon:Layers,   href:'/tools/basket',     desc:'Multi-leg order baskets' },
      { label:'Alert Manager',   icon:Bell,     href:'/tools/alerts',     desc:'Price & event alerts' },
      { label:'Trade Journal',   icon:BookOpen, href:'/tools/journal',    desc:'Log and review trades' },
      { label:'Export Report',   icon:FileText, href:'#',                 desc:'Download trade reports' },
      { label:'Security Master', icon:FileText, href:'/security-master',  desc:'Upload NSE/BSE files' },
    ],
  },
];

export default function ToolsPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-6">
      <div>
        <h1 className="text-lg font-bold" style={{ color:'var(--text-bright)' }}>Tools</h1>
        <p className="text-xs mt-0.5" style={{ color:'var(--text-label)' }}>Analytics, calculators, screeners, and utilities</p>
      </div>

      {TOOL_GROUPS.map(group => (
        <div key={group.title}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1" style={{ background:`rgba(${group.col},0.2)` }} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest px-2" style={{ color:`rgb(${group.col})` }}>{group.title}</h2>
            <div className="h-px flex-1" style={{ background:`rgba(${group.col},0.2)` }} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2.5">
            {group.tools.map(tool => {
              const Icon = tool.icon;
              return (
                <Link key={tool.label} href={tool.href}>
                  <div className="glass card-hover rounded-xl p-3 h-full cursor-pointer transition-all"
                    style={{ borderColor:`rgba(${group.col},0.15)` }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor=`rgba(${group.col},0.4)`)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor=`rgba(${group.col},0.15)`)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                      style={{ background:`rgba(${group.col},0.12)`, border:`1px solid rgba(${group.col},0.2)` }}>
                      <Icon size={16} style={{ color:`rgb(${group.col})` }} />
                    </div>
                    <div className="text-xs font-bold" style={{ color:'var(--text-secondary)' }}>{tool.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color:'var(--text-label)' }}>{tool.desc}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
