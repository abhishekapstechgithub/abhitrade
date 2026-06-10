import { cn } from '@/lib/utils/format';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

const V: Record<string, { bg: string; color: string; border: string }> = {
  default: { bg:'rgba(41,121,255,0.12)',       color:'var(--accent-blue)',   border:'rgba(41,121,255,0.25)' },
  success: { bg:'rgba(var(--gain-rgb),0.12)',  color:'var(--accent-green)',  border:'rgba(var(--gain-rgb),0.25)' },
  danger:  { bg:'rgba(var(--loss-rgb),0.12)',  color:'var(--accent-red)',    border:'rgba(var(--loss-rgb),0.25)' },
  warning: { bg:'rgba(255,214,0,0.12)',        color:'#b45309',              border:'rgba(255,214,0,0.25)' },
  info:    { bg:'rgba(0,212,255,0.12)',        color:'var(--accent-cyan)',   border:'rgba(0,212,255,0.25)' },
  neutral: { bg:'rgba(139,164,204,0.12)',      color:'var(--text-dim)',      border:'rgba(139,164,204,0.25)' },
};

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  const { bg, color, border } = V[variant] ?? V.default;
  return (
    <span className={cn('inline-flex items-center font-semibold rounded-full', size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs', className)}
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}
