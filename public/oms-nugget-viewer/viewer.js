import * as THREE from 'three';
import { nuggetPixelRatio } from './render-resolution.js';
import { nuggetInspectionFit, nuggetMobileInspectionFit } from './inspection-fit.js?v=2';
import { installObjectTouch } from '../gold-scene/object-touch.js?v=5';
import { enableRotation } from '../gold-scene/rotation.js?v=6';
import { sampleEntranceIntoSpin } from '../gold-scene/entrance-motion.js';
import { NUGGET_INSPECTION_SETTINGS, SPHERE_MOTION } from '../inspection-effects/viewer-settings.js';
import { createNuggetMaterial, createNuggetEnvironment, updateNuggetCurvature } from './gold-material.js?v=4';
import { createMorphMotion } from './morph-motion.js?v=1';
import { createSettleMotion } from './settle-motion.js?v=3';
import { displayScaleOverride, sizeCoordinateFor, displayScaleForCoordinate } from './display-scale.js?v=1';

const host = document.querySelector('.stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const query = new URLSearchParams(location.search);
const landing = query.get('mode') === 'landing';
const inspection = query.get('inspection') === '1';
const heroInspectTap = query.get('heroInspectTap') === '1';
const objectTouch = query.get('objectTouch') === '1' && !landing;
const heroFrame = heroInspectTap ? window.frameElement : null;
const requestedModelScale = Number(query.get('mobileModelScale'));
const mobileModelScale = Number.isFinite(requestedModelScale) && requestedModelScale > 1 ? requestedModelScale : 1;
const mobileFrame = mobileModelScale > 1 ? window.frameElement : null;
let inspectionActive = inspection;
let mobileLayout = false;
let heroTapEnabled = false;
let inspectionRenderScale = 1;
let inspectionViewport = null;
const LANDING_DISPLAY_SCALE = .99;
const stageFor = weight => Math.min(10, Math.max(1, Math.ceil(Number(weight) || .1)));
let selectedWeight = landing ? stageFor(query.get('stage') || 10) : Number(query.get('stage')) || 1;
let selectedDisplayScale = displayScaleOverride(query.get('displayScale'));
let ready = false, visible = true, last = performance.now();
let phase = 'loading', revealed = landing || inspection, presentationCount = 0, introElapsed = 0, deferredSettle = false;
let revealRequested = !landing && parent === window;
const introDuration = 1, introStartY = -5;
const introYawSpeed = -SPHERE_MOTION.autoRadiansPerSecond * NUGGET_INSPECTION_SETTINGS.autoRotationSpeed;
const motion = createMorphMotion(10, selectedWeight);
const sizeMotion = createMorphMotion(2, sizeCoordinateFor(selectedWeight, selectedDisplayScale));
const diagnostics = document.createElement('script');
diagnostics.type = 'application/json'; diagnostics.id = 'nugget-viewer-state'; document.body.append(diagnostics);
const send = (type, payload = {}) => parent.postMessage({ type, ...payload }, location.origin);

try {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  host.append(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = landing ? -1 : 0;
  const updateCanvasLabel = () => canvas.setAttribute('aria-label', landing ? 'Золотой самородок' :
    'Золотой самородок. Потяните для свободного вращения. Shift и перетаскивание или Shift со стрелками вращают вокруг оси экрана. ' +
    (heroTapEnabled && !inspectionActive ? 'Enter или пробел открывают просмотр.' : 'Enter возвращает ракурс.'));
  updateCanvasLabel();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3.45, 3.45, 2.68, -2.68, .01, 100);
  camera.position.set(0, 0, 8); camera.lookAt(0, 0, 0);
  // Keep the one-time entrance independent of weight settling and inspection.
  const flight = new THREE.Group(); scene.add(flight); flight.visible = landing || inspection;
  const idlePivot = new THREE.Group(); flight.add(idlePivot);
  const settleMotion = createSettleMotion();
  const hoverPivot = new THREE.Group(); idlePivot.add(hoverPivot);
  const pivot = new THREE.Group(); hoverPivot.add(pivot);
  const pose = new THREE.Group();
  pose.rotation.set(...[-12, 32, -6].map(THREE.MathUtils.degToRad));
  let modelRadius = 0;
  let surfaceWidth = 0, surfaceHeight = 0, surfaceRatio = 0;
  const scaleForPose = coordinate => landing ? LANDING_DISPLAY_SCALE : displayScaleForCoordinate(coordinate) * (mobileLayout ? mobileModelScale : 1);
  const updateSize = () => {
    const scale = scaleForPose(sizeMotion.coordinate);
    if (inspectionViewport && modelRadius && surfaceWidth) {
      const pixelsPerUnit = surfaceHeight / (camera.top - camera.bottom);
      const radius = modelRadius * hoverPivot.scale.x * pixelsPerUnit;
      const offsetY = idlePivot.position.y * pixelsPerUnit;
      const frame = { width: surfaceWidth, height: surfaceHeight };
      const liveZoom = () => heroFrame.getBoundingClientRect().width / heroFrame.clientWidth;
      if (mobileLayout) {
        pose.scale.setScalar(nuggetMobileInspectionFit(scale, radius, offsetY, frame, inspectionViewport, inspectionRenderScale, liveZoom()));
        return;
      }
      const fit = stageScale => nuggetInspectionFit(radius, offsetY, frame, inspectionViewport, stageScale);
      // Measure the live transform only when the final scale needs fitting.
      const maxScale = fit(inspectionRenderScale) < scale
        ? fit(liveZoom())
        : scale;
      pose.scale.setScalar(Math.min(scale, maxScale));
      return;
    }
    if (!mobileLayout || !mobileFrame || !modelRadius || !surfaceWidth) {
      pose.scale.setScalar(scale);
      return;
    }
    const halfWidth = camera.right * (1 - 8 / surfaceWidth);
    // Only measure the parent transform when the model could reach a side edge.
    // Using the live transform also keeps the fit continuous during the handoff.
    const stageScale = modelRadius * scale * Math.max(1.4, inspectionRenderScale) > halfWidth
      ? Math.max(1, mobileFrame.getBoundingClientRect().width / surfaceWidth)
      : 1;
    const halfHeight = camera.top - Math.abs(idlePivot.position.y);
    pose.scale.setScalar(Math.min(scale, halfWidth / (modelRadius * stageScale), halfHeight / modelRadius));
  };
  updateSize();
  pivot.add(pose);
  // Every side of the nugget is valid: retain the user's orientation after release.
  const rotationSettings = () => ({ ...NUGGET_INSPECTION_SETTINGS,
    autoRotationEnabled: NUGGET_INSPECTION_SETTINGS.autoRotationEnabled && !reduced.matches,
    inertiaEnabled: NUGGET_INSPECTION_SETTINGS.inertiaEnabled && !reduced.matches,
    particleWindEnabled: NUGGET_INSPECTION_SETTINGS.particleWindEnabled && !reduced.matches,
  });
  const rotate = landing ? () => {} : enableRotation(canvas, pivot, { unrestricted: true, settings: rotationSettings() });
  let lastWindAt = -Infinity, lastWind = { x: 0, y: 0 };
  const syncDustWind = (force = false) => {
    if (landing) return;
    const wind = inspectionActive && visible && !document.hidden && !reduced.matches ? rotate.wind() : { x: 0, y: 0 };
    const now = performance.now();
    const stopped = wind.x === 0 && wind.y === 0 && (lastWind.x !== 0 || lastWind.y !== 0);
    const heartbeat = (wind.x !== 0 || wind.y !== 0) && now - lastWindAt >= 150;
    if (!force && !stopped && (now - lastWindAt < 70 || !heartbeat && Math.max(Math.abs(wind.x - lastWind.x), Math.abs(wind.y - lastWind.y)) < .01)) return;
    lastWindAt = now; lastWind = wind;
    send('nugget-inspection-wind', wind);
  };
  const hoverTarget = new THREE.Vector2();
  const hoverTiltLimit = THREE.MathUtils.degToRad(4);
  let hoverScaleTarget = 1, hoverMouse = null, nextHoverCheck = 0;
  const clearHover = () => {
    hoverTarget.set(0, 0);
    hoverScaleTarget = 1;
    hoverMouse = null;
    if (canvas.style.cursor === 'pointer' || canvas.style.cursor === 'default') canvas.style.cursor = 'grab';
  };
  const previewHover = (active, x, y) => {
    if (!landing || !active || reduced.matches || !visible || !Number.isFinite(x) || !Number.isFinite(y)) {
      clearHover(); return;
    }
    // DOM coordinates are downward-positive, matching the bars hover response.
    hoverTarget.set(THREE.MathUtils.clamp(y, -1, 1), THREE.MathUtils.clamp(x, -1, 1))
      .clampLength(0, 1).multiplyScalar(hoverTiltLimit);
  };
  if (landing) {
    canvas.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      previewHover(event.pointerType === 'mouse' && !event.buttons,
        (event.clientX - rect.left) / rect.width * 2 - 1,
        (event.clientY - rect.top) / rect.height * 2 - 1);
    });
    for (const type of ['pointerleave', 'pointerdown', 'pointercancel']) canvas.addEventListener(type, clearHover);
    window.addEventListener('blur', clearHover);
  }
  const idlePeriod = Math.PI * 2 / Math.abs(introYawSpeed);
  let lastDiagnostics = 0;
  const resetIdle = () => {
    idlePivot.rotation.set(0, 0, 0);
  };
  function finishIntro() {
    phase = 'idle'; flight.visible = true;
    flight.position.y = 0; flight.rotation.set(0, 0, 0);
    resetIdle();
    if (deferredSettle && !reduced.matches && visible && !document.hidden) settleMotion.trigger();
    deferredSettle = false;
  }
  function present() {
    if (landing || revealed || !ready || !revealRequested || !visible || document.hidden) return;
    revealed = true; presentationCount++; introElapsed = 0; last = performance.now();
    settleMotion.reset(); idlePivot.position.y = 0; resetIdle();
    flight.visible = true;
    if (reduced.matches) finishIntro();
    else {
      phase = 'enter'; flight.position.y = introStartY;
      flight.rotation.set(0, Math.PI * 2, 0);
    }
    updateDiagnostics();
  }
  const interact = () => {
    if (landing || !ready || (phase !== 'waiting' && phase !== 'enter')) return;
    revealed = true; finishIntro(); updateDiagnostics();
  };
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    interact();
  });
  canvas.addEventListener('dblclick', resetIdle);
  const material = createNuggetMaterial(renderer);
  const environment = createNuggetEnvironment(renderer);
  scene.environment = environment.texture;
  let geometry = null, mesh = null, manifest = null, targets = null;
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const hitModel = (x, y) => {
    if (!ready || phase !== 'idle' || !mesh) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    if (Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1) return false;
    mesh.updateWorldMatrix(true, false);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(mesh, false).length > 0;
  };
  const canOpenHero = () => heroTapEnabled && ready && phase === 'idle' && !inspectionActive && visible && !document.hidden;
  function updateHeroHover(now) {
    if (!hoverMouse) return;
    if (mobileLayout || !canOpenHero()) { clearHover(); return; }
    nextHoverCheck = now + 80;
    const hit = hitModel(hoverMouse.x, hoverMouse.y);
    hoverScaleTarget = hit && !reduced.matches ? 1.04 : 1;
    const cursor = hit ? 'pointer' : 'default';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  }
  if (heroInspectTap) {
    const rememberHover = event => {
      if (event.pointerType !== 'mouse' || event.buttons || mobileLayout) { clearHover(); return; }
      hoverMouse = { x: event.clientX, y: event.clientY };
      updateHeroHover(performance.now());
    };
    for (const type of ['pointermove', 'pointerup']) canvas.addEventListener(type, rememberHover);
    for (const type of ['pointerleave', 'pointerdown', 'pointercancel']) canvas.addEventListener(type, clearHover, true);
    window.addEventListener('blur', clearHover);
  }
  if (objectTouch) {
    const openInspection = () => {
      clearHover();
      send('nugget-hero-tap');
    };
    const tapSwitch = heroInspectTap ? document.createElement('input') : null;
    const nativeHaptic = tapSwitch !== null && 'switch' in tapSwitch;
    const tapLabel = nativeHaptic ? document.createElement('label') : null;
    let onTap = event => {
      if (mobileLayout && event.isTrusted && event.pointerType === 'touch') window.navigator.vibrate?.(12);
      openInspection();
    };

    if (tapLabel) {
      Object.assign(tapLabel.style, { display: 'block', width: '100%', height: '100%', touchAction: 'manipulation' });
      tapLabel.append(canvas);
      tapSwitch.id = 'nugget-tap-feedback';
      tapSwitch.type = 'checkbox';
      tapSwitch.tabIndex = -1;
      tapSwitch.setAttribute('switch', '');
      tapSwitch.setAttribute('aria-hidden', 'true');
      Object.assign(tapSwitch.style, { position: 'absolute', top: '0', left: '0', width: '28px', height: '12.4px', opacity: '0', pointerEvents: 'none' });
      host.append(tapLabel, tapSwitch);

      let pendingTap = null;
      let timer;
      const clearTap = () => {
        clearTimeout(timer);
        pendingTap = null;
        tapLabel.removeAttribute('for');
        tapSwitch.blur();
        tapSwitch.checked = false;
      };
      const finishTap = () => {
        if (!pendingTap) return;
        clearTap();
        if (canOpenHero()) openInspection();
      };
      onTap = (event, native) => {
        if (!native || !event.isTrusted) {
          clearTap();
          openInspection();
          return;
        }
        clearTap();
        pendingTap = { x: event.clientX, y: event.clientY };
        // Safari needs the trusted label click before the viewer moves into the modal.
        timer = setTimeout(finishTap, 110);
      };
      tapLabel.addEventListener('click', event => {
        if (!pendingTap || !event.isTrusted || !canOpenHero() ||
            Math.hypot(event.clientX - pendingTap.x, event.clientY - pendingTap.y) > 8) return;
        tapLabel.htmlFor = tapSwitch.id;
        clearTimeout(timer);
        timer = setTimeout(finishTap, 0);
      });
      tapSwitch.addEventListener('change', event => {
        if (event.isTrusted && pendingTap && tapLabel.htmlFor === tapSwitch.id) {
          diagnostics.dataset.tapHaptics = 'switch-activated';
        }
      });
      canvas.addEventListener('pointerdown', clearTap, true);
      canvas.addEventListener('webglcontextlost', clearTap);
      window.addEventListener('pagehide', clearTap, { once: true });
    }

    installObjectTouch(canvas, hitModel, {
      allowPageScroll: () => !window.frameElement?.closest?.('.bars-inspection-window[open]'),
      ...(heroInspectTap ? {
        tapEnabled: canOpenHero,
        allowNativeTap: () => nativeHaptic && mobileLayout,
        onTap,
        onObjectPointerDown: () => send('nugget-hero-interaction'),
      } : {}),
    });
  }

  let geometryUpdateMs = 0;
  const displayBounds = [0, 0, 0];
  const resize = () => {
    const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
    const ratio = nuggetPixelRatio(width, height, devicePixelRatio, inspectionRenderScale, renderer.capabilities.maxTextureSize);
    if (surfaceWidth === width && surfaceHeight === height && surfaceRatio === ratio) return;
    surfaceWidth = width; surfaceHeight = height; surfaceRatio = ratio;
    renderer.setDrawingBufferSize(width, height, ratio);
    const halfHeight = inspection && query.get('inlineCamera') !== '1' ? 2.68 * pose.scale.x : 2.68;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.right = halfHeight * width / height; camera.left = -camera.right;
    camera.updateProjectionMatrix();
    updateSize();
    // Changing the backing buffer clears it. Paint within the same task so a
    // modal open/close or ResizeObserver callback cannot expose an empty frame.
    if (ready) renderer.render(scene, camera);
  };
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
  const select = (weight, displayScale) => {
    if (landing) return;
    const previousWeight = selectedWeight;
    const previousDisplayScale = selectedDisplayScale;
    selectedWeight = Number(weight) || .1;
    selectedDisplayScale = displayScaleOverride(displayScale);
    const instant = reduced.matches || !ready || phase === 'waiting';
    motion.setWeight(selectedWeight, instant);
    sizeMotion.setWeight(sizeCoordinateFor(selectedWeight, selectedDisplayScale), instant);
    if (reduced.matches || !ready || !visible || document.hidden || phase === 'waiting') {
      settleMotion.reset(); idlePivot.position.y = 0; deferredSettle = false;
    } else if (selectedWeight !== previousWeight || selectedDisplayScale !== previousDisplayScale) {
      if (phase === 'enter') deferredSettle = true;
      else settleMotion.trigger();
    }
    if (ready && instant) updateGeometry();
    if (instant) updateSize();
    updateDiagnostics();
  };
  function updateDiagnostics() {
    diagnostics.textContent = JSON.stringify({
      ready, mode: landing ? 'landing' : 'oms', selected: stageFor(selectedWeight), weight: selectedWeight,
      phase, revealed, presentationCount, presentationMode: landing ? 'none' : 'fly',
      y: flight.position.y, turn: flight.rotation.y,
      flight: { y: flight.position.y, turn: flight.rotation.y,
        durationSeconds: introDuration, initialY: introStartY, elapsedSeconds: introElapsed },
      active: stageFor(motion.coordinate), current: motion.coordinate,
      transitioning: !motion.settled, morphWeights: Array.from(motion.weights),
      stageCount: targets?.length || 0, vertices: manifest?.vertexCount,
      triangles: manifest?.triangleCount,
      assetSHA: manifest?.binary.sha256, finish: material.userData.nuggetFinish,
      curvature: geometry?.userData.nuggetCurvatureStats,
      geometryUpdateMs,
      renderResolution: { width: canvas.width, height: canvas.height, pixelRatio: surfaceRatio, inspectionScale: inspectionRenderScale },
      rotation: pivot.rotation.toArray().slice(0, 3),
      rotationQuaternion: pivot.quaternion.toArray(), unrestrictedRotation: !landing,
      hoverRotation: hoverPivot.rotation.toArray().slice(0, 3),
      hoverTarget: hoverTarget.toArray(), hoverTiltLimitDegrees: 4,
      hoverScale: hoverPivot.scale.x, inspectionActive,
      poseRotation: pose.rotation.toArray().slice(0, 3),
      idleRotation: idlePivot.rotation.toArray().slice(0, 3),
      autoRotationPeriodSeconds: landing ? 0 : idlePeriod, morphEnabled: !landing,
      rotationSettings: landing ? null : rotationSettings(),
      rotationMotion: rotate.state?.() ?? null,
      dustWind: landing ? { x: 0, y: 0 } : lastWind,
      displayScale: pose.scale.x, targetDisplayScale: scaleForPose(sizeCoordinateFor(selectedWeight, selectedDisplayScale)),
      displayScaleMode: selectedDisplayScale === null ? 'legacy' : 'explicit',
      displayBounds: displayBounds.map(value => value * pose.scale.x),
      loadedWeights: landing ? [selectedWeight] : manifest?.shapes.map(shape => shape.stage),
      assetPath: landing ? '/oms-nugget/' + manifest?.shapes[selectedWeight - 1]?.file : '/oms-nugget/' + manifest?.binary.file,
      weightSettle: { active: settleMotion.active, phase: settleMotion.phase,
        offsetY: idlePivot.position.y, peakOffsetY: settleMotion.peakOffset,
        pulseCount: settleMotion.pulseCount, depth: settleMotion.depth },
    });
  }
  function updateGeometry() {
    const started = performance.now();
    const position = geometry.getAttribute('position');
    const array = position.array; array.fill(0);
    for (let stage = 0; stage < targets.length; stage++) {
      const weight = motion.weights[stage];
      if (!weight) continue;
      const source = targets[stage].positions;
      for (let i = 0; i < array.length; i++) array[i] += source[i] * weight;
    }
    position.needsUpdate = true;
    // Highlights follow the actual intermediate folds, with one gold finish.
    geometry.computeVertexNormals();
    updateNuggetCurvature(geometry);
    geometry.boundingSphere = null;
    fitGeometry();
    geometryUpdateMs = performance.now() - started;
  }
  function fitGeometry() {
    geometry.computeBoundingBox();
    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    // Extremal vertices differ. Fit the current bounds inside the rotation
    // pivot to keep the same presentation dimensions between endpoints too.
    mesh.scale.set(3.7 / size.x, 3.3 / size.y, 3.05 / size.z);
    mesh.position.copy(center).multiply(mesh.scale).negate();
    displayBounds[0] = size.x * mesh.scale.x;
    displayBounds[1] = size.y * mesh.scale.y;
    displayBounds[2] = size.z * mesh.scale.z;
    if (mobileFrame) {
      const vertices = geometry.getAttribute('position').array;
      let radiusSquared = 0;
      for (let index = 0; index < vertices.length; index += 3) {
        const x = (vertices[index] - center.x) * mesh.scale.x;
        const y = (vertices[index + 1] - center.y) * mesh.scale.y;
        const z = (vertices[index + 2] - center.z) * mesh.scale.z;
        radiusSquared = Math.max(radiusSquared, x * x + y * y + z * z);
      }
      modelRadius = Math.sqrt(radiusSquared);
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== location.origin) return;
    if (event.data?.type === 'gold-preview-hover') previewHover(event.data.active === true, event.data.x, event.data.y);
    if (heroInspectTap && event.data?.type === 'nugget-hero-tap-mode') {
      const nextMobileLayout = event.data.enabled === true;
      const nextHeroTapEnabled = event.data.tapEnabled ?? nextMobileLayout;
      if (mobileLayout !== nextMobileLayout || heroTapEnabled !== nextHeroTapEnabled) clearHover();
      mobileLayout = nextMobileLayout;
      heroTapEnabled = nextHeroTapEnabled === true;
      updateCanvasLabel();
      updateSize();
    }
    if (event.data?.type === 'nugget-inspect') {
      inspectionActive = event.data.active === true;
      clearHover();
      updateCanvasLabel();
      const scale = Number(event.data.renderScale);
      inspectionRenderScale = inspectionActive && Number.isFinite(scale) ? Math.max(1, Math.min(scale, 4)) : 1;
      const viewport = event.data.viewport;
      inspectionViewport = inspectionActive && heroFrame
        && Number.isFinite(viewport?.width) && viewport.width > 0
        && Number.isFinite(viewport?.height) && viewport.height > 0 ? viewport : null;
      resize();
      updateSize();
      updateDiagnostics();
      syncDustWind(true);
    }
    if (event.data?.type === 'nugget-select') select(event.data.weight, event.data.displayScale);
    if (event.data?.type === 'nugget-visible') {
      visible = event.data.visible === true;
      if (!visible) { clearHover(); settleMotion.reset(); idlePivot.position.y = 0; deferredSettle = false; syncDustWind(true); updateDiagnostics(); }
      else { last = performance.now(); present(); }
    }
    if (event.data?.type === 'nugget-reveal' && event.data.reveal === true && !landing) {
      revealRequested = true; present();
    }
    if (event.data?.type === 'nugget-ready-request' && ready) send('nugget-ready');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearHover(); settleMotion.reset(); idlePivot.position.y = 0; deferredSettle = false; syncDustWind(true); updateDiagnostics(); }
    else { last = performance.now(); present(); }
  });
  reduced.addEventListener('change', () => {
    if (!landing) { rotate.setSettings(rotationSettings()); if (reduced.matches) rotate.reset(); syncDustWind(true); }
    if (reduced.matches) {
      clearHover(); resetIdle(); settleMotion.reset(); idlePivot.position.y = 0; deferredSettle = false;
      if (phase === 'enter') finishIntro();
      else if (phase === 'waiting') { flight.position.y = 0; flight.rotation.set(0, 0, 0); }
    }
    if (!ready || !reduced.matches) return;
    motion.setWeight(selectedWeight, true);
    sizeMotion.setWeight(sizeCoordinateFor(selectedWeight, selectedDisplayScale), true); updateSize();
    if (!landing) updateGeometry(); updateDiagnostics();
    renderer.render(scene, camera);
  });
  canvas.addEventListener('keydown', event => {
    if (inspectionActive && event.key === 'Escape') { event.preventDefault(); send('nugget-inspect-close'); return; }
    if (landing) return;
    if (canOpenHero() && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (!event.repeat) send('nugget-hero-tap', { keyboard: true });
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) return;
    interact();
    event.preventDefault(); rotate.reset();
    if (event.key === 'Enter') { pivot.rotation.set(0, 0, 0); resetIdle(); }
    else if (event.shiftKey) rotate.rotateBy(0, 0, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -.2 : .2);
    else if (event.key === 'ArrowLeft') rotate.rotateBy(0, -.2, 0);
    else if (event.key === 'ArrowRight') rotate.rotateBy(0, .2, 0);
    else rotate.rotateBy(event.key === 'ArrowUp' ? -.12 : .12, 0, 0);
    updateDiagnostics();
  });
  canvas.addEventListener('pointerup', updateDiagnostics);
  const response = await fetch('/oms-nugget/morph-manifest.json?v=9');
  if (!response.ok) throw new Error('Nugget morph manifest is unavailable');
  manifest = await response.json();
  if (manifest.format !== 'oms-nugget-shared-topology-v1' || manifest.shapes.length !== 10) {
    throw new Error('Ten shared-topology nugget stages are required');
  }
  if (landing) {
    // The stage GLB contains the same accepted topology as this morph endpoint.
    // A landing preview needs only this one shape, not the ten-target binary.
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const shape = manifest.shapes[selectedWeight - 1];
    const gltf = await new GLTFLoader().loadAsync('/oms-nugget/' + shape.file + '?v=' + shape.sha256.slice(0, 12));
    gltf.scene.traverse(node => { if (!geometry && node.isMesh) geometry = node.geometry.clone(); });
    if (!geometry) throw new Error('Nugget preview geometry is unavailable');
    geometry.computeVertexNormals();
    updateNuggetCurvature(geometry);
    targets = [{ positions: geometry.getAttribute('position').array }];
    mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; pose.add(mesh);
    fitGeometry();
  } else {
    const binaryResponse = await fetch('/oms-nugget/' + manifest.binary.file + '?v=' + manifest.binary.sha256.slice(0, 12));
    if (!binaryResponse.ok) throw new Error('Nugget morph geometry is unavailable');
    const binary = await binaryResponse.arrayBuffer();
    if (binary.byteLength !== manifest.binary.bytes) throw new Error('Incomplete nugget morph geometry');
    targets = manifest.shapes.map(shape => ({
      positions: new Float32Array(binary, shape.positions.byteOffset, shape.positions.count),
      normals: new Float32Array(binary, shape.normals.byteOffset, shape.normals.count),
    }));
    const length = manifest.vertexCount * 3;
    if (targets.some(target => target.positions.length !== length || target.normals.length !== length)) {
      throw new Error('Nugget morph vertex correspondence is invalid');
    }
    geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(binary, manifest.indices.byteOffset, manifest.indices.count), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(length), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(length), 3).setUsage(THREE.DynamicDrawUsage));
    mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; pose.add(mesh);
    motion.setWeight(selectedWeight, true); updateGeometry();
  }
  ready = true; phase = landing || inspection ? 'idle' : 'waiting';
  if (!landing && !inspection) {
    flight.position.y = reduced.matches ? 0 : introStartY;
    flight.rotation.y = reduced.matches ? 0 : Math.PI * 2;
  }
  present(); renderer.render(scene, camera);
  send('nugget-ready'); updateDiagnostics();
  let heroFlightFinished = false;
  renderer.setAnimationLoop(now => {
    const elapsed = Math.max((now - last) / 1000, 0), delta = Math.min(elapsed, .05); last = now;
    if (document.hidden || !visible) return;
    let spinDelta = delta;
    if (phase === 'enter') {
      const total = introElapsed + elapsed;
      introElapsed = Math.min(introDuration, total);
      const sample = sampleEntranceIntoSpin(introElapsed / introDuration, introStartY, introDuration, introYawSpeed);
      flight.position.y = sample.y;
      flight.rotation.y = sample.turn;
      if (introElapsed === introDuration) {
        finishIntro();
        rotate.seedCruise();
        spinDelta = Math.min(delta, total - introDuration);
      }
    }
    if (phase === 'idle') rotate(spinDelta);
    syncDustWind();
    const geometryChanged = !landing && motion.step(delta);
    if (geometryChanged) updateGeometry();
    const sizeChanged = !landing && sizeMotion.step(delta);
    const settlingChanged = phase === 'idle' && settleMotion.step(delta);
    idlePivot.position.y = phase === 'idle' ? settleMotion.offset : 0;
    if (hoverMouse && now >= nextHoverCheck) updateHeroHover(now);
    const hoverEase = 1 - Math.exp(-delta * 9);
    hoverPivot.rotation.x = THREE.MathUtils.lerp(hoverPivot.rotation.x, hoverTarget.x, hoverEase);
    hoverPivot.rotation.y = THREE.MathUtils.lerp(hoverPivot.rotation.y, hoverTarget.y, hoverEase);
    if (hoverPivot.scale.x !== hoverScaleTarget) {
      const scale = THREE.MathUtils.lerp(hoverPivot.scale.x, hoverScaleTarget, reduced.matches ? 1 : hoverEase);
      hoverPivot.scale.setScalar(Math.abs(scale - hoverScaleTarget) < .0001 ? hoverScaleTarget : scale);
    }
    if (sizeChanged || inspectionViewport || mobileLayout && mobileFrame) updateSize();
    if (geometryChanged || sizeChanged || settlingChanged) updateDiagnostics();
    if (now - lastDiagnostics >= (phase === 'enter' ? 80 : 250)) { updateDiagnostics(); lastDiagnostics = now; }
    renderer.render(scene, camera);
    if (heroFrame && !heroFlightFinished && revealed && !inspectionActive) {
      const progress = phase === 'idle' ? 1 : introElapsed / introDuration;
      heroFlightFinished = progress === 1;
      const offsetY = -flight.position.y * surfaceHeight / (camera.top - camera.bottom);
      heroFrame.dispatchEvent(new CustomEvent('gold-hero-flight', { detail: { progress, offsetY }, bubbles: true }));
    }
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); renderer.setAnimationLoop(null); send('nugget-error');
  });
  window.addEventListener('pagehide', () => {
    renderer.setAnimationLoop(null); resizeObserver.disconnect();
    environment.dispose?.(); material.dispose(); geometry.dispose(); renderer.dispose();
  }, { once: true });
} catch (error) {
  console.error(error); send('nugget-error');
  diagnostics.textContent = JSON.stringify({ ready: false, mode: landing ? 'landing' : 'oms', error: String(error) });
}
