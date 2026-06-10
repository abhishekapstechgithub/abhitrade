import { cn } from '@/lib/utils/format';
import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const V: Record<string, string> = {
  primary:   'text-white',
  secondary: 'text-[#8fa4cc]',
  danger:    'text-white',
  success:   'text-white',
  ghost:     'text-[#8fa4cc]',
  outline:   'text-[#8fa4cc]',
};

const BG: Record<string, React.CSSProperties> = {
  primary:   { background: 'linear-gradient(135deg,#2979ff,#00d4ff)', boxShadow: '0 2px 12px rgba(41,121,255,0.35)' },
  secondary: { background: 'var(--card-inner-border)', border: '1px solid rgba(255,255,255,0.1)' },
  danger:    { background: 'rgba(var(--loss-rgb),0.15)', border: '1px solid rgba(var(--loss-rgb),0.3)', color: '#ff5577' },
  success:   { background: 'rgba(var(--gain-rgb),0.12)', border: '1px solid rgba(var(--gain-rgb),0.3)', color: 'var(--accent-green)' },
  ghost:     { background: 'transparent' },
  outline:   { background: 'transparent', border: '1px solid var(--border-med)' },
};

const S: Record<string, string> = {
  xs: 'px-2 py-1 text-[10px]',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs',
  lg: 'px-5 py-2.5 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className, children, style, ...props }: ButtonProps) {
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-opacity hover:opacity-85 disabled:opacity-40', V[variant], S[size], className)}
      style={{ ...BG[variant], ...style }}
      {...props}>
      {children}
    </button>
  );
}
