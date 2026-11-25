import assert from 'node:assert/strict';
import test from 'node:test';
import { nuggetInspectionGeometry } from '../app/oms/nugget-inspection-geometry.js';
import { nuggetInspectionFit, nuggetMobileInspectionFit } from '../public/oms-nugget-viewer/inspection-fit.js';

test('inspection framing keeps the complete rotation envelope inside both the canvas and visible viewport', () => {
  // A projected bounding sphere covers every orientation, including maximum-weight diagonals.
  for (const [width, height] of [[320, 568], [375, 494], [375, 812], [430, 932], [768, 600], [1280, 720], [1440, 900]]) {
    const viewport = { width, height }, frame = { width: Math.min(width, 736), height: Math.min(height, 560) };
    for (const radius of [80, 150, 280]) for (const offsetY of [-30, 0, 25]) {
      const zoom = width < 768 ? 1.1 : 1.8;
      const fit = nuggetInspectionFit(radius, offsetY, frame, viewport, zoom);
      assert.ok(Number.isFinite(fit) && fit > 0);
      assert.ok(radius * fit <= frame.width / 2 + 1e-9);
      assert.ok(radius * fit + Math.abs(offsetY) <= frame.height / 2 + 1e-9);
      assert.ok(radius * fit * zoom < width / 2);
      assert.ok((radius * fit + Math.abs(offsetY)) * zoom < height / 2);
    }
  }
});

test('mobile enlargement remains within the viewport throughout the transition at both weight extremes', () => {
  for (const [width, height] of [[320, 568], [375, 494], [375, 812], [430, 932]]) {
    const viewport = { width, height }, frame = { width, height: Math.min(width, 420) };
    for (const scale of [.65, 1.1]) for (const progress of [0, .25, .5, .75, 1]) {
      const zoom = 1 + progress * .1, radius = 150, offsetY = 8;
      const fit = nuggetMobileInspectionFit(scale, radius, offsetY, frame, viewport, 1.1, zoom);
      assert.ok(Number.isFinite(fit) && fit > 0);
      assert.ok(radius * fit <= frame.width / 2 + 1e-9);
      assert.ok(radius * fit + Math.abs(offsetY) <= frame.height / 2 + 1e-9);
      assert.ok(radius * fit * zoom <= width / 2 + 1e-9);
      assert.ok((radius * fit + Math.abs(offsetY)) * zoom <= height / 2 + 1e-9);
    }
  }
});

test('inspection transitions return to the original inline center and uniform size on both layouts', () => {
  const inline = { left: 380, top: 220, width: 736, height: 560 };
  const before = JSON.stringify(inline);
  const desktop = nuggetInspectionGeometry(inline, { width: 1440, height: 900 });
  assert.equal(desktop.full, 'translate(-50%, -50%) scale(1.8)');
  assert.ok(desktop.inline.endsWith('scale(1)'), 'return never keeps the expanded modal size');
  const centeredMobile = nuggetInspectionGeometry({ left: 0, top: 210, width: 375, height: 375 }, { width: 375, height: 812 });
  assert.equal(centeredMobile.scale, 1.1);
  assert.ok(centeredMobile.inline.includes('calc(-50% + 0px)'));
  assert.equal(JSON.stringify(inline), before, 'calculating the handoff cannot change the source layout');
});
