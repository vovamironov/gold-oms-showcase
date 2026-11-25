const MAX_FRAME_SECONDS = .05;
const POSITION_EPSILON = .00001;
const VELOCITY_EPSILON = .0001;

/** Smooth sparse gesture packets without moving the cloud on message arrival. */
export function createDustWindMotion({ frequency = 18, maxInput = .8, staleAfter = .25 } = {}) {
  const rate = Number.isFinite(frequency) && frequency > 0 ? frequency : 18;
  const limit = Number.isFinite(maxInput) && maxInput >= 0 ? maxInput : .8;
  const expiry = Number.isFinite(staleAfter) && staleAfter >= 0 ? staleAfter : .25;
  let x = 0, y = 0, velocityX = 0, velocityY = 0;
  let targetX = 0, targetY = 0, age = Infinity;

  function setTarget(horizontal = 0, vertical = 0) {
    targetX = Number.isFinite(horizontal) ? horizontal : 0;
    targetY = Number.isFinite(vertical) ? vertical : 0;
    // Normalize by the largest component first, including very large finite
    // packets whose direct hypot could overflow.
    const largest = Math.max(Math.abs(targetX), Math.abs(targetY));
    if (largest > 0) {
      const normalizedLength = Math.hypot(targetX / largest, targetY / largest);
      if (largest > limit / normalizedLength) {
        const scale = (limit / largest) / normalizedLength;
        targetX *= scale;
        targetY *= scale;
      }
    }
    age = 0;
  }

  function advance(delta) {
    if (delta <= 0) return;
    const duration = rate * delta;
    // The exponential is negligible here. Avoid inf * 0 for extreme settings.
    if (duration > 50) {
      x = targetX; y = targetY; velocityX = velocityY = 0;
      return;
    }
    const decay = Math.exp(-duration);
    const errorX = x - targetX, errorY = y - targetY;
    const changeX = (velocityX + rate * errorX) * delta;
    const changeY = (velocityY + rate * errorY) * delta;
    x = targetX + (errorX + changeX) * decay;
    y = targetY + (errorY + changeY) * decay;
    velocityX = (velocityX - rate * changeX) * decay;
    velocityY = (velocityY - rate * changeY) * decay;
  }

  function settle() {
    if (Math.hypot(x - targetX, y - targetY) < POSITION_EPSILON &&
      Math.hypot(velocityX, velocityY) < VELOCITY_EPSILON) {
      x = targetX; y = targetY; velocityX = velocityY = 0;
    }
  }

  function step(deltaSeconds) {
    const elapsed = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    if (!elapsed) return { x, y };
    const delta = Math.min(elapsed, MAX_FRAME_SECONDS), previousAge = age;
    age += elapsed;
    if (elapsed <= MAX_FRAME_SECONDS && previousAge < expiry && age >= expiry) {
      // Split exactly at expiry so 30/60/120/240 Hz produce the same curve.
      const beforeExpiry = Math.max(0, Math.min(delta, expiry - previousAge));
      advance(beforeExpiry);
      targetX = targetY = 0;
      advance(delta - beforeExpiry);
    } else {
      // A long inactive gap must not replay a gesture that has already expired.
      if (age >= expiry) targetX = targetY = 0;
      advance(delta);
    }
    settle();
    return { x, y };
  }

  function reset() {
    x = y = targetX = targetY = velocityX = velocityY = 0;
    age = Infinity;
  }

  return {
    setTarget, step, reset,
    state: () => ({ x, y, targetX, targetY, velocityX, velocityY }),
  };
}
