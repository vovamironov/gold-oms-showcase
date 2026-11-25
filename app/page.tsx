import { getCurrentGoldQuote } from '@/lib/cbr-gold-server';
import type { AccountOutcome } from './oms/account-flow.js';
import { OmsShowcase } from './showcase';

export const dynamic = 'force-dynamic';

const outcomes = new Set<AccountOutcome>(['opened', 'existing', 'non-client', 'opening-error']);

export default async function ShowcasePage({ searchParams }: {
  searchParams: Promise<{ outcome?: string | string[] }>;
}) {
  const [query, initialGoldQuote] = await Promise.all([searchParams, getCurrentGoldQuote()]);
  const requested = Array.isArray(query.outcome) ? query.outcome[0] : query.outcome;
  const outcome = outcomes.has(requested as AccountOutcome) ? requested as AccountOutcome : 'opened';

  return <OmsShowcase initialGoldQuote={initialGoldQuote} outcome={outcome} />;
}
