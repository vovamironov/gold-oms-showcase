// Compensate CSS enlargement without changing the camera, pose or morph.
export function nuggetPixelRatio(width, height, dpr, inspectionScale = 1, maxSide = 8192) {
  const base = Math.min(Math.max(1, dpr || 1), 2.5);
  if (!(inspectionScale > 1)) return base;
  return Math.min(base * inspectionScale, 4,
    Math.sqrt(8_000_000 / Math.max(1, width * height)),
    maxSide / Math.max(1, width, height));
}
