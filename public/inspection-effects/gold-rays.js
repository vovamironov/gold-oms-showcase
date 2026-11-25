import * as THREE from 'three';

const vertexShader = `
  uniform float uTime;
  uniform float uCoverage;
  uniform float uBottomBleed;
  varying vec2 vUv;
  varying vec4 vBrightness;
  varying vec4 vBeamSlope;

  void main() {
    float screenY = uv.y * (uCoverage + uBottomBleed);
    vUv = vec2(uv.x, (screenY - uBottomBleed) / uCoverage);
    // Evaluate the slow pulses once per vertex. Each beam has its own rhythm.
    vec4 time = uTime * vec4(.72, .91, .61, .79) + vec4(.4, 2.8, 4.1, 1.7);
    vBrightness = .94 + .23 * sin(time) + .08 * sin(time * .47 + 1.0);
    // Pivot each ray around its fixed source at the bottom of the scene.
    vec4 sway = sin(uTime * vec4(.52, .63, .47, .56));
    vBeamSlope = vec4(-.29, -.06, .14, .30) + sway * vec4(.064, -.046, .059, -.052);
    gl_Position = vec4(position.x, screenY * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const fragmentShader = `
  uniform float uAspect;
  uniform float uOpacity;
  uniform float uAmberPalette;
  varying vec2 vUv;
  varying vec4 vBrightness;
  varying vec4 vBeamSlope;

  float beam(vec2 point, float source, float slope, float width, float reach) {
    float distanceFromAxis = (point.x - source - point.y * slope) / width;
    float falloff = 1.0 - smoothstep(.04, reach, point.y);
    return exp2(-1.65 * distanceFromAxis * distanceFromAxis) * falloff;
  }

  void main() {
    // Keep the same beam axis through the visible edge and the toolbar bleed.
    vec2 point = vec2((vUv.x - .5) * uAspect, vUv.y);
    float growth = .65 * point.y;
    float spread = point.y < 0.0 ? 1.0 / (1.0 - growth) : 1.0 + growth;
    float rays = .22 * vBrightness.x * beam(point, -.17, vBeamSlope.x, .066 * spread, .82);
    rays += .23 * vBrightness.y * beam(point, -.07, vBeamSlope.y, .036 * spread, .93);
    rays += .26 * vBrightness.z * beam(point,  .03, vBeamSlope.z, .050 * spread, .88);
    rays += .18 * vBrightness.w * beam(point,  .16, vBeamSlope.w, .070 * spread, .73);

    vec2 haloPoint = vec2((point.x + .025) * 1.45, point.y);
    float halo = .32 * exp2(-5.8 * dot(haloPoint, haloPoint));
    float alpha = (halo + rays) * (1.0 - smoothstep(.72, 1.0, point.y));
    vec3 gold = mix(vec3(.84, .49, .09), vec3(1.0, .78, .30), smoothstep(.07, .60, alpha));
    vec3 amber = mix(vec3(.89, .72, .07), vec3(1.0, .55, .045), smoothstep(-.26, .26, point.x));
    amber *= mix(.72, 1.0, smoothstep(.04, .53, alpha));
    gold = mix(gold, amber, uAmberPalette);
    float underToolbar = 1.0 - .18 * smoothstep(0.0, .32, -vUv.y);
    gl_FragColor = vec4(gold, alpha * uOpacity * underToolbar);
  }
`;

export function createGoldRays(scene, amberPalette = false, visibleOnFirstFrame = false) {
  const uniforms = {
    uTime: { value: 0 }, uCoverage: { value: .64 }, uAspect: { value: 1 }, uOpacity: { value: 0 },
    uAmberPalette: { value: Number(amberPalette) }, uBottomBleed: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false,
  });
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  rays.frustumCulled = false;
  rays.renderOrder = -1;
  scene.add(rays);

  return {
    resize(width, height, sceneHeight, bottomBleed, reach = 1) {
      // The light source is at the visible scene's edge, with a continuation under Safari's toolbar.
      uniforms.uCoverage.value = .64 * reach * sceneHeight / height;
      uniforms.uAspect.value = THREE.MathUtils.clamp(width / sceneHeight, .68, 1.7);
      uniforms.uBottomBleed.value = bottomBleed / height;
    },
    update(time, reducedMotion) {
      uniforms.uTime.value = time;
      const progress = reducedMotion || visibleOnFirstFrame ? 1 : Math.min(time / .38, 1);
      uniforms.uOpacity.value = progress * progress * (3 - 2 * progress);
    },
    dispose() {
      scene.remove(rays);
      rays.geometry.dispose();
      material.dispose();
    },
  };
}
