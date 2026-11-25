import test from 'node:test';
import assert from 'node:assert/strict';
import { nuggetMorphForWeight, nuggetScaleForWeight, staticNuggetForWeight } from '../public/oms-hero-lab-v2/nugget-growth.js';
import { weightForBudget, weightToPosition, morphWeightForWeight } from '../public/oms-hero-lab-v2/weight-scale.js';
import { displayScaleOverride, sizeCoordinateFor, displayScaleForCoordinate, legacyDisplayScale } from '../public/oms-nugget-viewer/display-scale.js';
import { createMorphMotion } from '../public/oms-nugget-viewer/morph-motion.js';

const weights = [...Array.from({ length: 100 }, (_, i) => (i + 1) / 10), ...Array.from({ length: 990 }, (_, i) => i + 11)];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≠ ${expected}`);

test('both endpoint shapes and their accepted visible sizes are preserved', () => {
  assert.equal(nuggetMorphForWeight(.1), 1);
  assert.equal(nuggetMorphForWeight(1000), 10);
  assert.equal(nuggetScaleForWeight(.1), .65);
  assert.equal(nuggetScaleForWeight(1000), 1.1);
});

test('every supported weight advances shape and size without an initial dead range', () => {
  let previousShape = -Infinity, previousSize = -Infinity;
  const stages = new Set();
  for (const weight of weights) {
    const shape = nuggetMorphForWeight(weight), size = nuggetScaleForWeight(weight);
    assert.ok(shape > previousShape && size > previousSize, `non-increasing at ${weight} g`);
    assert.ok(size >= .65 && size <= 1.1 && shape >= 1 && shape <= 10);
    if (weight < 1000) assert.ok(shape < 10 && size < 1.1);
    stages.add(Math.floor(shape)); stages.add(Math.ceil(shape));
    previousShape = shape; previousSize = size;
  }
  assert.equal(stages.size, 10);
  assert.ok(nuggetMorphForWeight(.2) > 1);
});

test('500 thousand to one million gains about 5.5% linear size, with a clear shape change', () => {
  const smaller = weightForBudget(500_000, 10_765.26), larger = weightForBudget(1_000_000, 10_765.26);
  assert.equal(smaller, 46); assert.equal(larger, 92);
  const ratio = nuggetScaleForWeight(larger) / nuggetScaleForWeight(smaller);
  assert.ok(ratio > 1.05 && ratio < 1.06);
  assert.ok(ratio ** 2 > 1.11 && ratio ** 2 < 1.12);
  assert.ok(nuggetMorphForWeight(larger) - nuggetMorphForWeight(smaller) > .8);
});

test('visual sensitivity stays smooth across the 10 gram precision seam', () => {
  const before = (nuggetScaleForWeight(10) - nuggetScaleForWeight(9.9)) / .1;
  const after = nuggetScaleForWeight(11) - nuggetScaleForWeight(10);
  assert.ok(after / before > .9 && after / before < 1.05);
  // The input rail and legacy public hero still use their original contract.
  assert.equal(weightToPosition(10), 1000);
  near(morphWeightForWeight(10), 5.05);
});

test('out-of-range weights saturate and cannot distort the object', () => {
  for (const value of [NaN, undefined, -Infinity, -1, 0]) {
    assert.equal(nuggetScaleForWeight(value), .65);
    assert.equal(nuggetMorphForWeight(value), 1);
  }
  for (const value of [Infinity, 1001, 500_000]) {
    assert.equal(nuggetScaleForWeight(value), 1.1);
    assert.equal(nuggetMorphForWeight(value), 10);
  }
});

test('static renders compensate their baked size, including weights sharing a cached frame', () => {
  let sharedFrames = 0, previous;
  for (const weight of weights) {
    const frame = staticNuggetForWeight(weight);
    assert.ok(Number.isInteger(frame.index) && frame.index >= 1 && frame.index <= 100);
    if (weight < 1000) assert.ok(frame.index < 100);
    near(legacyDisplayScale(frame.index / 10) * frame.scale, nuggetScaleForWeight(weight));
    if (previous?.index === frame.index) {
      assert.ok(frame.scale > previous.scale);
      sharedFrames++;
    }
    previous = frame;
  }
  assert.ok(sharedFrames > 500);
  assert.deepEqual(staticNuggetForWeight(.1), { index: 1, scale: 1 });
  assert.deepEqual(staticNuggetForWeight(1000), { index: 100, scale: 1 });
});

test('missing or invalid size overrides preserve legacy clients, valid overrides stay within bounds', () => {
  for (const override of [null, undefined, '', ' ', NaN, Infinity, 'invalid', false, {}, []]) {
    assert.equal(displayScaleOverride(override), null);
    for (const weight of [.1, 1, 5.05, 10]) {
      near(displayScaleForCoordinate(sizeCoordinateFor(weight, override)), .65 + .45 * (weight - .1) / 9.9);
    }
  }
  assert.equal(displayScaleOverride(-1), .65);
  assert.equal(displayScaleOverride(3), 1.1);
  for (const scale of [.65, .75, .9, 1.1]) {
    for (const shape of [1, 4, 10]) near(displayScaleForCoordinate(sizeCoordinateFor(shape, scale)), scale);
  }
});

test('rapid forward/reverse size retargets stay continuous and within accepted bounds', () => {
  const motion = createMorphMotion(2, sizeCoordinateFor(1, .65));
  for (const weight of [1000, 46, 92, .1, 500, 1, 1000, .1]) {
    const before = motion.coordinate;
    motion.setWeight(sizeCoordinateFor(nuggetMorphForWeight(weight), nuggetScaleForWeight(weight)));
    assert.equal(motion.coordinate, before, 'retarget must not jump');
    for (let i = 0; i < 8; i++) {
      motion.step(1 / 60);
      const size = displayScaleForCoordinate(motion.coordinate);
      assert.ok(size >= .65 && size <= 1.1);
    }
  }
  for (let i = 0; i < 300 && !motion.settled; i++) motion.step(1 / 60);
  near(displayScaleForCoordinate(motion.coordinate), .65);
});
