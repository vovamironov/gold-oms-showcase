import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_WEIGHT_GRAMS, MAX_WEIGHT_GRAMS, MAX_SLIDER_POSITION, WEIGHT_PRESETS,
  quantizeWeight, weightToPosition, positionToWeight, morphWeightForWeight, nextWeight, displayWeight, weightForBudget,
} from '../public/oms-hero-lab-v2/weight-scale.js';

const weights = [
  ...Array.from({ length: 100 }, (_, i) => (i + 1) / 10),
  ...Array.from({ length: 990 }, (_, i) => i + 11),
];

test('precision bands occupy equal halves of the slider, with exact endpoints', () => {
  assert.equal(MIN_WEIGHT_GRAMS, 0.1);
  assert.equal(MAX_WEIGHT_GRAMS, 1_000);
  assert.equal(MAX_SLIDER_POSITION, 2_000);
  for (const [grams, position] of [[0.1, 0], [10, 1_000], [1_000, 2_000]]) {
    assert.equal(weightToPosition(grams), position);
    assert.equal(positionToWeight(position), grams);
  }
});

test('all supported weights roundtrip through both exact and integer range positions', () => {
  assert.equal(weights.length, 1_090);
  for (const grams of weights) {
    const position = weightToPosition(grams);
    assert.equal(positionToWeight(position), grams, `exact roundtrip for ${grams} g`);
    assert.equal(positionToWeight(Math.round(position)), grams, `native step=1 roundtrip for ${grams} g`);
  }
});

test('existing morph shapes span the entire new scale and finish only at 1000 g', () => {
  for (const [grams, morph] of [[0.1, 0.1], [10, 5.05], [1_000, 10]]) {
    assert.ok(Math.abs(morphWeightForWeight(grams) - morph) < 1e-12);
  }
  let previous = -Infinity;
  for (const grams of weights) {
    const morph = morphWeightForWeight(grams);
    assert.ok(morph > previous, `morph must increase for ${grams} g`);
    assert.ok(morph >= 0.1 && morph <= 10);
    if (grams < MAX_WEIGHT_GRAMS) assert.ok(morph < 10, `final shape reached early for ${grams} g`);
    previous = morph;
  }
  assert.equal(morphWeightForWeight(Infinity), 10);
  assert.equal(morphWeightForWeight(NaN), 0.1);
});

test('the full rail is monotone and every output uses the correct precision', () => {
  const supported = new Set(weights);
  let previous = MIN_WEIGHT_GRAMS;
  for (let position = 0; position <= MAX_SLIDER_POSITION; position++) {
    const grams = positionToWeight(position);
    assert.ok(grams >= previous, `weight decreased at position ${position}`);
    assert.ok(supported.has(grams), `unsupported weight ${grams} g`);
    previous = grams;
  }
  let previousPosition = -1;
  for (const grams of weights) {
    const position = weightToPosition(grams);
    assert.ok(position > previousPosition, `position did not increase for ${grams} g`);
    previousPosition = position;
  }
});

test('arrow keys reach every weight in order, in both directions', () => {
  for (let i = 0; i < weights.length - 1; i++) {
    assert.equal(nextWeight(weights[i], 1), weights[i + 1]);
    assert.equal(nextWeight(weights[i + 1], -1), weights[i]);
  }
  assert.deepEqual([9.9, nextWeight(9.9, 1), nextWeight(10, 1)], [9.9, 10, 11]);
  assert.deepEqual([999, nextWeight(999, 1), nextWeight(1_000, 1)], [999, 1_000, 1_000]);
  assert.equal(nextWeight(0.1, -1), 0.1);
  assert.equal(nextWeight(1_000, 1), 1_000);
  assert.equal(nextWeight(5, 0), 5);
  assert.equal(nextWeight(5, NaN), 5);
});

test('rounding changes from tenths to grams and clamps at 1000 g', () => {
  for (const [input, expected] of [
    [0.14, 0.1], [0.16, 0.2], [9.94, 9.9], [9.96, 10],
    [10.4, 10], [10.6, 11], [499.6, 500], [999.6, 1_000],
    [1_001, 1_000], [1_499, 1_000], [1_500, 1_000], [499_999, 1_000],
  ]) assert.equal(quantizeWeight(input), expected);
});

