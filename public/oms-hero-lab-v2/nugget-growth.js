import { MIN_WEIGHT_GRAMS, MAX_WEIGHT_GRAMS, quantizeWeight } from './weight-scale.js';
import { MIN_DISPLAY_SCALE, MAX_DISPLAY_SCALE, legacyDisplayScale } from '../oms-nugget-viewer/display-scale.js';

const ROOT_MIN = Math.cbrt(MIN_WEIGHT_GRAMS);
const ROOT_SPAN = Math.cbrt(MAX_WEIGHT_GRAMS) - ROOT_MIN;

/** Visual growth follows volume rather than the input rail's precision bands. */
export function nuggetProgressForWeight(value) {
  return (Math.cbrt(quantizeWeight(value)) - ROOT_MIN) / ROOT_SPAN;
}

/** All ten accepted shapes participate, starting immediately above the minimum. */
export function nuggetMorphForWeight(value) {
  return 1 + 9 * nuggetProgressForWeight(value);
}

export function nuggetScaleForWeight(value) {
  return MIN_DISPLAY_SCALE + (MAX_DISPLAY_SCALE - MIN_DISPLAY_SCALE) * nuggetProgressForWeight(value);
}

/** Reuse existing renders; their original scale is baked into the pixels. */
export function staticNuggetForWeight(value) {
  const grams = quantizeWeight(value);
  const index = grams === MIN_WEIGHT_GRAMS ? 1 : Math.min(grams === MAX_WEIGHT_GRAMS ? 100 : 99, Math.round(nuggetMorphForWeight(grams) * 10));
  return { index, scale: nuggetScaleForWeight(grams) / legacyDisplayScale(index / 10) };
}
