import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { mountHookComponent } from './helpers/react-hook-harness.mjs';

const sources = await Promise.all([
  '../app/oms/nugget-viewer.tsx', '../hooks/use-viewer-loading.ts',
].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
const [viewerCode, loadingCode] = sources.map(source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText);

test('the OMS hero falls back to the current weight if its ready 3D frame loses WebGL', () => {
  const states = [];
  const viewer = mountHookComponent((load, modules) => {
    modules['@/hooks/use-viewer-loading'] = load(loadingCode);
    return load(viewerCode).NuggetViewer;
  }, { weight: 1, fallback: { index: 10, scale: 1 }, onStateChange: state => states.push(state) });
  const scene = () => viewer.nodes().find(node => node.type === 'iframe');
  const poster = () => viewer.nodes().find(node => node.props.className === 'oms-nugget-fallback');

  viewer.send({ type: 'nugget-ready' });
  assert.equal(scene().props['aria-hidden'], false);
  viewer.send({ type: 'nugget-error' }, { source: {} });
  viewer.send({ type: 'nugget-error' }, { origin: 'https://other.example' });
  assert.ok(scene(), 'messages outside the mounted same-origin frame cannot stop the scene');

  viewer.update({ weight: 2, fallback: { index: 20, scale: 1 } });
  viewer.send({ type: 'nugget-error' });
  assert.equal(scene(), undefined);
  assert.equal(poster().props.src, '/oms-hero-lab/static-weights/weight-020.webp');
  assert.deepEqual(states, ['loading', 'ready', 'error']);
  viewer.unmount();
});

test('a missing readiness handshake ends loading and exposes a static weight after 30 seconds', () => {
  const states = [];
  const viewer = mountHookComponent((load, modules) => {
    modules['@/hooks/use-viewer-loading'] = load(loadingCode);
    return load(viewerCode).NuggetViewer;
  }, { weight: 10, fallback: { index: 100, scale: 1 }, onStateChange: state => states.push(state) });
  viewer.advance(300);
  assert.ok(viewer.nodes().find(node => node.props?.className === 'oms-nugget-loader'));
  viewer.advance(29_700);
  assert.equal(viewer.nodes().find(node => node.type === 'iframe'), undefined);
  assert.equal(viewer.nodes().find(node => node.props?.className === 'oms-nugget-fallback').props.src,
    '/oms-hero-lab/static-weights/weight-100.webp');
  assert.deepEqual(states, ['loading', 'error']);
  viewer.unmount();
});

test('a visible loader finishes its minimum display before revealing a model that becomes ready', () => {
  const viewer = mountHookComponent((load, modules) => {
    modules['@/hooks/use-viewer-loading'] = load(loadingCode);
    return load(viewerCode).NuggetViewer;
  }, { weight: 1 });
  const scene = () => viewer.nodes().find(node => node.type === 'iframe');
  viewer.advance(300);
  viewer.send({ type: 'nugget-ready' });
  assert.equal(scene().props['aria-hidden'], true);
  viewer.advance(499);
  assert.equal(scene().props['aria-hidden'], true);
  viewer.advance(1);
  assert.equal(scene().props['aria-hidden'], false);
  assert.equal(viewer.nodes().find(node => node.props?.className === 'oms-nugget-loader'), undefined);
  viewer.unmount();
});