test('out-of-range and non-finite inputs saturate safely', () => {
  for (const value of [NaN, undefined, -Infinity, -1, 0]) {
    assert.equal(quantizeWeight(value), MIN_WEIGHT_GRAMS);
    assert.equal(weightToPosition(value), 0);
    assert.equal(positionToWeight(value), MIN_WEIGHT_GRAMS);
  }
  for (const value of [Infinity, 900_000]) {
    assert.equal(quantizeWeight(value), MAX_WEIGHT_GRAMS);
    assert.equal(weightToPosition(value), MAX_SLIDER_POSITION);
    assert.equal(positionToWeight(value), MAX_WEIGHT_GRAMS);
  }
});

test('all design presets are supported and every displayed weight stays in grams', () => {
  assert.deepEqual(WEIGHT_PRESETS, [0.1, 10, 50, 100, 500]);
  for (const grams of WEIGHT_PRESETS) assert.equal(positionToWeight(weightToPosition(grams)), grams);
  assert.deepEqual(displayWeight(0.5), { value: 0.5, unit: 'г', maximumFractionDigits: 1 });
  assert.deepEqual(displayWeight(500), { value: 500, unit: 'г', maximumFractionDigits: 0 });
  assert.deepEqual(displayWeight(1_000), { value: 1_000, unit: 'г', maximumFractionDigits: 0 });
  assert.deepEqual(displayWeight(500_000), { value: 1_000, unit: 'г', maximumFractionDigits: 0 });
});

test('budget selection respects kopecks and maximizes affordable weight across all 1090 choices', () => {
  const centsPerGram = 1_076_526;
  const exactCost = grams => Number((BigInt(Math.round(grams * 10)) * BigInt(centsPerGram) + 5n) / 10n);
  for (const grams of weights) {
    for (const available of [exactCost(grams) - 1, exactCost(grams), exactCost(grams) + 1]) {
      const selected = weightForBudget(available / 100, centsPerGram / 100);
      assert.ok(weights.includes(selected));
      if (available < exactCost(MIN_WEIGHT_GRAMS)) {
        assert.equal(selected, MIN_WEIGHT_GRAMS);
      } else {
        assert.ok(exactCost(selected) <= available, `overspent for budget ${available}`);
        const next = nextWeight(selected, 1);
        assert.ok(next === selected || exactCost(next) > available, `missed a larger weight for ${available}`);
      }
    }
  }
});

test('budget steps cross 10/11 and 999/1000 without overspending', () => {
  const price = 100;
  for (const [budget, expected] of [[999.99, 9.9], [1_000, 10], [1_099.99, 10], [1_100, 11], [99_999.99, 999], [100_000, 1_000], [100_001, 1_000]]) {
    assert.equal(weightForBudget(budget, price), expected);
  }
});

test('budget comparison includes rounding to kopecks, including half-cent prices', () => {
  assert.equal(weightForBudget(0, 0.01), 0.4);
  assert.equal(weightForBudget(0.01, 0.01), 1.4);
  assert.equal(weightForBudget(0.02, 0.01), 2.4);
  assert.equal(weightForBudget(1, 1.005), 0.9);
  assert.equal(weightForBudget(1.01, 1.005), 1);
});

test('budget selection handles invalid prices, missing amounts, and both range ends', () => {
  for (const price of [0, -1, NaN, Infinity, -Infinity, undefined]) assert.equal(weightForBudget(50_000, price), 0.1);
  for (const budget of [NaN, undefined, -Infinity, -1]) assert.equal(weightForBudget(budget, 10_765.26), 0.1);
  assert.equal(weightForBudget(0, 10_765.26), 0.1);
  assert.equal(weightForBudget(10, 10_765.26), 0.1);
  assert.equal(weightForBudget(Infinity, 10_765.26), 1_000);
  assert.equal(weightForBudget(999_999_999, 10_765.26), 1_000);
});
