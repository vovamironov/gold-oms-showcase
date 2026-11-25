/** Keep the inline center as the start and end of the handoff. */
export function nuggetInspectionGeometry(rect, viewport) {
  // Give the mobile canvas enough room to fill the viewport along its short edge.
  const scale = viewport.width < 768
    ? Math.max(1.1, Math.min(viewport.width, viewport.height) / Math.max(1, Math.min(rect.width, rect.height)))
    : 1.8;
  return {
    scale,
    inline: `translate(calc(-50% + ${rect.left + rect.width / 2 - viewport.width / 2}px), calc(-50% + ${rect.top + rect.height / 2 - viewport.height / 2}px)) scale(1)`,
    full: `translate(-50%, -50%) scale(${scale})`,
  };
}
