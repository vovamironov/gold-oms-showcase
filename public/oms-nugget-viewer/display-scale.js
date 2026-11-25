export const MIN_DISPLAY_SCALE = .65;
export const MAX_DISPLAY_SCALE = 1.1;
const SPAN = MAX_DISPLAY_SCALE - MIN_DISPLAY_SCALE;

/** Missing overrides retain the original viewer contract for existing pages. */
export function displayScaleOverride(value) {
  if (value == null || typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && value.trim() === '') return null;
  const scale = Number(value);
  return Number.isFinite(scale) ? Math.max(MIN_DISPLAY_SCALE, Math.min(MAX_DISPLAY_SCALE, scale)) : null;
}

export function sizeCoordinateFor(weight, explicitScale = null) {
  const scale = displayScaleOverride(explicitScale);
  if (scale !== null) return 1 + (scale - MIN_DISPLAY_SCALE) / SPAN;
  return 1 + (Math.min(10, Math.max(.1, Number(weight) || .1)) - .1) / 9.9;
}

export function displayScaleForCoordinate(coordinate) {
  return MIN_DISPLAY_SCALE + SPAN * (Math.max(1, Math.min(2, coordinate)) - 1);
}

export function legacyDisplayScale(weight) {
  return displayScaleForCoordinate(sizeCoordinateFor(weight));
}
