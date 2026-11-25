import * as THREE from 'three';
import { createBackground } from './background.js';
import { INSPECTION_SETTINGS, SPHERE_MOTION } from './viewer-settings.js';
import { dustVisualProfile } from './visual-settings.js?v=2';
import { createDustWindMotion } from './wind-motion.js';
import { createGoldRays } from './gold-rays.js?v=9';

// The application's original particle shaders live in background.js unchanged.
// This wrapper supplies the same transparent overlay/camera and web lifecycle.
const diagnostic = document.createElement('script');
diagnostic.id = 'gold-dust-state';
diagnostic.type = 'application/json';
document.body.append(diagnostic);

try {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const reducedPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const options = new URLSearchParams(location.search);
  const reducedOverride = options.get('reduced') === '1';
  const standby = options.get('standby') === '1';
  const reducedMotion = () => reducedOverride || reducedPreference.matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.tabIndex = -1;
  document.body.append(renderer.domElement);

  const scene = new THREE.Scene();
  const rays = options.get('rays') === '1' ? createGoldRays(scene, options.get('palette') === 'amber', standby) : null;
  const raysFrame = standby && rays ? window.frameElement : null;
  function fitRays() {
    if (!rays) return;
    const frame = window.frameElement;
    const height = Math.max(1, innerHeight);
    const topBleed = Math.max(0, -(frame?.offsetTop ?? 0));
    const sceneHeight = topBleed ? Math.min(height, Math.max(1, frame.parentElement?.clientHeight ?? height)) : height;
    const bottomBleed = Math.max(0, height - sceneHeight - topBleed);
    const reach = frame?.ownerDocument?.defaultView?.getComputedStyle(frame).getPropertyValue('--inspection-rays-reach');
    rays.resize(Math.max(1, innerWidth), height, sceneHeight, bottomBleed, Number.parseFloat(reach) || 1);
  }
  fitRays();
  const camera = new THREE.PerspectiveCamera(35, innerWidth / Math.max(innerHeight, 1), .05, 100);
  camera.setFocalLength(85);
  camera.position.set(0, .4, 8);
  camera.lookAt(0, 0, 0);
  const background = createBackground(scene, renderer, camera);
  let settings = { ...INSPECTION_SETTINGS };
  let visualProfile = dustVisualProfile(innerWidth, settings.theme);
  const inputLimit = SPHERE_MOTION.windMax * SPHERE_MOTION.windOutput;
  const windMotion = createDustWindMotion({ maxInput: inputLimit });
  const wind = { x: 0, y: 0 };
  const windPixels = { x: 0, y: 0 };
  let parentVisible = !standby;
  let disposed = false;
  let frame = 0;
  let elapsed = 0;
  let previousTime;
  let lastDiagnostic = -Infinity;
  const effectsEnabled = () => settings.particlesEnabled || rays !== null;

  function updateDiagnostic() {
    diagnostic.textContent = JSON.stringify({
      ready: !disposed,
      enabled: settings.particlesEnabled,
      visible: settings.particlesEnabled && parentVisible && !document.hidden,
      reducedMotion: reducedMotion(),
      count: background.params.count,
      sizeScale: background.params.sizeScale,
      theme: settings.theme,
      profile: visualProfile.name,
      density: visualProfile.density * settings.particleDensity,
      nativeDensity: settings.particleDensity,
      brightness: background.params.particleBrightness,
      twinkle: background.params.twinkle,
      wind: { ...wind },
      windPixels: { ...windPixels },
      windTarget: { x: windMotion.state().targetX, y: windMotion.state().targetY },
      maxWindPixels: visualProfile.maxWindPixels,
    });
  }
  function clearWind() {
    windMotion.reset();
    wind.x = wind.y = windPixels.x = windPixels.y = 0;
    background.setWind(0, 0);
  }
  function advanceWind(delta) {
    const sample = windMotion.step(delta);
    // The native shader uses a world-space displacement, not a velocity.
    // Normalize it to the same gentle screen distance on wide and tall views.
    const worldPerPixel = 16 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, innerHeight);
    const gain = visualProfile.maxWindPixels / inputLimit;
    windPixels.x = sample.x * gain;
    windPixels.y = sample.y * gain;
    wind.x = windPixels.x * worldPerPixel;
    wind.y = windPixels.y * worldPerPixel;
    background.setWind(wind.x, wind.y);
  }
  function render() {
    if (disposed || !effectsEnabled() || !parentVisible || document.hidden) return;
    const reduced = reducedMotion();
    const time = reduced ? 0 : elapsed;
    background.update(time);
    rays?.update(time, reduced);
    renderer.render(scene, camera);
    if (raysFrame && !raysFrame.hasAttribute('data-rays-ready')) raysFrame.setAttribute('data-rays-ready', '');
  }
  function animate(now) {
    frame = 0;
    if (disposed || !effectsEnabled() || !parentVisible || document.hidden || reducedMotion()) return;
    const delta = previousTime === undefined ? 0 : Math.max(0, (now - previousTime) / 1000);
    elapsed += Math.min(delta, .05);
    previousTime = now;
    advanceWind(delta);
    render();
    if (now - lastDiagnostic >= 80) { updateDiagnostic(); lastDiagnostic = now; }
    frame = requestAnimationFrame(animate);
  }
  function synchronize() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = undefined;
    if (reducedMotion() || document.hidden || !parentVisible || !settings.particlesEnabled || !settings.particleWindEnabled) clearWind();
    else advanceWind(0);
    updateDiagnostic();
    render();
    if (!disposed && effectsEnabled() && parentVisible && !document.hidden && !reducedMotion()) frame = requestAnimationFrame(animate);
  }
  function applyDustSettings(next = {}) {
    if (disposed) return;
    settings = { ...settings, ...next };
    settings.theme = settings.theme === 'light' ? 'light' : 'dark';
    settings.particlesEnabled = settings.particlesEnabled === true;
    settings.particleWindEnabled = settings.particleWindEnabled !== false;
    settings.particleDensity = clamp(Number(settings.particleDensity) || 1, .25, 5);
    visualProfile = dustVisualProfile(innerWidth, settings.theme);
    const baseCount = settings.theme === 'dark' ? 100 : 140;
    renderer.domElement.style.opacity = effectsEnabled() ? '1' : '0';
    background.setTheme(settings.theme);
    background.setVisible(settings.particlesEnabled);
    background.setParam('count', Math.round(baseCount * settings.particleDensity * visualProfile.density));
    background.setParam('sizeScale', visualProfile.sizeScale);
    background.setParam('particleBrightness', visualProfile.particleBrightness);
    background.setParam('twinkle', visualProfile.twinkle);
    synchronize();
  }
  function setDustWind(x = 0, y = 0) {
    if (disposed) return;
    const horizontal = Number(x), vertical = Number(y);
    const active = !reducedMotion() && !document.hidden && parentVisible && settings.particlesEnabled && settings.particleWindEnabled;
    if (active) windMotion.setTarget(Number.isFinite(horizontal) ? horizontal : 0, Number.isFinite(vertical) ? vertical : 0);
    else clearWind();
    updateDiagnostic();
    if (reducedMotion()) render();
  }
  function resize() {
    if (disposed) return;
    camera.aspect = Math.max(innerWidth, 1) / Math.max(innerHeight, 1);
    camera.setFocalLength(85);
    const pixelRatio = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    fitRays();
    background.setPixelRatio(pixelRatio);
    background.fitToView();
    if (visualProfile !== dustVisualProfile(innerWidth, settings.theme)) applyDustSettings();
    else synchronize();
  }
  function setInspectionDustVisible(visible) {
    parentVisible = visible === true;
    if (standby && parentVisible) resize();
    else synchronize();
  }
  function receive(event) {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === 'inspection-dust-visible') {
      setInspectionDustVisible(event.data.visible);
    } else if (event.data?.type === 'inspection-dust-wind') setDustWind(event.data.x, event.data.y);
    else if (event.data?.type === 'inspection-dust-settings') applyDustSettings(event.data.settings);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    raysFrame?.removeAttribute('data-rays-ready');
    clearWind();
    cancelAnimationFrame(frame);
    frame = 0;
    removeEventListener('resize', resize);
    removeEventListener('message', receive);
    document.removeEventListener('visibilitychange', synchronize);
    reducedPreference.removeEventListener('change', synchronize);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    background.dispose();
    rays?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    updateDiagnostic();
  }
  function contextLost(event) {
    event.preventDefault();
    dispose();
  }
  const pendingSettings = window.__pendingBullionDustSettings;
  const pendingWind = window.__pendingBullionDustWind;
  window.applyDustSettings = applyDustSettings;
  window.setDustWind = setDustWind;
  if (standby) window.setInspectionDustVisible = setInspectionDustVisible;
  addEventListener('resize', resize);
  addEventListener('message', receive);
  addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('visibilitychange', synchronize);
  reducedPreference.addEventListener('change', synchronize);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  applyDustSettings({ ...window.initialBullionDustSettings, ...pendingSettings });
  if (standby) renderer.compile(scene, camera);
  if (Array.isArray(pendingWind)) setDustWind(pendingWind[0], pendingWind[1]);
} catch {
  // A decorative layer failing must never prevent opening the 3D object.
  diagnostic.textContent = JSON.stringify({ ready: false, unavailable: true });
}
