import { getCbrGoldPrices } from '@/lib/cbr-gold-server';

const responseHeaders = { 'Cache-Control': 'no-store' };

export async function GET() {
  const prices = await getCbrGoldPrices();
  return Response.json({ prices }, { status: prices.length ? 200 : 503, headers: responseHeaders });
}
