/** Limit the projected rotation envelope to the framebuffer and the viewport. */
export function nuggetInspectionFit(radius, offsetY, frame, viewport, stageScale, maxGutter = 24) {
  const gutter = Math.min(maxGutter, Math.min(viewport.width, viewport.height) * .05);
  const halfWidth = Math.min(frame.width / 2, (viewport.width / 2 - gutter) / stageScale);
  const halfHeight = Math.min(frame.height / 2, (viewport.height / 2 - gutter) / stageScale);
  return Math.max(0, Math.min(halfWidth, halfHeight - Math.abs(offsetY))) / radius;
}

export function nuggetMobileInspectionFit(scale, radius, offsetY, frame, viewport, targetZoom, liveZoom) {
  const inline = Math.min(scale, (frame.width / 2 - 4) / radius, (frame.height / 2 - Math.abs(offsetY)) / radius);
  const target = nuggetInspectionFit(radius, offsetY, frame, viewport, targetZoom, 8);
  const progress = Math.max(0, Math.min(1, (liveZoom - 1) / (targetZoom - 1)));
  // Interpolate the apparent size so the first and last frames match the hero.
  const screenScale = inline + (target * targetZoom - inline) * progress;
  return Math.min(screenScale / liveZoom, nuggetInspectionFit(radius, offsetY, frame, viewport, liveZoom, 4));
}
