/**
 * All model values and displayed weights are grams. Each precision band gets
 * half of the rail, preserving room for 0.1 g choices below the 10 g seam.
 */
export const MIN_WEIGHT_GRAMS = 0.1;
export const MAX_WEIGHT_GRAMS = 1_000;
export const MAX_SLIDER_POSITION = 2_000;
export const WEIGHT_PRESETS = Object.freeze([0.1, 10, 50, 100, 500]);
export const PURCHASE_AMOUNT_PRESETS = Object.freeze([10_000, 50_000, 100_000]);

function clamp(value, min, max) {
  const number = Number(value);
  return Number.isNaN(number) ? min : Math.max(min, Math.min(max, number));
}

/** Round to the precision of the selected band, including both seams. */
export function quantizeWeight(value) {
  const grams = clamp(value, MIN_WEIGHT_GRAMS, MAX_WEIGHT_GRAMS);
  if (grams <= 10) return Math.round(grams * 10) / 10;
  return Math.round(grams);
}

/** Convert grams to the nonlinear native range coordinate, 0–2000. */
export function weightToPosition(value) {
  const grams = quantizeWeight(value);
  if (grams <= 10) return (grams - MIN_WEIGHT_GRAMS) / (10 - MIN_WEIGHT_GRAMS) * 1_000;
  return 1_000 + (grams - 10) / 990 * 1_000;
}

/** Convert a rail coordinate to a supported weight in grams. */
export function positionToWeight(value) {
  const position = clamp(value, 0, MAX_SLIDER_POSITION);
  if (position <= 1_000) return quantizeWeight(MIN_WEIGHT_GRAMS + position / 1_000 * 9.9);
  return quantizeWeight(10 + (position - 1_000) / 1_000 * 990);
}

/** Spread the existing 0.1–10 viewer shapes across the expanded physical rail. */
export function morphWeightForWeight(value) {
  return MIN_WEIGHT_GRAMS + weightToPosition(value) / MAX_SLIDER_POSITION * 9.9;
}

/** Keyboard steps use weights, so arrow keys never get stuck at a seam. */
export function nextWeight(value, direction) {
  const grams = quantizeWeight(value);
  const sign = Math.sign(Number(direction));
  if (sign === 1) {
    if (grams < 10) return quantizeWeight((Math.round(grams * 10) + 1) / 10);
    return quantizeWeight(grams + 1);
  }
  if (sign === -1) {
    if (grams <= 10) return quantizeWeight((Math.round(grams * 10) - 1) / 10);
    return quantizeWeight(grams - 1);
  }
  return grams;
}

/** NumberFlow can keep its numeric value separate from the displayed unit. */
export function displayWeight(value) {
  const grams = quantizeWeight(value);
  return { value: grams, unit: 'г', maximumFractionDigits: grams <= 10 ? 1 : 0 };
}

// Correct binary floating-point noise at decimal half cents before rounding.
function toCents(value) {
  const cents = value * 100;
  return Math.round(cents + Number.EPSILON * Math.abs(cents));
}

// The first 100 choices are 0.1–10 g; the following 990 are 11–1000 g.
function weightAtIndex(index) {
  return index < 100 ? (index + 1) / 10 : index - 89;
}

/**
 * Largest supported weight affordable in rounded kopecks. Below the minimum
 * purchase return 0.1 g; the input UI owns the out-of-range message on blur.
 */
export function weightForBudget(amount, buyPerGram) {
  const price = Number(buyPerGram);
  const budget = Number(amount);
  if (!Number.isFinite(price) || price <= 0 || Number.isNaN(budget) || budget < 0) {
    return MIN_WEIGHT_GRAMS;
  }
  if (budget === Infinity) return MAX_WEIGHT_GRAMS;
  const available = toCents(budget);
  if (toCents(MIN_WEIGHT_GRAMS * price) > available) return MIN_WEIGHT_GRAMS;
  let low = 0;
  let high = 1_089;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (toCents(weightAtIndex(middle) * price) <= available) low = middle;
    else high = middle - 1;
  }
  return weightAtIndex(low);
}
