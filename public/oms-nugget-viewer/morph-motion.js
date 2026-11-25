// Retargeting keeps the currently displayed shape and its velocity.
export function createMorphMotion(stageCount, initialWeight = 1) {
  const weights = new Float64Array(stageCount);
  const velocities = new Float64Array(stageCount);
  const target = new Float64Array(stageCount);
  const frequency = 14;
  let destination = 1;
  let settled = true;

  function setWeight(weight, instant = false) {
    destination = Math.min(stageCount, Math.max(1, Number(weight) || 1));
    target.fill(0);
    const index = destination - 1;
    const lower = Math.floor(index), upper = Math.ceil(index);
    target[lower] = 1 - (index - lower);
    if (upper !== lower) target[upper] = index - lower;
    settled = weights.every((value, i) => Math.abs(value - target[i]) < 1e-6)
      && velocities.every(value => Math.abs(value) < 1e-6);
    if (instant) { weights.set(target); velocities.fill(0); settled = true; }
  }

  function step(delta) {
    if (settled) return false;
    const dt = Math.min(Math.max(delta, 0), .05);
    const decay = Math.exp(-frequency * dt);
    let mass = 0, velocitySum = 0, error = 0;
    for (let i = 0; i < stageCount; i++) {
      const offset = weights[i] - target[i];
      const drift = velocities[i] + frequency * offset;
      const next = target[i] + (offset + drift * dt) * decay;
      // Protect the convex blend against roundoff and repeated retargets.
      weights[i] = Math.min(1, Math.max(0, next));
      velocities[i] = next < 0 || next > 1 ? 0
        : (velocities[i] - frequency * drift * dt) * decay;
      mass += weights[i]; velocitySum += velocities[i];
    }
    for (let i = 0; i < stageCount; i++) {
      weights[i] /= mass;
      velocities[i] -= weights[i] * velocitySum;
      error = Math.max(error, Math.abs(weights[i] - target[i]), Math.abs(velocities[i]));
    }
    if (error < .0001) { weights.set(target); velocities.fill(0); settled = true; }
    return true;
  }

  setWeight(initialWeight, true);
  return {
    weights, setWeight, step,
    get settled() { return settled; },
    get destination() { return destination; },
    get coordinate() { return weights.reduce((sum, value, i) => sum + value * (i + 1), 0); },
  };
}
