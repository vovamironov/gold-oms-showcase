// =============================================================================
// background.js — gold-dust particles + radial glow billboard
// =============================================================================
//
// Two visual elements that sit behind the gold bar:
//
//   1. A field of ~100 points (`THREE.Points`) using a custom GLSL shader pair.
//      Each point has its own size, color tint, animation phase and speed, and
//      drifts in a sinusoidal noise pattern. Rendered with additive blending
//      so it reads as glowing dust, not opaque dots.
//
//   2. A camera-facing flat plane behind the bar with a radial-falloff shader
//      that softly pulses. Acts as a halo so the bar's silhouette has a warm
//      surround rather than sitting on raw black.
//
// Public API (returned by `createBackground`):
//   update(time)        feed the elapsed seconds to the shader uniforms
//   setPixelRatio(r)    on devicePixelRatio change
//   setParam(name, v)   live-tweak a single parameter (used by setTheme)
//   setTheme(theme)     swap to the dark/light parameter preset
//   rebuildParticles()  reseed positions/colors for the current camera/aspect
//   fitToView()         call after camera or canvas resize
//   dispose()           release GPU resources
// =============================================================================

import * as THREE from "three";

// Dark-theme defaults. The bar always wears the dark look unless Swift calls
// `setTheme('light')` — see `viewer.js` for the bridge.
export const DEFAULT_BACKGROUND_PARAMS = {
  count: 100,
  sizeScale: 0.09,
  driftSpeed: 2,
  driftAmount: 1,
  twinkle: 1,
  hueWarmth: 0,
  particleBrightness: 1.35,
  glowIntensity: 0,
  glowPulseSpeed: 0.91,
  glowColor: "#ffb347",
};

// Light-theme overrides: warmer, softer, far fewer particles so they don't fight
// the cream renderer clear. Additive blending against a bright base is dim, so
// the glow leans on a saturated warm tint at moderate intensity to read as a
// gentle radial warm wash behind the bar.
export const LIGHT_BACKGROUND_OVERRIDES = {
  count: 140,
  sizeScale: 0.18,
  twinkle: 0.6,
  hueWarmth: 0.8,
  particleBrightness: 0.68,
  glowIntensity: 0,
  glowColor: "#ffc98a",
};

// -----------------------------------------------------------------------------
// Particle shader pair
// -----------------------------------------------------------------------------
// Vertex shader:
//   • drives each point along a per-particle noise drift (three sine/cos pairs
//     scaled by `aSpeed` and offset by `aPhase`),
//   • computes a twinkle factor that the fragment shader uses to modulate
//     opacity,
//   • sizes each `gl_PointSize` in pixels, scaled by distance so distant
//     particles correctly shrink (`260.0 / -mv.z` is the perspective term).
//
// Fragment shader:
//   • turns `gl_PointCoord` (0..1 across the point) into a soft round splat
//     via a power-curved smoothstep — this is the cheap, no-texture way to
//     get a circular gaussian-looking point.
// -----------------------------------------------------------------------------
const PARTICLE_VS = `
  attribute vec3  aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSizeMul;
  uniform float uSpeedMul;
  uniform float uDriftMul;
  uniform float uTwinkleMul;
  uniform vec2 uWind;

  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;

    float t = uTime * aSpeed * uSpeedMul;
    vec3 drift = vec3(
      sin(t * 0.50 + aPhase)        * 0.40 + cos(t * 0.18 + aPhase * 2.7) * 0.20,
      cos(t * 0.40 + aPhase * 1.3)  * 0.50 + sin(t * 0.13 + aPhase * 3.1) * 0.25,
      sin(t * 0.30 + aPhase * 0.9)  * 0.30
    );
    pos += drift * uDriftMul;

    float windStrength = length(uWind);
    if (windStrength > 0.0001) {
      vec2 windDirection = uWind / windStrength;
      vec2 windNormal = vec2(-windDirection.y, windDirection.x);
      float crossDistance = abs(dot(pos.xy, windNormal));
      float alongDistance = dot(pos.xy, windDirection);
      float corridor = 1.0 - smoothstep(0.65, 1.9, crossDistance);
      float wakeStart = smoothstep(-1.1, -0.15, alongDistance);
      float wakeEnd = 1.0 - smoothstep(2.0, 5.2, alongDistance);
      float depthMask = 1.0 - smoothstep(2.2, 5.5, abs(pos.z));
      float individuality =
        0.18 + 0.82 * smoothstep(0.18, 0.88, 0.5 + 0.5 * sin(aPhase * 2.31));
      float hitMask = corridor * wakeStart * wakeEnd * depthMask * individuality;
      vec2 turbulence = windNormal * sin(aPhase * 3.7 + uTime * 2.0) * 0.12;
      pos.xy += (windDirection + turbulence) * windStrength * hitMask;
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float s = 0.5 + 0.5 * sin(uTime * 1.4 * aSpeed + aPhase * 4.0);
    float twinkle = pow(s, 2.5);
    vAlpha = mix(0.82, 0.45 + 0.55 * twinkle, uTwinkleMul);

    float perspective = clamp(260.0 / -mv.z, 18.0, 52.0);
    gl_PointSize = aSize * uSizeMul * uPixelRatio * perspective;
    vColor = aColor;
  }
`;

