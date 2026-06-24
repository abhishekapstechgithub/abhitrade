import { cn } from '@/lib/utils/format';

interface CardProps { children: React.ReactNode; className?: string; padding?: 'none' | 'sm' | 'md' | 'lg'; }

export function Card({ children, className, padding = 'md' }: CardProps) {
  const p = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' };
  return (
    <div className={cn('glass rounded-xl', p[padding], className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between mb-3', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-sm font-semibold', className)} style={{ color: 'var(--text-secondary)' }}>{children}</h3>;
}
