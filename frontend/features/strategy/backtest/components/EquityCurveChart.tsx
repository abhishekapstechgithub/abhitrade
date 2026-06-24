'use client';

import dynamic from 'next/dynamic';
import type { ApexOptions } from 'apexcharts';
import type { EquityPoint } from '../types/backtest.types';

// ApexCharts must be lazy-loaded (no SSR)
const ApexChart = dynamic(() => import('react-apexcharts'), {
  ssr:     false,
  loading: () => <ChartSkeleton />,
});

// ─── Chart theme colours (must be hex/rgba — CSS vars don't work in Apex) ────
const GRID_COLOR   = 'rgba(255,255,255,0.06)';
const LABEL_COLOR  = '#4a5568';
const TOOLTIP_BG   = '#081020';
const EQUITY_COLOR = '#2979ff';
const DD_COLOR     = '#ff1744';

// ─── Shared axis / grid options ───────────────────────────────────────────────
const sharedGridOpts: ApexOptions['grid'] = {
  borderColor:    GRID_COLOR,
  strokeDashArray: 3,
  xaxis: { lines: { show: false } },
  yaxis: { lines: { show: true  } },
};

const sharedXAxis = (labels: boolean): ApexOptions['xaxis'] => ({
  type: 'datetime',
  tickAmount: 6,
  labels: {
    show: labels,
    style: { colors: LABEL_COLOR, fontSize: '10px', fontFamily: 'monospace' },
    datetimeFormatter: { month: 'MMM', day: 'dd MMM' },
  },
  axisBorder: { show: false },
  axisTicks:  { show: false },
  crosshairs: { show: true, stroke: { color: EQUITY_COLOR, dashArray: 2, width: 1 } },
});

const sharedTooltip: ApexOptions['tooltip'] = {
  theme: 'dark',
  style: { fontSize: '11px', fontFamily: 'monospace' },
  x: { format: 'dd MMM yyyy' },
  marker: { show: true },
};

// ─── Equity curve chart ───────────────────────────────────────────────────────

function buildEquityOptions(
  data: { x: number; y: number }[],
  markers: { x: number; y: number }[],
): ApexOptions {
  return {
    chart: {
      id:          'equity',
      type:        'area',
      group:       'backtest',
      background:  'transparent',
      toolbar:     { show: false },
      zoom:        { enabled: true, type: 'x', autoScaleYaxis: true },
      animations:  { enabled: true, speed: 600 },
      events:      {},
    },
    colors:    [EQUITY_COLOR],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.28,
        opacityTo:   0.01,
        stops:       [0, 100],
      },
    },
    stroke:   { width: 2, curve: 'smooth', colors: [EQUITY_COLOR] },
    series:   [{ name: 'Equity', data }],
    grid:     sharedGridOpts,
    xaxis:    sharedXAxis(false),
    yaxis: {
      labels: {
        style:     { colors: LABEL_COLOR, fontSize: '10px', fontFamily: 'monospace' },
        formatter: (v: number) => `₹${(v / 1000).toFixed(1)}K`,
      },
      tickAmount: 4,
    },
    markers: {
      size:        markers.length ? 4 : 0,
      colors:      ['#fff'],
      strokeColors: [EQUITY_COLOR],
      strokeWidth:  2,
      discrete: markers.map(m => ({
        seriesIndex:  0,
        dataPointIndex: data.findIndex(d => d.x === m.x),
        fillColor:    '#fff',
        strokeColor:  EQUITY_COLOR,
        size:         4,
      })),
    },
    tooltip: {
      ...sharedTooltip,
      y: { formatter: (v: number) => `₹${v.toLocaleString('en-IN')}` },
    },
    annotations: {
      yaxis: [
        { y: 0, borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, strokeDashArray: 4 },
      ],
    },
    noData: { text: 'No data', style: { color: LABEL_COLOR } },
  };
}

function buildDrawdownOptions(data: { x: number; y: number }[]): ApexOptions {
  return {
    chart: {
      id:         'drawdown',
      type:       'area',
      group:      'backtest',
      background: 'transparent',
      toolbar:    { show: false },
      zoom:       { enabled: true, type: 'x', autoScaleYaxis: true },
      animations: { enabled: true, speed: 600 },
      sparkline:  { enabled: false },
    },
    colors: [DD_COLOR],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo:   0.0,
        stops:       [0, 100],
        colorStops: [
          { offset: 0,   color: DD_COLOR, opacity: 0.3 },
          { offset: 100, color: DD_COLOR, opacity: 0    },
        ],
      },
    },
    stroke: { width: 1.5, curve: 'smooth', colors: [DD_COLOR] },
    series: [{ name: 'Drawdown', data }],
    grid:   sharedGridOpts,
    xaxis:  sharedXAxis(true),
    yaxis: {
      reversed: false,
      labels: {
        style:     { colors: LABEL_COLOR, fontSize: '10px', fontFamily: 'monospace' },
        formatter: (v: number) => v < 0 ? `−₹${(Math.abs(v) / 1000).toFixed(1)}K` : '₹0',
      },
      tickAmount: 3,
      max: 0,
    },
    tooltip: {
      ...sharedTooltip,
      y: {
        formatter: (v: number) =>
          v < 0 ? `−₹${Math.abs(v).toLocaleString('en-IN')}` : '₹0',
      },
    },
    noData: { text: 'No data', style: { color: LABEL_COLOR } },
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  equityCurve: EquityPoint[];
  loading?:    boolean;
}

export function EquityCurveChart({ equityCurve, loading }: Props) {
  if (loading) return <ChartSkeleton />;
  if (!equityCurve.length) return null;

  const equityData  = equityCurve.map(p => ({
    x: new Date(p.date).getTime(),
    y: p.equity,
  }));
  const ddData      = equityCurve.map(p => ({
    x: new Date(p.date).getTime(),
    y: p.drawdown,
  }));
  const tradeMarkers = equityCurve
    .filter(p => p.tradeExit)
    .map(p => ({ x: new Date(p.date).getTime(), y: p.equity }));

  const equityOpts   = buildEquityOptions(equityData, tradeMarkers);
  const drawdownOpts = buildDrawdownOptions(ddData);

  return (
    <div className="flex flex-col" style={{ gap: 0 }}>
      {/* Equity curve */}
      <div style={{ height: 220 }}>
        <ApexChart
          key="equity"
          type="area"
          height="100%"
          options={equityOpts}
          series={[{ name: 'Equity', data: equityData }]}
        />
      </div>

      {/* Divider label */}
      <div
        className="flex items-center gap-2 px-4"
        style={{ borderTop: '1px solid var(--panel-divider)', borderBottom: '1px solid var(--panel-divider)', padding: '2px 16px' }}
      >
        <div className="w-2 h-2 rounded-sm" style={{ background: DD_COLOR }} />
        <span className="text-[10px] uppercase tracking-wide" style={{ color: '#4a5568' }}>
          Drawdown from peak
        </span>
      </div>

      {/* Drawdown chart */}
      <div style={{ height: 100 }}>
        <ApexChart
          key="drawdown"
          type="area"
          height="100%"
          options={drawdownOpts}
          series={[{ name: 'Drawdown', data: ddData }]}
        />
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-1" style={{ height: 330 }}>
      <div className="flex-1 rounded-lg" style={{ background: 'var(--card-inner-bg)' }} />
      <div className="h-5 rounded"       style={{ background: 'var(--card-inner-bg)' }} />
      <div className="rounded-lg" style={{ height: 90, background: 'var(--card-inner-bg)' }} />
    </div>
  );
}
