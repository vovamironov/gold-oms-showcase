import * as THREE from 'three';

// Positions and signed mean curvature are object space. Grain and the polished
// shoulders stay on the surface through morphing and rotation without UVs.
const GRAIN_SHADER = /* glsl */ `
varying vec3 vNuggetPosition;
varying float vNuggetCurvature;
uniform float nuggetGrainScale;
uniform float nuggetGrainDepth;
uniform float nuggetRoughnessVariation;

float nuggetHash( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.yzx + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}

float nuggetNoise( vec3 p ) {
  vec3 cell = floor( p );
  vec3 f = fract( p );
  // Quintic interpolation keeps the grain smooth at cell boundaries.
  f = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  return mix(
    mix(
      mix( nuggetHash( cell ), nuggetHash( cell + vec3( 1, 0, 0 ) ), f.x ),
      mix( nuggetHash( cell + vec3( 0, 1, 0 ) ), nuggetHash( cell + vec3( 1, 1, 0 ) ), f.x ), f.y
    ),
    mix(
      mix( nuggetHash( cell + vec3( 0, 0, 1 ) ), nuggetHash( cell + vec3( 1, 0, 1 ) ), f.x ),
      mix( nuggetHash( cell + vec3( 0, 1, 1 ) ), nuggetHash( cell + vec3( 1, 1, 1 ) ), f.x ), f.y
    ), f.z
  );
}

vec3 nuggetPerturbNormal( vec3 surfacePosition, vec3 surfaceNormal, float height ) {
  // A surface gradient keeps the same bump depth on every orientation and
  // across beveled shoulders. No tangent attributes or UV seams are involved.
  vec3 dx = dFdx( surfacePosition );
  vec3 dy = dFdy( surfacePosition );
  vec3 r1 = cross( dy, surfaceNormal );
  vec3 r2 = cross( surfaceNormal, dx );
  float determinant = dot( dx, r1 );
  vec3 gradient = ( dFdx( height ) * r1 + dFdy( height ) * r2 )
    * sign( determinant ) / max( abs( determinant ), 1e-10 );
  return normalize( surfaceNormal - gradient );
}
`;

