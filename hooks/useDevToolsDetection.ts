'use client';
import { useEffect, useState, useCallback } from 'react';

// Docked DevTools shrinks innerWidth or innerHeight by >160px.
// Undocked (floating) DevTools cannot be detected reliably.
const THRESHOLD = 160;

function devToolsOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.outerWidth  - window.innerWidth  > THRESHOLD ||
    window.outerHeight - window.innerHeight > THRESHOLD
  );
}

export function useDevToolsDetection() {
  const [isOpen, setIsOpen] = useState(false);

  const check = useCallback(() => setIsOpen(devToolsOpen()), []);

  useEffect(() => {
    check();
    const timer = setInterval(check, 500);
    window.addEventListener('resize', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', check);
    };
  }, [check]);

  return isOpen;
}
