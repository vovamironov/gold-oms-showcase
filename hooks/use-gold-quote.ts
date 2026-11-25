'use client';

import { useEffect, useState } from 'react';
import { effectiveGoldPrices, moscowDayTimestamp, type GoldQuote } from '@/lib/cbr-gold';

function updateQuote(current: GoldQuote, incoming: GoldQuote): GoldQuote {
  const valid = effectiveGoldPrices([[incoming.time, incoming.value]], moscowDayTimestamp()).at(-1);
  if (!valid || valid[0] < current.time || valid[0] === current.time && valid[1] === current.value) return current;
  return { time: valid[0], value: valid[1] };
}

export function useGoldQuote(initialQuote: GoldQuote): GoldQuote {
  const [quote, setQuote] = useState(initialQuote);
  const { time, value } = initialQuote;

  useEffect(() => {
    setQuote(current => updateQuote(current, { time, value }));
  }, [time, value]);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), 12000);
      try {
        const response = await fetch('/api/gold-prices', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { prices?: Array<[number, number]> };
        const latest = effectiveGoldPrices(Array.isArray(data.prices) ? data.prices : [], moscowDayTimestamp()).at(-1);
        if (disposed || !latest) return;
        setQuote(current => updateQuote(current, { time: latest[0], value: latest[1] }));
      } catch { /* Keep the last verified quote and its effective date. */ }
      finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    };
    const resume = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const interval = window.setInterval(resume, 5 * 60 * 1000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timeout);
      window.clearInterval(interval);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return quote;
}
