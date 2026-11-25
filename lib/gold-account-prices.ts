export function getGoldAccountPrices(buyPrice: number): { buy: number; sell: number } {
  return {
    buy: buyPrice,
    sell: Math.round(buyPrice * 95) / 100,
  };
}
