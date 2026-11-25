// A small floating response begins with the input and keeps its inertia on retarget.
export function createSettleMotion() {
  const depth = .032;
  const descent = .45;
  const frequency = 6;
  let holdRemaining = 0, offset = 0, velocity = 0, active = false, pulseCount = 0, peakOffset = 0;
  const advance = (delta, target) => {
    const displacement = offset - target;
    const drift = velocity + frequency * displacement;
    const decay = Math.exp(-frequency * delta);
    offset = target + (displacement + drift * delta) * decay;
    velocity = (velocity - frequency * drift * delta) * decay;
    peakOffset = Math.min(peakOffset, offset);
  };

  return {
    trigger() {
      // Refresh the downward target without restarting position or velocity.
      holdRemaining = descent;
      active = true;
      peakOffset = offset;
      pulseCount++;
    },
    reset() { holdRemaining = 0; offset = 0; velocity = 0; active = false; peakOffset = 0; },
    step(delta) {
      if (!active) return false;
      const dt = Math.min(Math.max(delta, 0), .05);
      const downwardTime = Math.min(holdRemaining, dt);
      if (downwardTime > 0) {
        advance(downwardTime, -depth);
        holdRemaining = Math.max(0, holdRemaining - downwardTime);
      }
      if (dt > downwardTime) advance(dt - downwardTime, 0);
      if (holdRemaining === 0 && Math.abs(offset) < .00001 && Math.abs(velocity) < .00005) {
        offset = 0; velocity = 0; active = false;
      }
      return true;
    },
    get offset() { return offset; },
    get active() { return active; },
    get phase() { return !active ? 'rest' : holdRemaining > 0 ? 'down' : 'return'; },
    get pulseCount() { return pulseCount; },
    get peakOffset() { return peakOffset; },
    get depth() { return depth; },
  };
}
