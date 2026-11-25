export function sampleEntranceIntoSpin(progress, startY, duration, yawSpeed) {
  const remaining = 1 - progress;
  const travel = .65 * remaining ** 4 + .35 * remaining ** 2;
  // Carry the steady spin speed through the last frame of the flight.
  const carry = yawSpeed * duration * progress ** 3 * remaining;
  return { y: startY * travel, turn: -Math.sign(yawSpeed) * Math.PI * 2 * travel - carry };
}