const GRAIN_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
vec3 nuggetP = vNuggetPosition * nuggetGrainScale;
float nuggetFootprint = max( length( dFdx( nuggetP ) ), length( dFdy( nuggetP ) ) );
// Fade frequencies which are smaller than a pixel, preventing sparkle during
// rotation or at the smaller mobile presentation size.
float nuggetSandAA = 1.0 - smoothstep( 0.45, 1.45, nuggetFootprint );
float nuggetFineAA = 1.0 - smoothstep( 0.40, 1.35, nuggetFootprint * 1.85 );
// Convex narrow shoulders catch small polished highlights. The broad faces
// keep a satin finish; actual concave folds receive slightly rougher gold.
float nuggetRidge = smoothstep( 1.0, 3.5, vNuggetCurvature );
float nuggetCavity = smoothstep( 0.08, 1.65, -vNuggetCurvature );
float nuggetHammer = nuggetNoise( nuggetP * 0.36 );
float nuggetSand = nuggetNoise( nuggetP + vec3( 12.7, 4.1, 8.9 ) );
float nuggetFine = nuggetNoise( nuggetP * 1.85 + vec3( 3.1, 17.3, 9.6 ) );
float nuggetHeight = nuggetGrainDepth * mix( 1.0, 0.25, nuggetRidge ) * (
  ( nuggetHammer - 0.5 ) * 0.24
  + ( nuggetSand - 0.5 ) * 0.76 * nuggetSandAA
  + ( nuggetFine - 0.5 ) * 0.14 * nuggetFineAA
);
roughnessFactor = clamp(
  roughnessFactor - 0.135 * nuggetRidge + 0.045 * nuggetCavity
  + nuggetRoughnessVariation * mix( 1.0, 0.25, nuggetRidge ) * (
    ( nuggetHammer - 0.5 ) * 0.45 + ( nuggetSand - 0.5 ) * 0.55 * nuggetSandAA
  ), 0.15, 0.43
);
`;

/**
 * UV-free natural gold: satin faces, polished shoulders and granular folds.
 * Curvature should be updated after the current geometry's smooth normals.
 * Dispose the returned material when the viewer is destroyed.
 */
export function createNuggetMaterial(renderer) {
  const material = new THREE.MeshPhysicalMaterial({
    name: 'OMS natural satin gold',
    color: '#efbc54',
    metalness: 1,
    roughness: 0.315,
    envMapIntensity: 1.0,
    clearcoat: 0,
    flatShading: false,
    dithering: true,
  });

  // Only ShaderMaterial declares this object by default in r161; the renderer
  // also reads it from extended physical materials.
  material.extensions = { derivatives: true };
  material.defaultAttributeValues = { nuggetCurvature: [0] };
  const uniforms = {
    nuggetGrainScale: { value: 128 },
    nuggetGrainDepth: { value: 0.00155 },
    nuggetRoughnessVariation: { value: 0.06 },
  };
  // These can be tuned without recompiling; roughness and color use the normal
  // Three.js material properties. No color noise is applied to the gold.
  material.userData.nuggetUniforms = uniforms;
  material.userData.nuggetFinish = 'natural-satin-gold-curvature-v4';

  material.onBeforeCompile = (shader) => {
    const vertexHook = '#include <project_vertex>';
    const roughnessHook = '#include <roughnessmap_fragment>';
    const normalHook = '#include <normal_fragment_maps>';
    const occlusionHook = '#include <aomap_fragment>';
    if (!shader.vertexShader.includes(vertexHook)
      || !shader.fragmentShader.includes(roughnessHook)
      || !shader.fragmentShader.includes(normalHook)
      || !shader.fragmentShader.includes(occlusionHook)) {
      throw new Error('OMS gold material expects Three.js r161 physical shader chunks.');
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'attribute float nuggetCurvature;\nvarying float vNuggetCurvature;\nvarying vec3 vNuggetPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      vertexHook, 'vNuggetPosition = transformed;\nvNuggetCurvature = nuggetCurvature;\n' + vertexHook,
    );
    shader.fragmentShader = GRAIN_SHADER + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(roughnessHook, GRAIN_ROUGHNESS);
    shader.fragmentShader = shader.fragmentShader.replace(
      normalHook,
      normalHook + '\nnormal = nuggetPerturbNormal( -vViewPosition, normal, nuggetHeight );',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      occlusionHook,
      occlusionHook + '\nreflectedLight.indirectSpecular *= mix( 1.0, 0.76, nuggetCavity );',
    );
  };
  material.customProgramCacheKey = () => 'oms-nugget-grain-curvature-r161-v4';

  // Keep the explicit renderer parameter for the viewer's factory interface.
  // r161 physical materials already use derivatives for specular antialiasing.
  if (renderer && !renderer.capabilities.isWebGL2) material.extensions.derivatives = true;
  return material;
}

/**
 * Signed cotangent mean curvature in inverse object-space units. Positive is
 * a convex shoulder, negative is a recessed fold. Call after smooth normals
 * whenever the shared morph positions change. Topology and scratch storage
 * are cached, and two light neighbor passes soften tiny tessellation spikes.
 */
export function updateNuggetCurvature(geometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal || position.count !== normal.count) {
    throw new Error('Nugget curvature requires matching positions and smooth normals.');
  }
  const count = position.count;
  const indices = geometry.index?.array;
  const indexCount = indices?.length ?? count;
  let work = geometry.userData.nuggetCurvatureWork;
  if (!work || work.count !== count || work.indices !== indices) {
    const degrees = new Uint32Array(count);
    const vertex = i => indices ? indices[i] : i;
    for (let i = 0; i < indexCount; i += 3) {
      degrees[vertex(i)] += 2; degrees[vertex(i + 1)] += 2; degrees[vertex(i + 2)] += 2;
    }
    const offsets = new Uint32Array(count + 1);
    for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + degrees[i];
    const cursors = offsets.slice(0, count);
    const neighbors = new Uint32Array(offsets[count]);
    for (let i = 0; i < indexCount; i += 3) {
      const a = vertex(i), b = vertex(i + 1), c = vertex(i + 2);
      neighbors[cursors[a]++] = b; neighbors[cursors[a]++] = c;
      neighbors[cursors[b]++] = a; neighbors[cursors[b]++] = c;
      neighbors[cursors[c]++] = a; neighbors[cursors[c]++] = b;
    }
    const attribute = new THREE.BufferAttribute(new Float32Array(count), 1);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('nuggetCurvature', attribute);
    work = {
      count, indices, offsets, neighbors, attribute,
      area: new Float64Array(count), laplacian: new Float64Array(count * 3),
      raw: new Float32Array(count), smooth: new Float32Array(count),
    };
    geometry.userData.nuggetCurvatureWork = work;
  }
  const positions = position.array, normals = normal.array;
  const { area, laplacian, raw, smooth, offsets, neighbors, attribute } = work;
  area.fill(0); laplacian.fill(0);
  for (let i = 0; i < indexCount; i += 3) {
    const a = indices ? indices[i] : i;
    const b = indices ? indices[i + 1] : i + 1;
    const c = indices ? indices[i + 2] : i + 2;
    const ai = a * 3, bi = b * 3, ci = c * 3;
    const abx = positions[bi] - positions[ai];
    const aby = positions[bi + 1] - positions[ai + 1];
    const abz = positions[bi + 2] - positions[ai + 2];
    const acx = positions[ci] - positions[ai];
    const acy = positions[ci + 1] - positions[ai + 1];
    const acz = positions[ci + 2] - positions[ai + 2];
    const bcx = acx - abx, bcy = acy - aby, bcz = acz - abz;
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    const twiceArea = Math.hypot(cx, cy, cz);
    if (twiceArea < 1e-12) continue;
    const inverseArea = 1 / twiceArea;
    // Cotangent weights recover curvature without tying it to triangle size
    // or pixel derivatives. A cap protects a temporarily flattened triangle.
    const cotA = THREE.MathUtils.clamp((abx * acx + aby * acy + abz * acz) * inverseArea, -20, 20);
    const cotB = THREE.MathUtils.clamp(-(abx * bcx + aby * bcy + abz * bcz) * inverseArea, -20, 20);
    const cotC = THREE.MathUtils.clamp((acx * bcx + acy * bcy + acz * bcz) * inverseArea, -20, 20);
    const share = twiceArea / 6;
    area[a] += share; area[b] += share; area[c] += share;
    for (let k = 0; k < 3; k++) {
      const edgeAB = cotC * (positions[ai + k] - positions[bi + k]);
      const edgeAC = cotB * (positions[ai + k] - positions[ci + k]);
      const edgeBC = cotA * (positions[bi + k] - positions[ci + k]);
      laplacian[ai + k] += edgeAB + edgeAC;
      laplacian[bi + k] += edgeBC - edgeAB;
      laplacian[ci + k] -= edgeAC + edgeBC;
    }
  }
  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const signed = (laplacian[p] * normals[p]
      + laplacian[p + 1] * normals[p + 1]
      + laplacian[p + 2] * normals[p + 2]) / Math.max(4 * area[i], 1e-12);
    raw[i] = THREE.MathUtils.clamp(signed, -4, 8);
  }
  const soften = (from, to) => {
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let j = offsets[i]; j < offsets[i + 1]; j++) sum += from[neighbors[j]];
      const degree = offsets[i + 1] - offsets[i];
      to[i] = degree ? from[i] * 0.65 + (sum / degree) * 0.35 : from[i];
    }
  };
  soften(raw, smooth); soften(smooth, attribute.array);
  attribute.needsUpdate = true;
  let min = Infinity, max = -Infinity, sum = 0, ridges = 0, cavities = 0;
  for (const value of attribute.array) {
    min = Math.min(min, value); max = Math.max(max, value); sum += value;
    if (value > 1) ridges++;
    if (value < -0.08) cavities++;
  }
  geometry.userData.nuggetCurvatureStats = {
    min, max, mean: sum / count,
    ridgeFraction: ridges / count, cavityFraction: cavities / count,
  };
  return attribute;
}

function studioPanel(scene, resources, position, size, radiance, name, gradient = false) {
  const geometry = new THREE.PlaneGeometry(size[0], size[1]);
  // A basic material is an unlit emissive surface in the reflection capture.
  // Values above one retain HDR cream-white reflections through tone mapping.
  const material = gradient
    ? new THREE.ShaderMaterial({
      uniforms: { studioRadiance: { value: new THREE.Color().setRGB(...radiance) } },
      side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: /* glsl */ `
        varying vec2 vStudioUv;
        void main() {
          vStudioUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 studioRadiance;
        varying vec2 vStudioUv;
        void main() {
          // A luminous diffuser with a soft, off-center hotspot. Flat facets
          // reflect a gradation of honey and cream instead of a white slab.
          vec2 p = ( vStudioUv - vec2( 0.30, 0.68 ) ) * vec2( 1.50, 1.25 );
          float glow = 0.30 + 0.70 * exp( -3.0 * dot( p, p ) );
          vec2 edgeDistance = min( vStudioUv, 1.0 - vStudioUv );
          float edge = smoothstep( 0.0, 0.12, min( edgeDistance.x, edgeDistance.y ) );
          gl_FragColor = vec4( studioRadiance * glow * ( 0.22 + 0.78 * edge ), 1.0 );
        }
      `,
    })
    : new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(...radiance),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
  const panel = new THREE.Mesh(geometry, material);
  panel.name = name;
  panel.position.set(...position);
  panel.lookAt(0, 0, 0);
  scene.add(panel);
  resources.push(geometry, material);
}

/**
 * Capture a small HDR studio and prefilter it for the nugget's metal finish.
 * Assign result.texture to scene.environment, keeping the page background
 * separate. There is no image request. The retained PMREM is 1.5 MiB.
 */
export function createNuggetEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color().setRGB(0.24, 0.24, 0.225);
  const resources = [];

  // One dominant diffuser lets broad faces read as grainy gold. A restrained
  // vertical strip picks out polished shoulders instead of whitening every
  // direction, while the lower fill leaves real depth inside recessed folds.
  studioPanel(studio, resources, [-3.6, 4.5, 6.6], [8.5, 10.0], [7.4, 7.15, 6.55], 'Large gradient cream key', true);
  studioPanel(studio, resources, [1.0, -0.7, 8.0], [8.0, 5.0], [2.9, 2.85, 2.65], 'Broad neutral front fill', true);
  studioPanel(studio, resources, [5.5, 2.0, 3.0], [1.4, 7.0], [4.9, 4.75, 4.4], 'Narrow cream edge strip');
  studioPanel(studio, resources, [0.4, 7.8, -1.3], [5.0, 3.0], [2.2, 2.15, 1.92], 'Soft overhead bounce');
  studioPanel(studio, resources, [-4.8, 2.2, -5.5], [2.6, 5.6], [1.4, 1.4, 1.3], 'Subtle rear rim');
  studioPanel(studio, resources, [0.0, -7.0, 2.0], [10.0, 9.0], [0.9, 0.88, 0.83], 'Neutral floor bounce');

  // Dark neutral flags create clean boundaries between broad metal reflections.
  // They are gray rather than brown, so the shadowed gold retains its hue.
  studioPanel(studio, resources, [5.6, -0.8, -3.6], [5.5, 10.0], [0.025, 0.026, 0.023], 'Right dark flag');
  studioPanel(studio, resources, [-7.0, -2.0, 1.0], [3.0, 8.0], [0.048, 0.05, 0.043], 'Left dark flag');
  studioPanel(studio, resources, [0.0, 0.0, -8.0], [4.0, 10.0], [0.058, 0.06, 0.052], 'Rear contrast strip');

  // PMREM.fromScene uses a fixed 256 px cube in r161. Capturing the same scene
  // at 128 px keeps the final half-float PMREM at 384 × 512 (1.5 MiB), more than
  // enough for the broad diffuser and the softly rough gold finish.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(128, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.LinearSRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  const captureCamera = new THREE.CubeCamera(0.1, 40, cubeTarget);
  const generator = new THREE.PMREMGenerator(renderer);
  const previousToneMapping = renderer.toneMapping;
  const previousAutoClear = renderer.autoClear;
  let target;
  try {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = true;
    captureCamera.update(renderer, studio);
    target = generator.fromCubemap(cubeTarget.texture);
    target.texture.name = 'OMS procedural gold studio';
  } finally {
    renderer.toneMapping = previousToneMapping;
    renderer.autoClear = previousAutoClear;
    generator.dispose();
    cubeTarget.dispose();
    resources.forEach((resource) => resource.dispose());
  }

  let disposed = false;
  return {
    texture: target.texture,
    dispose() {
      if (!disposed) {
        target.dispose();
        disposed = true;
      }
    },
  };
}
