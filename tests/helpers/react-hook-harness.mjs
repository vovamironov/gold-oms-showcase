import assert from 'node:assert/strict';

// Minimal React scheduling + DOM boundaries for executing actual component
// functions. Child components remain explicit boundaries in the returned tree.
export function mountHookComponent(loadComponent, initialProps = {}) {
  const slots = [], effects = [], layoutEffects = [], listeners = new Map(), timers = new Map(), messages = [], animations = [];
  const attachedRefs = new Map(), refElements = new Map(), keyedElements = new Map(), markerElements = new Map(), resizeObservers = new Set(), mediaQueries = new Map();
  let cursor = 0, dirty = false, tree, now = 0, nextTimer = 0, props = initialProps, openingFrameRect;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const memo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const effect = (callback, deps, queue = effects) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) {
      const previous = slots[index];
      slots[index] = { deps, cleanup: previous?.cleanup };
      queue.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
    }
  };
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(initialValue) {
      const index = cursor++;
      slots[index] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [slots[index].value, value => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(slots[index].value, next)) { slots[index].value = next; dirty = true; }
      }];
    },
    useCallback: (callback, deps) => memo(() => callback, deps), useMemo: memo,
    useEffect: effect, useLayoutEffect: (callback, deps) => effect(callback, deps, layoutEffects),
  };
  const win = {
    location: { origin: 'http://test.local' }, innerHeight: 900, innerWidth: 1360,
    addEventListener(type, fn) { (listeners.get(type) ?? (listeners.set(type, new Set()), listeners.get(type))).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() { return ++nextTimer; }, clearInterval() {},
    requestAnimationFrame(fn) { const id = ++nextTimer; timers.set(id, { fn: () => fn(now), at: now + 16 }); return id; },
    cancelAnimationFrame(id) { timers.delete(id); },
    getComputedStyle: target => ({ transform: target?.node?.props?.className === 'bars-inspection-thumbnail-space' ? `scale(${target.pressScale()})` : target?.style?.transform || 'none', width: '736px', height: '560px', paddingRight: '0px' }),
  };
  const sourceWindow = { postMessage: message => messages.push(message) };
  const mediaMatches = query => {
    const maximum = query.match(/max-width:\s*([\d.]+)px/)?.[1], minimum = query.match(/min-width:\s*([\d.]+)px/)?.[1];
    const hover = /\(hover:\s*hover\)/.test(query), fine = /\(pointer:\s*fine\)/.test(query);
    return (maximum !== undefined || minimum !== undefined || hover || fine) && (maximum === undefined || win.innerWidth <= Number(maximum)) && (minimum === undefined || win.innerWidth >= Number(minimum)) && (!(hover || fine) || win.innerWidth >= 768);
  };
  const matchMedia = query => {
    if (!mediaQueries.has(query)) {
      const callbacks = new Set();
      mediaQueries.set(query, { media: query, matches: mediaMatches(query), callbacks,
        addEventListener(type, callback) { if (type === 'change') callbacks.add(callback); },
        removeEventListener(type, callback) { if (type === 'change') callbacks.delete(callback); },
      });
    }
    return mediaQueries.get(query);
  };
  const createStyle = () => ({
    setProperty(name, value) { this[name] = value; },
    getPropertyValue(name) { return this[name] ?? ''; },
    removeProperty(name) { const value = this[name] ?? ''; delete this[name]; return value; },
  });
  const translateX = host => Number(host?.style?.transform?.match(/translateX\(([-\d.e+]+)px\)/)?.[1] ?? 0);
  const document = { activeElement: null, body: { style: { overflow: '', paddingRight: '' } }, documentElement: { clientWidth: 1360 } };
  const element = {
    getBoundingClientRect: () => ({ left: 40, top: 10, bottom: 570, height: 560, width: 736 }),
    ownerDocument: document, style: createStyle(), focus() { document.activeElement = this; },
    blur() { if (document.activeElement === this) document.activeElement = null; }, querySelector: () => null,
    animate(keyframes, options) {
      let finish;
      const animation = { target: this, keyframes, options, startedAt: now, completed: false, cancelCount: 0, finished: new Promise(resolve => { finish = resolve; }), cancel() { this.cancelCount++; }, finish() { this.completed = true; finish(); } };
      animations.push(animation); return animation;
    },
  };
  const frame = { ...element, style: createStyle(), contentWindow: sourceWindow };
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  const dialogAttributes = new Set();
  const dialog = { ...element, style: createStyle(), open: false,
    getBoundingClientRect() { return this.open ? rect(0, 0, win.innerWidth, win.innerHeight) : element.getBoundingClientRect(); },
    setAttribute(name) { dialogAttributes.add(name); }, removeAttribute(name) { dialogAttributes.delete(name); },
    showModal() {
      this.previousFocus = document.activeElement;
      this.open = true;
      if (dialogAttributes.has('autofocus')) this.focus();
    },
    close() { this.open = false; document.activeElement = this.previousFocus; } };
  const modules = {
    react,
    'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
  };
  const load = code => {
    const module = { exports: {} };
    class ResizeObserver {
      constructor(callback) { this.callback = callback; this.targets = new Set(); resizeObservers.add(this); }
      observe(target) { this.targets.add(target); }
      unobserve(target) { this.targets.delete(target); }
      disconnect() { this.targets.clear(); resizeObservers.delete(this); }
    }
    new Function('require', 'exports', 'window', 'document', 'IntersectionObserver', 'ResizeObserver', 'performance', 'matchMedia', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
      name => { assert.ok(Object.hasOwn(modules, name), `unexpected module ${name}`); return modules[name]; },
      module.exports, win, document, class { observe() {} disconnect() {} }, ResizeObserver, { now: () => now },
      matchMedia, win.getComputedStyle, win.requestAnimationFrame, win.cancelAnimationFrame,
    );
    return module.exports;
  };
  const Component = loadComponent(load, modules);
  const nodes = () => {
    const result = [];
    const visit = value => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      result.push(value); visit(value.props?.children);
    };
    visit(tree); return result;
  };
  const descendants = node => {
    const result = [];
    const visit = value => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      result.push(value); visit(value.props?.children);
    };
    visit(node?.props?.children); return result;
  };
  const matches = (node, selector) => {
    const attribute = selector.match(/^\[([^=\]]+)\]$/)?.[1];
    if (attribute) return Object.hasOwn(node.props ?? {}, attribute);
    if (selector.startsWith('.')) return String(node.props?.className ?? '').split(/\s+/).includes(selector.slice(1));
    return node.type === selector;
  };
  const nodeElement = node => {
    const keyed = Object.hasOwn(node.props ?? {}, 'data-bar-weight');
    const key = keyed ? node.key ?? `index:${nodes().filter(item => Object.hasOwn(item.props ?? {}, 'data-bar-weight')).indexOf(node)}` : null;
    if (keyed && keyedElements.has(key)) { const host = keyedElements.get(key); host.node = node; return host; }
    const markerOwner = node.props?.className === 'bars-inspection-thumbnail-space' ? nodes().find(item => Object.hasOwn(item.props ?? {}, 'data-bar-weight') && descendants(item).includes(node)) : null;
    const markerKey = markerOwner?.key ?? markerOwner?.props?.['data-bar-weight'];
    if (markerOwner && markerElements.has(markerKey)) { const host = markerElements.get(markerKey); host.node = node; return host; }
    const host = { ...element, style: createStyle(), node,
      contains(target) { return target === this || descendants(this.node).includes(target?.node); },
      get dataset() { return Object.fromEntries(Object.entries(this.node.props ?? {}).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), String(value)])); },
      getAttribute(name) { return this.node.props?.[name] == null ? null : String(this.node.props[name]); },
      querySelectorAll(selector) { return descendants(this.node).filter(child => matches(child, selector)).map(nodeElement); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
      pressScale() {
        const animation = animations.findLast(item => item.target === this && item.cancelCount === 0);
        if (!animation) {
          const owner = nodes().find(item => Object.hasOwn(item.props ?? {}, 'data-bar-weight') && descendants(item).includes(this.node));
          return owner?.props['data-pressed'] === true ? .9 : owner?.props['data-hovered'] === true && win.innerWidth >= 768 ? 1.1 : 1;
        }
        const from = Number(animation.keyframes[0].transform.match(/scale\(([-\d.]+)\)/)?.[1] ?? 1);
        const to = Number(animation.keyframes.at(-1).transform.match(/scale\(([-\d.]+)\)/)?.[1] ?? 1);
        const progress = animation.completed ? 1 : Math.min(1, (now - animation.startedAt) / animation.options.duration);
        return from + (to - from) * progress;
      },
      getBoundingClientRect() {
        const className = this.node.props?.className ?? '';
        if (className === 'bars-inspection-opening-frame' && dialog.open) {
          const sample = typeof openingFrameRect === 'function' ? openingFrameRect() : openingFrameRect;
          return sample ? rect(sample.left, sample.top, sample.width, sample.height) : rect(0, 0, win.innerWidth, win.innerHeight);
        }
        if (className === 'bars-inspection-stage' && dialog.open && dialog.node?.props?.['data-inspection-controls']) return rect(0, 0, win.innerWidth, win.innerHeight);
        const buttons = nodes().filter(item => Object.hasOwn(item.props ?? {}, 'data-bar-weight'));
        const panelWidth = Math.min(327, win.innerWidth - 32);
        const panelLeft = (win.innerWidth - panelWidth) / 2;
        const panelTop = win.innerHeight - (win.innerHeight <= 500 ? 16 : 48) - 85;
        if (className === 'bars-inspection-choices') return rect(panelLeft, panelTop, panelWidth, 85);
        const button = Object.hasOwn(this.node.props ?? {}, 'data-bar-weight') ? this.node : nodes().find(item => Object.hasOwn(item.props ?? {}, 'data-bar-weight') && descendants(item).includes(this.node));
        if (button) {
          const index = buttons.indexOf(button), contentWidth = buttons.length * 51 + Math.max(0, buttons.length - 1) * 4;
          const buttonHost = this.node === button ? this : nodeElement(button);
          const left = win.innerWidth / 2 - contentWidth / 2 + index * 55 + translateX(buttonHost), top = panelTop + 8;
          if (this.node === button) return rect(left, top, 51, 69);
          const scale = this.pressScale();
          return rect(left + 25.5 - 27 * scale / 2, top + 34.5 - 45 * scale / 2, 27 * scale, 45 * scale);
        }
        return element.getBoundingClientRect();
      },
    };
    if (keyed) keyedElements.set(key, host);
    if (markerOwner) markerElements.set(markerKey, host);
    return host;
  };
  const flush = () => {
    do {
      dirty = false; cursor = 0; tree = Component(props);
      const buttons = nodes().filter(node => Object.hasOwn(node.props ?? {}, 'data-bar-weight'));
      const keys = new Set(buttons.map((node, index) => node.key ?? `index:${index}`));
      for (const key of keyedElements.keys()) if (!keys.has(key)) keyedElements.delete(key);
      for (const key of markerElements.keys()) if (!keys.has(key)) markerElements.delete(key);
      for (const [index, node] of buttons.entries()) {
        const key = node.key ?? `index:${index}`, host = keyedElements.get(key);
        if (host) host.node = node;
        const marker = markerElements.get(key);
        if (marker) marker.node = descendants(node).find(child => child.props?.className === 'bars-inspection-thumbnail-space');
      }
      for (const [ref] of attachedRefs) {
        if (typeof ref === 'function') ref(null);
        else ref.current = null;
      }
      attachedRefs.clear();
      for (const node of nodes()) if (node.props?.ref) {
        const ref = node.props.ref;
        let host = node.type === 'iframe' ? frame : node.type === 'dialog' ? dialog : refElements.get(ref);
        if (!host) { host = nodeElement(node); refElements.set(ref, host); }
        host.node = node;
        if (typeof ref === 'function') ref(host); else ref.current = host;
        attachedRefs.set(ref, host);
      }
      while (layoutEffects.length) layoutEffects.shift()();
      while (effects.length) effects.shift()();
    } while (dirty);
  };
  flush();
  const settle = async () => {
    for (let index = 0; index < 4; index++) await Promise.resolve();
    flush();
  };
  return {
    nodes, messages, animations, dialog, document, settle,
    setOpeningFrameRect(value) { openingFrameRect = value; },
    act(callback) { callback(); flush(); },
    dispatch(type, event = {}) {
      for (const receive of listeners.get(type) ?? []) receive(event);
      flush();
    },
    update(next) { props = { ...props, ...next }; flush(); },
    send(data, eventOverrides = {}) {
      for (const receive of listeners.get('message') ?? []) receive({ source: sourceWindow, origin: win.location.origin, data, ...eventOverrides });
      flush();
    },
    advance(ms) {
      now += ms;
      const due = [...timers].filter(([, timer]) => timer.at <= now);
      for (const [id, timer] of due) { timers.delete(id); timer.fn(); }
      flush();
    },
    resize(width, height) {
      win.innerWidth = width; win.innerHeight = height; document.documentElement.clientWidth = width;
      for (const media of mediaQueries.values()) {
        const matches = mediaMatches(media.media);
        if (matches === media.matches) continue;
        media.matches = matches;
        for (const callback of media.callbacks) callback({ matches, media: media.media });
      }
      for (const receive of listeners.get('resize') ?? []) receive();
      for (const observer of resizeObservers) observer.callback([...observer.targets].map(target => ({ target, contentRect: target.getBoundingClientRect() })));
      flush();
    },
    async finishAnimation({ acknowledgeReturn = true } = {}) {
      animations.at(-1)?.finish();
      if (acknowledgeReturn) {
        const scene = nodes().find(node => node.props?.inspectionReturnRequest && typeof node.props.onInspectionReturnReady === 'function');
        if (scene) scene.props.onInspectionReturnReady(scene.props.inspectionReturnRequest.id);
      }
      await settle();
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}
