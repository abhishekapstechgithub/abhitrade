export function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
    if (Math.abs(value) >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
    if (Math.abs(value) >= 1000) return `₹${(value / 1000).toFixed(2)}K`;
    return `₹${value.toFixed(2)}`;
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatChange(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatNumber(Math.abs(value))}`;
}

export function colorClass(value: number): string {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-600';
}

export function bgColorClass(value: number): string {
  if (value > 0) return 'bg-green-50 text-green-700';
  if (value < 0) return 'bg-red-50 text-red-700';
  return 'bg-gray-50 text-gray-700';
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatVolume(value: number): string {
  if (value >= 10_000_000) return `${(value / 10_000_000).toFixed(2)}Cr`;
  if (value >= 100_000) return `${(value / 100_000).toFixed(2)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`;
  return value.toString();
}
