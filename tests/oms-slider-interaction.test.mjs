import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import * as weights from '../public/oms-hero-lab-v2/weight-scale.js';
import { mountHookComponent } from './helpers/react-hook-harness.mjs';

const source = await readFile(new URL('../app/oms/oms-weight-slider.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount(value = 0.1) {
  const changes = [];
  let finishEditing = 0;
  const component = mountHookComponent((load, modules) => {
    modules.react.useId = () => 'test-haptic-switch';
    modules['@/public/oms-hero-lab-v2/weight-scale.js'] = weights;
    modules['./oms-weight-slider.css'] = {};
    return load(code).OmsWeightSlider;
  }, { value, onChange: (weight, animate) => changes.push({ weight, animate }),
    onPointerStart: () => finishEditing++, className: 'test-range', label: 'Вес золота' });
  return { ...component, changes, finishEditing: () => finishEditing,
    range: () => component.nodes().find(node => node.props?.type === 'range'),
    pressed: () => component.nodes()[0].props['data-pressed'],
  };
}

const pointer = (patch = {}) => ({ button: 0, isPrimary: true, pointerId: 1,
  clientX: 100, clientY: 100, timeStamp: 0, pointerType: 'mouse', ...patch });

test('range taps retain animated changes after pointerup, including small pointer jitter', () => {
  const slider = mount();
  slider.act(() => slider.range().props.onPointerDown(pointer()));
  assert.equal(slider.finishEditing(), 1, 'dragging the slider first exits text editing');
  assert.equal(slider.pressed(), true);
  slider.act(() => slider.range().props.onPointerMove(pointer({ clientX: 103, clientY: 102 })));
  slider.dispatch('pointerup', pointer({ isTrusted: true, clientX: 103, clientY: 102, timeStamp: 120 }));
  slider.act(() => slider.range().props.onChange({ currentTarget: { value: '1000' } }));
  assert.equal(slider.pressed(), undefined);
  assert.deepEqual(slider.changes, [{ weight: 10, animate: true }]);
  slider.unmount();
});

test('range dragging updates directly and the next tap restores animated selection', () => {
  const slider = mount(50);
  slider.act(() => slider.range().props.onPointerDown(pointer()));
  slider.act(() => slider.range().props.onPointerMove(pointer({ clientX: 130 })));
  slider.dispatch('pointerup', pointer({ clientX: 130, timeStamp: 200 }));
  slider.act(() => slider.range().props.onChange({ currentTarget: { value: '1000' } }));
  assert.ok(slider.changes.every(change => change.animate === false));
  slider.act(() => slider.range().props.onPointerDown(pointer()));
  slider.act(() => slider.range().props.onChange({ currentTarget: { value: '2000' } }));
  assert.deepEqual(slider.changes.at(-1), { weight: 1000, animate: true });
  slider.unmount();
});

test('keyboard interaction respects precision seams and exposes the chosen weight accessibly', () => {
  const slider = mount(10);
  let prevented = false;
  slider.act(() => slider.range().props.onKeyDown({ key: 'ArrowRight', preventDefault() { prevented = true; } }));
  assert.equal(prevented, true);
  assert.deepEqual(slider.changes.at(-1), { weight: 11, animate: false });
  slider.update({ value: 1000 });
  assert.equal(slider.range().props['aria-valuetext'], '1 000 г');
  slider.act(() => slider.range().props.onKeyDown({ key: 'Home', preventDefault() {} }));
  assert.deepEqual(slider.changes.at(-1), { weight: 0.1, animate: false });
  slider.unmount();
});
