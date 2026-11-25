import { goldPriceHistory } from '@/app/gold-price-history';
import { effectiveGoldPrices, moscowDayTimestamp, parseCbrGoldPrices, type GoldQuote } from './cbr-gold';

// Share the Bank of Russia quotes between server-rendered pages and the chart API.
let cached: { effectiveThrough: number; expires: number; prices: Array<[number, number]> } | null = null;
let inFlight: { effectiveThrough: number; promise: Promise<Array<[number, number]>> } | null = null;
const snapshotGoldPrices = goldPriceHistory.map(([day, value]) => [Date.UTC(2011, 0, 1) + day * 86400000, value] as const);

export async function getCurrentGoldQuote(): Promise<GoldQuote> {
  const prices = await getCbrGoldPrices();
  // Retain the snapshot when the feed is unavailable, and never apply a quote
  // before its effective calendar day in Moscow. Live values override the
  // snapshot for matching dates.
  const latest = effectiveGoldPrices([...snapshotGoldPrices, ...prices], moscowDayTimestamp()).at(-1)!;
  return { time: latest[0], value: latest[1] };
}

export async function getCbrGoldPrices(): Promise<Array<[number, number]>> {
  const now = new Date();
  const effectiveThrough = moscowDayTimestamp(now);
  if (cached && cached.effectiveThrough === effectiveThrough && cached.expires > now.getTime()) {
    return cached.prices;
  }
  if (inFlight?.effectiveThrough === effectiveThrough) return inFlight.promise;

  const request = (async () => {
    const end = new Date(effectiveThrough);
    const snapshotEnd = Date.UTC(2011, 0, 1) + goldPriceHistory.at(-1)![0] * 86400000;
    const start = new Date(Math.min(now.getTime() - 45 * 86400000, snapshotEnd - 7 * 86400000));
    const formatDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
    const url = new URL('https://www.cbr.ru/scripts/xml_metall.asp');
    url.searchParams.set('date_req1', formatDate(start));
    url.searchParams.set('date_req2', formatDate(end));

    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`CBR feed responded ${response.status}`);
      const xml = await response.text();
      const prices = parseCbrGoldPrices(xml, effectiveThrough);
      if (!prices.length) throw new Error('CBR feed contained no gold prices');
      // Invalidate at Moscow midnight even if the five-minute cache is still fresh.
      const nextMoscowMidnight = effectiveThrough + 86400000 - 3 * 60 * 60 * 1000;
      cached = { effectiveThrough, prices, expires: Math.min(Date.now() + 5 * 60 * 1000, nextMoscowMidnight) };
      return prices;
    } catch (error) {
      console.warn('CBR gold-price refresh failed:', error instanceof Error ? error.message : String(error));
      return [];
    }
  })();

  inFlight = { effectiveThrough, promise: request };
  try {
    return await request;
  } finally {
    if (inFlight?.promise === request) inFlight = null;
  }
}