const PARTICLE_FS = `
  varying vec3  vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float a = pow(smoothstep(0.5, 0.0, d), 2.5);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

// -----------------------------------------------------------------------------
// Glow billboard shader pair
// -----------------------------------------------------------------------------
// A 1x1 plane behind the bar, scaled to overflow the viewport. The fragment
// shader paints a soft radial falloff and pulses the brightness via a sine
// driven by `uTime`. Additive blending against the dark scene gives the warm
// halo around the bar.
// -----------------------------------------------------------------------------
const GLOW_VS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FS = `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uPulseSpeed;
  varying vec2  vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p);
    float glow = pow(smoothstep(0.5, 0.0, d), 1.4);
    float pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(uTime * uPulseSpeed));
    vec3 col = uColor * glow * pulse * uIntensity;
    gl_FragColor = vec4(col, glow * pulse * 0.5);
  }
`;

// Visible width/height of the frustum at world-space z (camera assumed to look down -Z).
// Used to size both the particle spawn rectangle at each depth and the glow plane.
function viewExtentAtZ(camera, worldZ) {
  const dist = Math.abs(camera.position.z - worldZ);
  const vFov = (camera.fov * Math.PI) / 180;
  const height = 2 * dist * Math.tan(vFov / 2);
  const width  = height * camera.aspect;
  return { width, height };
}

// -----------------------------------------------------------------------------
// Particle geometry builder
// -----------------------------------------------------------------------------
// Builds one `THREE.BufferGeometry` with five per-vertex attributes:
//
//   position   xyz spawn point inside a frustum-shaped volume in front of the
//              camera. Each particle's z is randomized between `nearZ`/`farZ`,
//              then x/y get fitted to the visible viewport at that z (with a
//              small overscan margin so dust spills off-screen rather than
//              clipping at the edges).
//   aColor     per-particle warm tint. `hueWarmth` slides the green/blue
//              channels down so higher warmth = oranger.
//   aSize      base size in shader units. The `r*r*r` weighting biases the
//              distribution toward small specks with occasional big highlights.
//   aPhase     random offset so every particle drifts and twinkles on its own
//              schedule.
//   aSpeed     individual time multiplier so the field doesn't feel uniform.
// -----------------------------------------------------------------------------
function buildParticleGeometry(count, hueWarmth, particleBrightness, camera) {
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const phases    = new Float32Array(count);
  const speeds    = new Float32Array(count);

  const nearZ   = camera.position.z - 2;
  const farZ    = camera.position.z - 14;
  const overscan = 1.4;

  for (let i = 0; i < count; i++) {
    const z = nearZ + (farZ - nearZ) * Math.random();
    const ext = viewExtentAtZ(camera, z);
    positions[i * 3 + 0] = (Math.random() - 0.5) * ext.width  * overscan;
    positions[i * 3 + 1] = (Math.random() - 0.5) * ext.height * overscan;
    positions[i * 3 + 2] = z;

    const r = Math.random();
    sizes[i]  = 0.35 + r * r * r * 1.1;
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.15 + Math.random() * 0.55;

    const t = Math.random();
    const warm = hueWarmth;
    colors[i * 3 + 0] = (0.46 + t * 0.14) * particleBrightness;
    colors[i * 3 + 1] =
      (0.2 + t * 0.12) * (1.0 - warm * 0.12) * particleBrightness;
    colors[i * 3 + 2] =
      (0.012 + t * 0.025) * (1.0 - warm * 0.3) * particleBrightness;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("aColor",   new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("aSize",    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute("aPhase",   new THREE.BufferAttribute(phases, 1));
  geo.setAttribute("aSpeed",   new THREE.BufferAttribute(speeds, 1));
  return geo;
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------
// Builds and adds both the particle system and the glow plane to the scene,
// returning the public API the viewer calls each frame and on resize/theme
// changes.
// -----------------------------------------------------------------------------
export function createBackground(scene, renderer, camera, overrides = {}) {
  const params = { ...DEFAULT_BACKGROUND_PARAMS, ...overrides };

  // ShaderMaterial — explicit GLSL pair plus a uniforms dictionary. `transparent`
  // + `depthWrite:false` lets multiple particles add into the same pixel without
  // their order along Z causing flicker, and additive blending gives the bright
  // overlap halo.
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSizeMul:    { value: params.sizeScale },
      uSpeedMul:   { value: params.driftSpeed },
      uDriftMul:   { value: params.driftAmount },
      uTwinkleMul: { value: params.twinkle },
      uWind:       { value: new THREE.Vector2() },
    },
    vertexShader: PARTICLE_VS,
    fragmentShader: PARTICLE_FS,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
  });

  let particles = new THREE.Points(
    buildParticleGeometry(
      params.count,
      params.hueWarmth,
      params.particleBrightness,
      camera
    ),
    particleMaterial
  );
  particles.frustumCulled = false;
  particles.renderOrder = 10;
  scene.add(particles);

  // The particle field is reseeded (not just retinted) when `count` or
  // `hueWarmth` change, because both are baked into the geometry attributes.
  function rebuildParticles() {
    scene.remove(particles);
    particles.geometry.dispose();
    particles = new THREE.Points(
      buildParticleGeometry(
        params.count,
        params.hueWarmth,
        params.particleBrightness,
        camera
      ),
      particleMaterial
    );
    particles.frustumCulled = false;
    particles.renderOrder = 10;
    scene.add(particles);
  }

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime:       { value: 0 },
      uColor:      { value: new THREE.Color(params.glowColor) },
      uIntensity:  { value: params.glowIntensity },
      uPulseSpeed: { value: params.glowPulseSpeed },
    },
    vertexShader: GLOW_VS,
    fragmentShader: GLOW_FS,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // Vertical glow billboard placed behind the bar at scene center. It reads as a
  // soft halo wrapping the silhouette rather than a ground flare.
  const glowZ = -2;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMaterial);
  glow.position.set(0, 0, glowZ);
  glow.visible = params.glowIntensity > 0;
  scene.add(glow);

  function fitGlow() {
    // Size the billboard to cover most of the visible viewport at its depth, with
    // overscan so the shader's radial alpha falloff reaches zero off-screen.
    const ext = viewExtentAtZ(camera, glowZ);
    const size = Math.max(Math.max(ext.width, ext.height) * (4 / 1.5), 4 / 1.5) * 0.5;
    glow.scale.set(size, size, 1);
  }
  fitGlow();

  // Single entry point for live parameter changes — uniform-only tweaks update
  // in place; structural tweaks (count, warmth) trigger a full geometry rebuild.
  function setParam(name, value) {
    if (params[name] === value) return;
    params[name] = value;
    switch (name) {
      case "sizeScale":      particleMaterial.uniforms.uSizeMul.value    = value; break;
      case "driftSpeed":     particleMaterial.uniforms.uSpeedMul.value   = value; break;
      case "driftAmount":    particleMaterial.uniforms.uDriftMul.value   = value; break;
      case "twinkle":        particleMaterial.uniforms.uTwinkleMul.value = value; break;
      case "glowIntensity":
        glowMaterial.uniforms.uIntensity.value = value;
        glow.visible = value > 0;
        break;
      case "glowPulseSpeed": glowMaterial.uniforms.uPulseSpeed.value     = value; break;
      case "glowColor":      glowMaterial.uniforms.uColor.value.set(value); break;
      case "count":
      case "hueWarmth":
      case "particleBrightness":
        rebuildParticles();
        break;
    }
  }

  function update(time) {
    particleMaterial.uniforms.uTime.value = time;
    glowMaterial.uniforms.uTime.value     = time;
  }

  function setPixelRatio(ratio) {
    particleMaterial.uniforms.uPixelRatio.value = ratio;
  }

  function setVisible(isVisible) {
    particles.visible = isVisible;
  }

  function setWind(x, y) {
    particleMaterial.uniforms.uWind.value.set(x, y);
  }

  // Call after camera aspect/FOV changes so the particle field and ground glow
  // re-fit to the current viewport.
  function fitToView() {
    rebuildParticles();
    fitGlow();
  }

  function dispose() {
    scene.remove(particles);
    scene.remove(glow);
    particles.geometry.dispose();
    particleMaterial.dispose();
    glow.geometry.dispose();
    glowMaterial.dispose();
  }

  let activeTheme = "dark";
  function setTheme(theme) {
    const nextTheme = theme === "light" ? "light" : "dark";
    if (nextTheme === activeTheme) return;
    activeTheme = nextTheme;
    const target = nextTheme === "light"
      ? { ...DEFAULT_BACKGROUND_PARAMS, ...LIGHT_BACKGROUND_OVERRIDES }
      : DEFAULT_BACKGROUND_PARAMS;
    // setParam for "count" / "hueWarmth" rebuilds particles, which is what we
    // want when crossing themes since the color tint is baked into the geometry.
    setParam("hueWarmth", target.hueWarmth);
    setParam("particleBrightness", target.particleBrightness);
    setParam("count", target.count);
    setParam("sizeScale", target.sizeScale);
    setParam("twinkle", target.twinkle);
    setParam("glowIntensity", target.glowIntensity);
    setParam("glowColor", target.glowColor);
  }

  return {
    params,
    update,
    setPixelRatio,
    setParam,
    setTheme,
    setVisible,
    setWind,
    rebuildParticles,
    fitToView,
    dispose,
  };
}
