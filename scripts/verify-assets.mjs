import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(root, 'public');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packages = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
const errors = [];
let references = 0;

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(target) : [target];
  });
}

function resolveLocal(target) {
  return [target, ...['.ts', '.tsx', '.js', '.mjs', '.json', '.css'].map(ext => target + ext),
    ...['index.ts', 'index.tsx', 'index.js'].map(file => path.join(target, file))]
    .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
}

function checkReference(from, raw, module = false) {
  if (!raw || /^(?:https?:|data:|blob:|#)/.test(raw) || raw.includes('${')) return;
  const target = raw.split(/[?#]/)[0];
  if (!target) return;
  let absolute;
  if (target.startsWith('@/')) absolute = path.join(root, target.slice(2));
  else if (target.startsWith('/')) {
    // Page anchors and API endpoints are routes, not public files.
    if (!path.extname(target)) return;
    absolute = path.join(publicRoot, target.slice(1));
  } else if (target.startsWith('.')) absolute = path.resolve(path.dirname(from), target);
  else if (module) {
    if (from.startsWith(publicRoot + path.sep) && target === 'three') absolute = path.join(publicRoot, 'three/three.module.js');
    else if (from.startsWith(publicRoot + path.sep) && target.startsWith('three/addons/')) absolute = path.join(publicRoot, target);
    else {
      const name = target.startsWith('@') ? target.split('/').slice(0, 2).join('/') : target.split('/')[0];
      if (!packages.has(name)) errors.push(`${path.relative(root, from)}: undeclared package ${name}`);
      return;
    }
  } else absolute = path.resolve(path.dirname(from), target);
  references++;
  if (!absolute.startsWith(root) || !resolveLocal(absolute)) errors.push(`${path.relative(root, from)}: missing ${raw}`);
}

for (const directory of ['app', 'components', 'hooks', 'lib', 'public']) {
  for (const file of filesIn(path.join(root, directory))) {
    if (!/\.(?:tsx?|jsx?|mjs|css|html)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[\w*{},\s]+\s+from\s*)?["']([^"']+)["']/g)) checkReference(file, match[1], true);
    for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) checkReference(file, match[1], true);
    if (/\.(?:css|html)$/.test(file)) {
      for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) checkReference(file, match[1]);
    }
    for (const match of source.matchAll(/\b(?:src|srcSet|href)=["']([^"']+)["']/g)) checkReference(file, match[1]);
    for (const match of source.matchAll(/\bfetch\(\s*["']([^"']+)["']\s*[,)]/g)) checkReference(file, match[1]);
    if (file.endsWith('.html')) {
      for (const match of source.matchAll(/<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/g)) {
        const map = JSON.parse(match[1]);
        for (const target of Object.values(map.imports ?? {})) {
          // Import-map prefixes point to directories; concrete imports are checked above.
          if (target.endsWith('/')) assert.ok(existsSync(path.join(publicRoot, target.slice(1))), `missing import-map directory ${target}`);
          else checkReference(file, target, true);
        }
      }
    }
  }
}

// These URLs are constructed at runtime and cannot be found by static link scanning.
const accountFlow = readFileSync(path.join(root, 'app/oms/account-flow.js'), 'utf8');
for (const [, name] of accountFlow.matchAll(/image:\s*['"]([^'"]+)['"]/g)) {
  checkReference(path.join(root, 'app/oms/account-flow.js'), `/oms-account/${name}.svg`);
}
for (const name of ['gold', 'exchange']) for (const suffix of ['', '-desktop']) {
  checkReference(path.join(root, 'app/oms/account-opening-dialog.tsx'), `/oms-account/benefit-${name}${suffix}.svg`);
}
for (let index = 1; index <= 100; index++) {
  const filename = `oms-hero-lab/static-weights/weight-${String(index).padStart(3, '0')}.webp`;
  const bytes = readFileSync(path.join(publicRoot, filename));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', filename);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', filename);
}

const manifest = JSON.parse(readFileSync(path.join(publicRoot, 'oms-nugget/morph-manifest.json'), 'utf8'));
assert.equal(manifest.shapes.length, 10, 'all ten morph targets are required');
for (const asset of [manifest.binary, ...manifest.shapes]) {
  const bytes = readFileSync(path.join(publicRoot, 'oms-nugget', asset.file));
  assert.equal(bytes.byteLength, asset.bytes, `${asset.file}: incomplete model file`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.file}: checksum differs from the production manifest`);
}
const binary = readFileSync(path.join(publicRoot, 'oms-nugget', manifest.binary.file));
for (const shape of manifest.shapes) {
  for (const attribute of [shape.positions, shape.normals]) {
    assert.equal(attribute.count, manifest.vertexCount * 3);
    assert.ok(attribute.byteOffset + attribute.count * 4 <= binary.byteLength, 'morph attribute extends past the binary');
  }
}

if (errors.length) throw new Error(`Asset verification failed:\n${errors.join('\n')}`);
console.log(`Verified ${references} local references, 100 fallback images, and 11 production model checksums.`);
