'use client';

import { useEffect, useState } from 'react';

const fmt = () =>
  new Date().toLocaleTimeString('en-CA', {
    timeZone: 'America/Toronto',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * Live wall clock for the TV display. Renders nothing until mounted so the
 * server and client never disagree; the display's meta-refresh handles the
 * page itself, this keeps the minutes honest in between.
 */
export function Clock({ className }: { className?: string }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    setTime(fmt());
    const t = setInterval(() => setTime(fmt()), 10_000);
    return () => clearInterval(t);
  }, []);

  return <span className={className}>{time ?? ' '}</span>;
}
