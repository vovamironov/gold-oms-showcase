// Shared inspection tuning from Savings/Sphere, not the inline configurator.
// Sources: Features/Projects/BullionViewerViewController.swift
// (.bullionDefaultValue + BullionViewerSettings) and
// Resources/BullionViewerWeb/viewer.js in the native Savings project.
export const INSPECTION_SETTINGS = Object.freeze({
  rotationSensitivity: 1,
  inertiaEnabled: true,
  inertiaStrength: .6,
  autoRotationEnabled: true,
  autoRotationSpeed: .4,
  autoReturnEnabled: false,
  particlesEnabled: true,
  particleDensity: 1,
  particleWindEnabled: true,
  theme: 'dark',
});

// The bar keeps the website's front-facing rest; a nugget has no front.
export const BARS_INSPECTION_SETTINGS = Object.freeze({ ...INSPECTION_SETTINGS, autoReturnEnabled: true });
export const NUGGET_INSPECTION_SETTINGS = Object.freeze({ ...INSPECTION_SETTINGS, autoReturnEnabled: false });

export const SPHERE_MOTION = Object.freeze({
  dragRadiansPerPixel: .008,
  inertiaKick: 1.35,
  dragThreshold: 1.25,
  stopThreshold: .00005,
  autoRadiansPerSecond: .42,
  velocityDampingBase: .84,
  velocityDampingStrength: .125,
  frontReturnThreshold: .0004,
  frontReturnEase: .11,
  frontReturnSnap: .001,
  windBlend: .35,
  windKick: .75,
  windMax: .1,
  windDampingBase: .86,
  windDampingStrength: .08,
  windStopThreshold: .0001,
  windOutput: 8,
});
