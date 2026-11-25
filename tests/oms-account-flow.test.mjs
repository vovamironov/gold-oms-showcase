import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCOUNT_RESEND_SECONDS, ACCOUNT_DESTINATIONS, accountViewportBounds,
  createAccountFlow, formatAccountPhone, normalizeAccountPhone,
} from '../app/oms/account-flow.js';

const createProductionAccountFlow = createAccountFlow;

class Target {
  listeners = new Map();

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }

  fire(type, details = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      timeStamp: 0,
      isPrimary: true,
      button: 0,
      detail: 1,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...details,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }

  get listenerCount() {
    return [...this.listeners.values()].reduce((count, entries) => count + entries.size, 0);
  }
}

function mount(options = {}, createFlow = createAccountFlow) {
  const queue = [], navigations = [], nativeNavigations = [], animations = [];
  const doc = Object.assign(new Target(), {
    documentElement: { clientWidth: 1000 }, activeElement: null, hidden: false,
    focused: true, hasFocus() { return this.focused; },
  });
  let clock = 0, timerSequence = 0;
  const timers = new Map();
  const element = id => Object.assign(new Target(), {
    id,
    ownerDocument: doc,
    isConnected: true,
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    dataset: {},
    attributes: new Map(),
    tagName: 'DIV',
    captures: new Set(),
    closest(selector) {
      if (selector.split(',').some(tag => tag.trim().toUpperCase() === this.tagName)) return this;
      return this.parentElement?.closest(selector) ?? null;
    },
    setPointerCapture(id) { this.captures.add(id); },
    hasPointerCapture(id) { return this.captures.has(id); },
    releasePointerCapture(id) { this.captures.delete(id); },
    style: {
      overflow: '',
      paddingRight: '',
      setProperty(name, value) { this[name] = value; },
      getPropertyValue(name) { return this[name] ?? ''; },
    },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    removeAttribute(name) { this.attributes.delete(name); },
    focus(focusOptions) { doc.activeElement = this; this.focusOptions = focusOptions; },
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; },
  });
  doc.body = element('body');
  doc.body.style.overflow = 'clip';
  doc.body.style.paddingRight = '7px';
  const ids = [
    'account-flow-form', 'account-flow-title', 'account-phone-step', 'account-code-step',
    'account-phone', 'account-code', 'account-field-error', 'account-status-panel',
    'account-status-image', 'account-continue', 'account-status-action', 'account-close',
    'account-sheet-handle', 'account-flow-header', 'account-code-phone', 'account-code-status',
    'account-clear-phone', 'account-clear-code', 'account-resend', 'account-status-description',
    'account-flow-fields', 'account-confirm-panel', 'account-confirm-action',
    'account-phone-legal', 'account-confirm-terms',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, element(id)]));
  const get = id => elements[id];
  get('account-code').setAttribute('aria-describedby', 'account-code-subtitle');
  for (const id of ['account-phone', 'account-code']) get(id).tagName = 'INPUT';
  for (const id of ['account-sheet-handle', 'account-close', 'account-continue', 'account-status-action', 'account-clear-phone', 'account-clear-code', 'account-resend']) get(id).tagName = 'BUTTON';
  get('account-flow-form').tagName = 'FORM';
  get('account-flow-form').animate = (frames, timing) => {
    let resolve, reject;
    const finished = new Promise((done, failed) => { resolve = done; reject = failed; });
    // Opening animations are not awaited by the controller, like browser WAAPI.
    finished.catch(() => {});
    const animation = {
      frames, timing, finished, canceled: false, completed: false,
      cancel() { this.canceled = true; if (!this.completed) reject(new Error('Animation canceled')); },
      finish() { if (!this.canceled && !this.completed) { this.completed = true; resolve(); } },
    };
    animations.push(animation);
    return animation;
  };
  const dialog = element('account-flow');
  dialog.getBoundingClientRect = () => {
    const top = parseFloat(dialog.style['--account-top']) || 0;
    const height = parseFloat(dialog.style['--account-height']) || options.height || 900;
    return { top, bottom: top + height, height };
  };
  get('account-flow-form').getBoundingClientRect = () => {
    const height = options.sheetHeight ?? 244;
    const offset = parseFloat(get('account-flow-form').style['--account-drag-y']) || 0;
    return { top: dialog.getBoundingClientRect().bottom - height + offset, height };
  };
  dialog.open = false;
  dialog.querySelector = selector => get(selector.slice(1));
  let previouslyFocused;
  dialog.showModal = () => {
    previouslyFocused = doc.activeElement;
    dialog.open = true;
  };
  dialog.close = () => {
    if (!dialog.open) return;
    dialog.open = false;
    previouslyFocused?.focus();
    // Match a native dialog: close fires later, after .open has changed.
    queue.push(() => dialog.fire('close'));
  };
  const trigger = element('account-trigger');
  const preview = element('preview');
  preview.getBoundingClientRect = () => ({ left: 80, top: 40, width: 900, height: 700, ...options.preview });
  const outcome = { value: options.outcome ?? 'opened' };
  const hostWindow = Object.assign(new Target(), {
    innerWidth: options.width ?? 1024,
    innerHeight: options.height ?? 900,
    visualViewport: options.visualViewport === null ? null : Object.assign(new Target(), options.visualViewport),
    getComputedStyle: target => ({ paddingRight: target.style.paddingRight }),
    matchMedia: () => ({ matches: options.reducedMotion ?? true }),
    location: { assign: url => nativeNavigations.push(url) },
    Date: { now: () => clock },
    setTimeout(callback, delay) {
      const id = ++timerSequence;
      timers.set(id, { callback, at: clock + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  let observer;
  hostWindow.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observer = this; }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  trigger.focus();
  const flow = createFlow({
    dialog,
    trigger,
    preview,
    outcome,
    window: hostWindow,
    ...(options.defaultNavigation ? {} : { navigate: url => navigations.push(url) }),
  });
  return {
    flow, doc, dialog, trigger, preview, outcome, hostWindow, get, navigations, nativeNavigations, animations,
    observer: () => observer,
    timerCount: () => timers.size,
    advanceTime(milliseconds) {
      const end = clock + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        clock = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      clock = end;
    },
    dragStart(details = {}, target = get('account-sheet-handle')) { return target.fire('pointerdown', details); },
    dragMove(details = {}) { return hostWindow.fire('pointermove', details); },
    dragEnd(details = {}, type = 'pointerup') { return hostWindow.fire(type, details); },
    offset: () => get('account-flow-form').style.getPropertyValue('--account-drag-y'),
    async finishMotion() { animations.at(-1)?.finish(); await Promise.resolve(); },
    flushCloseEvents() { while (queue.length) queue.shift()(); },
    submit() { return get('account-flow-form').fire('submit'); },
    enterPhone(value = '8 (999) 123-45-67') {
      get('account-phone').value = value;
      return get('account-flow-form').fire('submit');
    },
    enterCode(value = '1234') {
      get('account-code').value = value;
      return get('account-flow-form').fire('submit');
    },
    typeCode(value) {
      get('account-code').value = value;
      return get('account-code').fire('input');
    },
  };
}

test('phone normalization accepts national and country-code notation without changing the number', () => {
  for (const value of ['9991234567', '89991234567', '+7 (999) 123-45-67', '7 999 123 45 67', 79991234567]) {
    assert.equal(normalizeAccountPhone(value), '+79991234567', String(value));
  }
  for (const value of ['', null, undefined, '999123456', '799912345678', '+1 999 123 45 67', 'not a phone']) {
    assert.equal(normalizeAccountPhone(value), null, String(value));
  }
});

test('phone formatting groups digits with spaces for the SMS subtitle', () => {
  assert.equal(formatAccountPhone('89991234567'), '+7 999 123 45 67');
  assert.equal(formatAccountPhone('+7 (999) 123-45-67'), '+7 999 123 45 67');
  assert.equal(formatAccountPhone('+7 999 123 45 67'), '+7 999 123 45 67');
  assert.equal(formatAccountPhone('+7 (999) 12'), '+7 (999) 12');
  assert.equal(formatAccountPhone(''), '');
});

test('real mobile bounds follow the visual viewport when a keyboard reduces the visible area', () => {
  assert.deepEqual(accountViewportBounds({ left: 50, top: 100, width: 900 }, { width: 390, height: 844 }, {
    offsetLeft: 2, offsetTop: 48, width: 386, height: 420,
  }), { mobile: true, left: 2, top: 48, width: 386, height: 420 });
  assert.deepEqual(accountViewportBounds({}, { width: 700, height: 800 }), {
    mobile: true, left: 0, top: 0, width: 700, height: 800,
  });
});

test('the production controller opens from its caller on desktop and mobile', async t => {
  for (const width of [1024, 390]) {
    const changes = [];
    const fixture = mount({ width, reducedMotion: false }, ({ dialog, window, navigate }) => (
      createProductionAccountFlow({ dialog, window, navigate, onOpenChange: open => changes.push(open) })
    ));
    t.after(() => fixture.flow.destroy());

    fixture.flow.open();
    assert.equal(fixture.dialog.dataset.mobile, String(width <= 700));
    assert.equal(fixture.trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(fixture.doc.activeElement, fixture.get('account-phone'));
    assert.equal(fixture.animations[0].frames.at(-2).offset, .9);

    fixture.enterPhone();
    assert.equal(fixture.get('account-code-phone').textContent, '+7 999 123 45 67');
    fixture.typeCode('1234');
    assert.equal(fixture.dialog.dataset.step, 'confirm');
    assert.equal(fixture.get('account-confirm-panel').hidden, false);
    assert.equal(fixture.get('account-confirm-terms').hidden, false);
    assert.equal(fixture.get('account-status-panel').hidden, true);
    assert.deepEqual(fixture.navigations, [], 'authorization is not an account-opening request');
    fixture.get('account-status-action').fire('click');
    assert.deepEqual(fixture.navigations, [], 'the hidden result action cannot bypass confirmation');
    fixture.get('account-confirm-action').fire('click');
    assert.equal(fixture.dialog.dataset.step, 'opened');
    assert.equal(fixture.get('account-status-image').src, '/oms-account/thumb-up.svg');
    assert.deepEqual(fixture.navigations, []);

    fixture.get('account-status-action').fire('click');
    assert.deepEqual(fixture.navigations, ['tinkoffbank://Main/MetalAccount/Pay']);

    fixture.get('account-close').fire('click');
    await fixture.finishMotion();
    assert.deepEqual(changes, [true, false]);
    assert.equal(fixture.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(fixture.doc.activeElement, fixture.trigger);
    assert.equal(fixture.get('account-code').value, '');
  }
});

test('the production controller leaves a tapped button unfocused and restores keyboard focus', t => {
  const fixture = mount({ width: 390 }, createProductionAccountFlow);
  t.after(() => fixture.flow.destroy());

  fixture.flow.open({ currentTarget: fixture.trigger, detail: 1 });
  assert.equal(fixture.doc.activeElement, fixture.get('account-phone'));
  fixture.dialog.fire('cancel');
  assert.equal(fixture.doc.activeElement, fixture.doc.body);
  assert.equal(fixture.trigger.getAttribute('aria-expanded'), 'false');

  fixture.trigger.focus();
  fixture.flow.open({ currentTarget: fixture.trigger, detail: 0 });
  fixture.dialog.fire('cancel');
  assert.equal(fixture.doc.activeElement, fixture.trigger);
});

test('production opening failure also requires authorization and the explicit opening action', t => {
  const fixture = mount({ outcome: 'opening-error' }, createProductionAccountFlow);
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.get('account-confirm-action').fire('click');
  assert.equal(fixture.dialog.dataset.step, 'phone');
  fixture.enterPhone();
  fixture.typeCode('12');
  fixture.submit();
  assert.equal(fixture.dialog.dataset.step, 'code');
  assert.equal(fixture.get('account-code').getAttribute('aria-invalid'), 'true');
  fixture.typeCode('1234');
  assert.equal(fixture.dialog.dataset.step, 'confirm');
  fixture.get('account-confirm-action').fire('click');
  assert.equal(fixture.dialog.dataset.step, 'opening-error');
  assert.equal(fixture.get('account-status-image').src, '/oms-account/gold-cross.svg');
  assert.equal(fixture.get('account-status-action').textContent, 'Понятно');
  fixture.get('account-status-action').fire('click');
  assert.equal(fixture.dialog.open, false);
  assert.deepEqual(fixture.navigations, []);
});

test('production existing-account and Black branches keep their separate outcomes', t => {
  const existing = mount({ outcome: 'existing' }, createProductionAccountFlow);
  const nonClient = mount({ outcome: 'non-client' }, createProductionAccountFlow);
  t.after(() => { existing.flow.destroy(); nonClient.flow.destroy(); });
  existing.flow.open();
  existing.enterPhone();
  existing.typeCode('1234');
  assert.equal(existing.dialog.dataset.step, 'existing');
  assert.equal(existing.get('account-flow-title').textContent, 'У вас уже есть счет');
  assert.equal(existing.get('account-confirm-panel').hidden, true);
  existing.get('account-status-action').fire('click');
  assert.deepEqual(existing.navigations, ['tinkoffbank://Main/MetalAccount/Pay']);

  nonClient.flow.open();
  nonClient.enterPhone();
  nonClient.typeCode('1234');
  assert.equal(nonClient.dialog.dataset.step, 'non-client');
  nonClient.get('account-status-action').fire('click');
  assert.equal(nonClient.dialog.dataset.step, 'requested');
  assert.equal(nonClient.get('account-status-description').textContent, 'Свяжемся с вами, чтобы согласовать доставку карты');
  assert.deepEqual(nonClient.navigations, [], 'the local application result does not send a request or navigate');
  nonClient.get('account-status-action').fire('click');
  assert.equal(nonClient.dialog.open, false);
});

test('production resend waits for its cooldown, preserves the phone, clears code and restarts the timer', t => {
  const fixture = mount({}, createProductionAccountFlow);
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  assert.equal(fixture.get('account-clear-phone').hidden, true, 'an empty TUI field has no clear action');
  fixture.enterPhone();
  const resend = fixture.get('account-resend');
  assert.equal(fixture.get('account-clear-code').hidden, true);
  assert.equal(resend.disabled, true);
  assert.equal(resend.textContent, `Отправим снова через ${ACCOUNT_RESEND_SECONDS} сек`);
  assert.equal(fixture.get('account-flow-title').textContent, 'Подтверждение');
  fixture.typeCode('12');
  resend.fire('click');
  assert.equal(fixture.get('account-code').value, '12', 'even a synthetic early click cannot request a code');
  fixture.advanceTime((ACCOUNT_RESEND_SECONDS - 1) * 1000);
  assert.equal(resend.textContent, 'Отправим снова через 1 сек');
  fixture.advanceTime(1000);
  assert.equal(resend.disabled, false);
  assert.equal(resend.textContent, 'Отправить еще раз');
  resend.fire('click');
  assert.equal(fixture.get('account-code').value, '');
  assert.equal(fixture.get('account-phone').value, '+7 999 123 45 67');
  assert.equal(fixture.doc.activeElement, fixture.get('account-code'));
  assert.equal(fixture.get('account-code-status').textContent, 'Код отправлен повторно');
  assert.equal(resend.disabled, true);
  assert.equal(resend.textContent, `Отправим снова через ${ACCOUNT_RESEND_SECONDS} сек`);
  fixture.flow.close();
  assert.equal(fixture.timerCount(), 0);
  fixture.flow.open();
  fixture.enterPhone();
  assert.equal(resend.textContent, `Отправим снова через ${ACCOUNT_RESEND_SECONDS} сек`);
  fixture.flow.destroy();
  assert.equal(fixture.timerCount(), 0, 'a destroyed flow has no countdown left running');
});

test('mobile app handoff uses a visible-page heuristic and cancels its install offer on a real departure', t => {
  const fixture = mount({ width: 390 }, createProductionAccountFlow);
  t.after(() => fixture.flow.destroy());
  const buy = () => {
    fixture.flow.open();
    fixture.enterPhone();
    fixture.typeCode('1234');
    fixture.get('account-confirm-action').fire('click');
    fixture.get('account-status-action').fire('click');
  };
  buy();
  assert.equal(fixture.dialog.open, false);
  assert.deepEqual(fixture.navigations, ['tinkoffbank://Main/MetalAccount/Pay']);
  fixture.advanceTime(1199);
  assert.equal(fixture.dialog.open, false);
  fixture.advanceTime(1);
  assert.equal(fixture.dialog.dataset.step, 'install');
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.get('account-status-action').textContent, 'Скачать');
  fixture.get('account-status-action').fire('click');
  assert.equal(fixture.navigations.at(-1), 'https://www.tbank.ru/bank/help/interfaces/bank-app/get/login/');

  fixture.flow.close();
  buy();
  fixture.doc.hidden = true;
  fixture.doc.fire('visibilitychange');
  fixture.advanceTime(2000);
  assert.equal(fixture.dialog.open, false);
  assert.equal(fixture.timerCount(), 0, 'an app launch/departure cancels the heuristic fallback');
  fixture.doc.hidden = false;
  fixture.hostWindow.fire('focus');
  fixture.advanceTime(2000);
  assert.equal(fixture.dialog.open, false, 'returning from an app does not resurrect the install offer');
});

test('the production phone field groups digits while editing and requires a complete +7 number', t => {
  const fixture = mount({}, createProductionAccountFlow);
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  const phone = fixture.get('account-phone');
  phone.setSelectionRange = (start, end) => {
    phone.selectionStart = start;
    phone.selectionEnd = end;
  };
  phone.setRangeText = (value, start, end) => {
    phone.value = phone.value.slice(0, start) + value + phone.value.slice(end);
    phone.setSelectionRange(start, start);
  };
  const input = (value, caret = value.length) => {
    phone.value = value;
    phone.setSelectionRange(caret, caret);
    phone.fire('input');
  };

  input('9');
  assert.equal(phone.value, '+7 9');
  input('+7 977408');
  assert.equal(phone.value, '+7 977 408');
  input('+7 977 408 94 5');
  fixture.submit();
  assert.equal(fixture.dialog.dataset.step, 'phone');
  assert.equal(phone.getAttribute('aria-invalid'), 'true');

  input('8 (977) 408-94-56');
  assert.equal(phone.value, '+7 977 408 94 56');
  assert.equal(phone.selectionStart, phone.value.length);
  phone.setSelectionRange(7, 7);
  assert.equal(phone.fire('beforeinput', { inputType: 'deleteContentBackward', cancelable: true }).defaultPrevented, true);
  assert.equal(phone.value, '+7 974 089 45 6');
  assert.equal(phone.selectionStart, 5);
  input('9774089456');
  phone.fire('blur');
  assert.equal(phone.value, '+7 977 408 94 56');
  fixture.submit();
  assert.equal(fixture.dialog.dataset.step, 'code');
  assert.equal(fixture.get('account-code-phone').textContent, '+7 977 408 94 56');
});

test('opening locks page scroll once and closing restores original styles, focus and private input', t => {
  const fixture = mount();
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  assert.equal(fixture.doc.body.style.overflow, 'hidden');
  assert.equal(fixture.doc.body.style.paddingRight, '31px');
  assert.equal(fixture.trigger.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(fixture.get('account-phone').focusOptions, { preventScroll: true });
  fixture.flow.open();
  assert.equal(fixture.doc.body.style.paddingRight, '31px', 'opening an open modal must not double its scrollbar compensation');
  fixture.enterPhone();
  fixture.get('account-code').value = '1234';
  fixture.flow.close();
  assert.equal(fixture.dialog.open, false);
  assert.equal(fixture.doc.body.style.overflow, 'clip');
  assert.equal(fixture.doc.body.style.paddingRight, '7px');
  assert.equal(fixture.get('account-phone').value, '');
  assert.equal(fixture.get('account-code').value, '');
  assert.equal(fixture.trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(fixture.doc.activeElement, fixture.trigger);
  fixture.flushCloseEvents();
  assert.equal(fixture.doc.body.style.paddingRight, '7px');
});

for (const method of ['cancel', 'close-button', 'handle-button', 'native-close', 'pagehide']) {
  test(`${method} dismisses the session and restores focus and scrolling`, t => {
    const fixture = mount();
    t.after(() => fixture.flow.destroy());
    fixture.flow.open();
    fixture.enterPhone();
    if (method === 'cancel') assert.equal(fixture.dialog.fire('cancel').defaultPrevented, true);
    if (method === 'close-button') fixture.get('account-close').fire('click');
    if (method === 'handle-button') fixture.get('account-sheet-handle').fire('click');
    if (method === 'native-close') fixture.dialog.close();
    if (method === 'pagehide') fixture.hostWindow.fire('pagehide');
    fixture.flushCloseEvents();
    assert.equal(fixture.dialog.open, false);
    assert.equal(fixture.doc.body.style.overflow, 'clip');
    assert.equal(fixture.doc.activeElement, fixture.trigger);
    assert.equal(fixture.get('account-phone').value, '');
    assert.deepEqual(fixture.navigations, []);
  });
}

test('a backdrop click closes only when the gesture starts on the backdrop', t => {
  const fixture = mount();
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.dialog.fire('click');
  assert.equal(fixture.dialog.open, true, 'a click without a preceding backdrop press is ignored');
  fixture.dialog.fire('pointerdown', { target: fixture.get('account-flow-form') });
  fixture.dialog.fire('click');
  assert.equal(fixture.dialog.open, true, 'dragging from the form to the backdrop does not dismiss');
  fixture.dialog.fire('pointerdown');
  fixture.dialog.fire('click', { target: fixture.get('account-flow-form') });
  assert.equal(fixture.dialog.open, true);
  fixture.dialog.fire('pointerdown');
  fixture.dialog.fire('click');
  assert.equal(fixture.dialog.open, false);
});

test('a queued old close event cannot clear or unlock an immediately reopened session', t => {
  const fixture = mount({ outcome: 'existing' });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.enterPhone();
  fixture.flow.close();
  fixture.outcome.value = 'non-client';
  fixture.flow.open();
  fixture.get('account-phone').value = '9991234567';
  fixture.flushCloseEvents();
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.dialog.dataset.step, 'phone');
  assert.equal(fixture.get('account-phone').value, '9991234567');
  assert.equal(fixture.doc.activeElement, fixture.get('account-phone'));
  assert.equal(fixture.doc.body.style.overflow, 'hidden');
  assert.equal(fixture.doc.body.style.paddingRight, '31px');
  assert.equal(fixture.trigger.getAttribute('aria-expanded'), 'true');
  fixture.submit();
  fixture.enterCode();
  assert.equal(fixture.dialog.dataset.step, 'non-client', 'reopening reads the newly selected test outcome');
});

test('pulling down dismisses only after motion finishes and keeps the keyboard field focused until then', async t => {
  const fixture = mount({ width: 390, height: 844, reducedMotion: false,
    visualViewport: { width: 390, height: 420, offsetTop: 48, offsetLeft: 0 } });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.get('account-phone').value = '+7 999';
  const start = fixture.dragStart({ clientY: 100, timeStamp: 0 });
  assert.equal(start.defaultPrevented, true, 'the grabber must not steal focus from the phone field');
  assert.equal(fixture.get('account-sheet-handle').hasPointerCapture(1), true);
  fixture.dragMove({ clientY: 180, timeStamp: 200 });
  assert.equal(fixture.offset(), '80px');
  assert.equal(fixture.dialog.style.getPropertyValue('--account-drag-y'), '', 'the keyboard fill belongs to a stationary outer dialog');
  fixture.dragEnd({ clientY: 180, timeStamp: 220 });
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.dialog.dataset.closing, 'true');
  assert.equal(fixture.doc.activeElement, fixture.get('account-phone'));
  assert.equal(fixture.get('account-phone').value, '+7 999');
  assert.equal(fixture.dialog.style['--account-top'], '48px');
  assert.equal(fixture.dialog.style['--account-height'], '420px');
  assert.equal(fixture.get('account-sheet-handle').hasPointerCapture(1), false);
  await fixture.finishMotion();
  assert.equal(fixture.dialog.open, false);
  assert.equal(fixture.doc.activeElement, fixture.trigger);
  assert.equal(fixture.offset(), '0px');
  assert.equal(fixture.get('account-phone').value, '');
  assert.equal(fixture.doc.body.style.overflow, 'clip');
});

test('a short slow pull returns to place, suppresses its synthetic handle click, and still allows accessible close', async t => {
  const fixture = mount({ width: 390, reducedMotion: false });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.dragStart();
  fixture.dragMove({ clientY: 30, timeStamp: 200 });
  fixture.dragEnd({ clientY: 30, timeStamp: 220 });
  assert.equal(fixture.animations.at(-1).frames.at(-2).transform, 'translateY(1px)');
  assert.equal(fixture.animations.at(-1).frames.at(-1).transform, 'translateY(0px)');
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.dialog.dataset.closing, undefined);
  assert.equal(fixture.get('account-sheet-handle').fire('click', { detail: 1 }).defaultPrevented, true);
  assert.equal(fixture.dialog.open, true);
  await fixture.finishMotion();
  assert.equal(fixture.offset(), '0px');
  assert.equal(fixture.dialog.open, true);
  fixture.get('account-sheet-handle').fire('click', { detail: 0 });
  assert.equal(fixture.dialog.dataset.closing, 'true', 'keyboard or assistive activation remains a close action');
  await fixture.finishMotion();
  assert.equal(fixture.dialog.open, false);
});

test('a short fast downward flick dismisses but a paused release cannot reuse old velocity', t => {
  for (const [releaseTime, closes] of [[30, true], [200, false]]) {
    const fixture = mount({ width: 390 });
    t.after(() => fixture.flow.destroy());
    fixture.flow.open();
    fixture.dragStart();
    fixture.dragMove({ clientY: 25, timeStamp: 20 });
    fixture.dragEnd({ clientY: 25, timeStamp: releaseTime });
    assert.equal(fixture.dialog.open, !closes, `release at ${releaseTime}ms`);
  }
});

for (const [name, movement] of [
  ['upward', { clientY: -100, clientX: 0 }],
  ['horizontal', { clientY: 10, clientX: 80 }],
]) {
  test(`${name} movement does not dismiss or turn the release into a handle click`, t => {
    const fixture = mount({ width: 390 });
    t.after(() => fixture.flow.destroy());
    fixture.flow.open();
    fixture.dragStart();
    fixture.dragMove({ ...movement, timeStamp: 200 });
    fixture.dragEnd({ ...movement, timeStamp: 220 });
    fixture.get('account-sheet-handle').fire('click', { detail: 1 });
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.offset(), '0px');
    assert.equal(fixture.get('account-sheet-handle').hasPointerCapture(1), false);
  });
}

for (const cancellation of ['pointercancel', 'lostpointercapture']) {
  test(`${cancellation} returns even a long pull and preserves the entered text`, async t => {
    const fixture = mount({ width: 390, reducedMotion: false });
    t.after(() => fixture.flow.destroy());
    fixture.flow.open();
    fixture.get('account-phone').value = '+7 999';
    fixture.dragStart();
    fixture.dragMove({ clientY: 100, timeStamp: 100 });
    fixture.dragEnd({ clientY: 100, timeStamp: 110 }, cancellation);
    await fixture.finishMotion();
    assert.equal(fixture.dialog.open, true);
    assert.equal(fixture.offset(), '0px');
    assert.equal(fixture.dialog.dataset.dragging, undefined);
    assert.equal(fixture.dialog.dataset.closing, undefined);
    assert.equal(fixture.get('account-sheet-handle').hasPointerCapture(1), false);
    assert.equal(fixture.get('account-phone').value, '+7 999');
    assert.equal(fixture.doc.activeElement, fixture.get('account-phone'));
  });
}

test('dragging the title header works while fields, desktop, and secondary gestures stay untouched', t => {
  for (const mode of ['title', 'field', 'desktop', 'secondary', 'right-button']) {
    const fixture = mount({ width: mode === 'desktop' ? 1024 : 390 });
    t.after(() => fixture.flow.destroy());
    fixture.flow.open();
    const target = mode === 'field' ? fixture.get('account-phone') : fixture.get('account-flow-title');
    const start = fixture.dragStart({ target, isPrimary: mode !== 'secondary', button: mode === 'right-button' ? 2 : 0 }, fixture.get('account-flow-header'));
    fixture.dragMove({ clientY: 100, timeStamp: 200 });
    fixture.dragEnd({ clientY: 100, timeStamp: 220 });
    assert.equal(start.defaultPrevented, mode === 'title', mode);
    assert.equal(fixture.dialog.open, mode !== 'title', mode);
  }
});

test('another pointer cannot move or release the captured sheet', t => {
  const fixture = mount({ width: 390 });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.dragStart({ pointerId: 3 });
  fixture.dragMove({ pointerId: 9, clientY: 200, timeStamp: 100 });
  fixture.dragEnd({ pointerId: 9, clientY: 200, timeStamp: 120 });
  assert.equal(fixture.offset(), '0px');
  assert.equal(fixture.get('account-sheet-handle').hasPointerCapture(3), true);
  fixture.dragMove({ pointerId: 3, clientY: 100, timeStamp: 200 });
  fixture.dragEnd({ pointerId: 3, clientY: 100, timeStamp: 220 });
  assert.equal(fixture.dialog.open, false);
});

test('a resolved old dismissal cannot close a new session after an immediate close and reopen', async t => {
  const fixture = mount({ width: 390, reducedMotion: false });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.dragStart();
  fixture.dragMove({ clientY: 100, timeStamp: 200 });
  fixture.dragEnd({ clientY: 100, timeStamp: 220 });
  const oldMotion = fixture.animations.at(-1);
  oldMotion.finish();
  fixture.flow.close();
  fixture.flow.open();
  fixture.get('account-phone').value = '9991234567';
  fixture.flushCloseEvents();
  await Promise.resolve();
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.dialog.dataset.closing, undefined);
  assert.equal(fixture.get('account-phone').value, '9991234567');
  assert.equal(fixture.doc.activeElement, fixture.get('account-phone'));
  assert.equal(fixture.offset(), '0px');
});

test('starting another pull interrupts a pending return without letting its old animation reset the new motion', async t => {
  const fixture = mount({ width: 390, reducedMotion: false });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.dragStart();
  fixture.dragMove({ clientY: 30, timeStamp: 200 });
  fixture.dragEnd({ clientY: 30, timeStamp: 220 });
  const oldReturn = fixture.animations.at(-1);
  fixture.dragStart({ clientY: 30, timeStamp: 240 });
  assert.equal(oldReturn.canceled, true);
  fixture.dragMove({ clientY: 70, timeStamp: 440 });
  assert.equal(fixture.offset(), '70px');
  fixture.dragEnd({ clientY: 70, timeStamp: 460 });
  await fixture.finishMotion();
  assert.equal(fixture.dialog.open, false);
});

test('a viewport change cancels an active pull without dismissing or resetting the field', t => {
  const fixture = mount({ width: 390, reducedMotion: false,
    visualViewport: { width: 390, height: 420, offsetTop: 48, offsetLeft: 0 } });
  t.after(() => fixture.flow.destroy());
  fixture.flow.open();
  fixture.get('account-phone').value = '+7 999';
  fixture.dragStart();
  fixture.dragMove({ clientY: 16, timeStamp: 200 });
  fixture.hostWindow.visualViewport.height = 360;
  fixture.hostWindow.visualViewport.fire('resize');
  assert.equal(fixture.offset(), '0px');
  assert.equal(fixture.dialog.dataset.dragging, undefined);
  assert.equal(fixture.get('account-sheet-handle').hasPointerCapture(1), false);
  fixture.dragEnd({ clientY: 16, timeStamp: 220 });
  assert.equal(fixture.dialog.open, true);
  assert.equal(fixture.dialog.style['--account-height'], '360px');
  assert.equal(fixture.get('account-phone').value, '+7 999');
  const click = fixture.get('account-sheet-handle').fire('click', { detail: 1 });
  assert.equal(click.defaultPrevented, true, 'geometry cancellation must not turn a pull into an accidental handle tap');
  assert.equal(fixture.dialog.dataset.closing, undefined);
});
