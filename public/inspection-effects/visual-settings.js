// The website adapts particle visibility to its larger, wider inspection surface.
// Gesture sensitivity and model inertia still use the shared Sphere profile.
const desktop = Object.freeze({ name: 'desktop', density: 1.8, sizeScale: .15,
  particleBrightness: 1.4, twinkle: .55, maxWindPixels: 44 });
const mobile = Object.freeze({ name: 'mobile', density: 1.6, sizeScale: .12,
  particleBrightness: 1.6, twinkle: .6, maxWindPixels: 32 });
const light = Object.freeze({ name: 'light', density: 1, sizeScale: .18,
  particleBrightness: .68, twinkle: .6, maxWindPixels: 32 });

export function dustVisualProfile(width, theme = 'dark') {
  return theme === 'light' ? light : width > 767 ? desktop : mobile;
}
