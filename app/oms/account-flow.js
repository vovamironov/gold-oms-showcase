// Promoted from the tested OMS prototype. No phone number or code leaves this page.
export const ACCOUNT_DESTINATIONS = Object.freeze({
  opened: 'tinkoffbank://Main/MetalAccount/Pay',
  existing: 'tinkoffbank://Main/MetalAccount/Pay',
  'non-client': 'https://www.tbank.ru/cards/debit-cards/tinkoff-black/',
});

// The public flow is a local prototype. The remaining 43 s in Figma is an
// example; this cooldown is not a response or a contract from an SMS service.
export const ACCOUNT_RESEND_SECONDS = 60;
const INSTALL_URL = 'https://www.tbank.ru/bank/help/interfaces/bank-app/get/login/';

const OUTCOMES = {
  opened: {
    title: 'Золотой счет открыт',
    description: 'Теперь вы можете покупать\nи хранить золото в граммах',
    action: 'Купить золото',
    image: 'thumb-up',
  },
  existing: {
    title: 'У вас уже есть счет',
    description: 'Вы можете покупать\nи хранить золото в граммах',
    action: 'Купить золото',
    image: 'thumb-up',
  },
  'non-client': {
    title: 'Чтобы открыть счет,\nоформите карту Black',
    action: 'Оформить Black',
    image: 'cards',
  },
  requested: {
    title: 'Заявка отправлена',
    description: 'Свяжемся с вами, чтобы согласовать доставку карты',
    action: 'Понятно',
    image: 'chat-check',
  },
  'opening-error': {
    title: 'Не можем открыть вам\nзолотой счет',
    action: 'Понятно',
    image: 'gold-cross',
  },
  install: {
    title: 'Скачайте приложение, чтобы купить золото',
    action: 'Скачать',
  },
};

const EASE_INTO_PLACE = 'cubic-bezier(.22,.6,.2,1)';
const EASE_OUT_OF_VIEW = 'cubic-bezier(.32,0,.55,1)';
const DESKTOP_REBOUND = 'translateY(1px) scale(.998)';

export function normalizeAccountPhone(value) {
  const text = String(value).trimStart();
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) return /^7\d{10}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits[0] === '8') digits = `7${digits.slice(1)}`;
  return /^7\d{10}$/.test(digits) ? `+${digits}` : null;
}

function groupAccountPhone(digits) {
  return ['+7', digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8)].filter(Boolean).join(' ');
}

export function formatAccountPhone(value) {
  const phone = normalizeAccountPhone(value);
  return phone ? groupAccountPhone(phone.slice(2)) : value;
}

function formatPhoneInput(field, inputType) {
  const raw = field.value;
  const digits = raw.replace(/\D/g, '');
  const explicitCountry = raw.trimStart().startsWith('+');
  const hasCountry = explicitCountry || (digits.length !== 10 && /^[78]/.test(digits));
  if (digits.length > (hasCountry ? 11 : 10) || (explicitCountry && digits && digits[0] !== '7')) return;

  const formatted = digits ? groupAccountPhone(digits.slice(hasCountry ? 1 : 0))
    : explicitCountry && inputType !== 'deleteContentBackward' ? '+' : '';
  if (formatted === raw) return;

  const caret = field.selectionStart ?? raw.length;
  const precedingDigits = raw.slice(0, caret).replace(/\D/g, '').length;
  let digitsToLeft = precedingDigits + (hasCountry ? 0 : 1);
  let position = 0;
  while (position < formatted.length && digitsToLeft > 0) {
    if (/\d/.test(formatted[position])) digitsToLeft--;
    position++;
  }
  field.value = formatted;
  field.setSelectionRange(position, position);
}

export function accountViewportBounds(preview, viewport, visualViewport) {
  // A real phone follows the visible viewport, so the native keyboard never
  // covers the sheet. The lab's simulated phone stays inside its own preview.
  if (viewport.width <= 700) {
    return {
      mobile: true,
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? viewport.width,
      height: visualViewport?.height ?? viewport.height,
    };
  }
  if (preview.width > 700) return { mobile: false, left: 0, top: 0, ...viewport };
  const top = Math.min(Math.max(preview.top, 0), Math.max(viewport.height - 600, 0));
  return { mobile: true, left: preview.left, top, width: preview.width, height: Math.min(812, viewport.height - top) };
}

export function createAccountFlow({
  dialog,
  trigger,
  preview,
  outcome = 'opened',
  phoneTitle = 'Введите номер телефона,\nчтобы открыть счет',
  onOpenChange = () => {},
  onVerified,
  resultScreen,
  window: hostWindow = window,
  navigate = url => hostWindow.location.assign(url),
}) {
  const doc = dialog.ownerDocument;
  const $ = selector => dialog.querySelector(selector);
  const form = $('#account-flow-form');
  const handle = $('#account-sheet-handle');
  const header = $('.account-flow-header');
  const title = $('#account-flow-title');
  const phoneStep = $('#account-phone-step');
  const codeStep = $('#account-code-step');
  const fieldPanel = $('.account-flow-fields');
  const confirmPanel = $('#account-confirm-panel');
  const confirmAction = $('#account-confirm-action');
  const phoneLegal = $('#account-phone-legal');
  const confirmTerms = $('#account-confirm-terms');
  const phone = $('#account-phone');
  const code = $('#account-code');
  const codePhone = $('#account-code-phone');
  const codeStatus = $('#account-code-status');
  const resend = $('#account-resend');
  const fields = [
    { step: 'phone', input: phone, clear: $('#account-clear-phone') },
    { step: 'code', input: code, clear: $('#account-clear-code') },
  ].map(field => ({ ...field, description: field.input.getAttribute('aria-describedby') }));
  const error = $('#account-field-error');
  const status = $('#account-status-panel');
  const statusDescription = $('#account-status-description');
  const statusImage = $('#account-status-image');
  const next = $('#account-continue');
  const action = $('#account-status-action');
  const listeners = [];
  let step = 'phone';
  let result = 'opened';
  let scrollLock;
  let returnFocus;
  let activeTrigger;
  let formAnimation;
  let motionRevision = 0;
  let gesture;
  let closing = false;
  let suppressHandleClick = false;
  let backdropPointer = false;
  let resendTimer;
  let resendDeadline = 0;
  let installTimer;
  let installPending = false;
  const now = () => (hostWindow.Date ?? Date).now();
  const schedule = (callback, delay) => (hostWindow.setTimeout ?? setTimeout)(callback, delay);
  const unschedule = timer => (hostWindow.clearTimeout ?? clearTimeout)(timer);

  const on = (target, type, callback, options) => {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  };

  const reduceMotion = () => hostWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stopResendTimer() {
    if (resendTimer !== undefined) unschedule(resendTimer);
    resendTimer = undefined;
  }

  function syncResend() {
    stopResendTimer();
    const remaining = Math.max(0, Math.ceil((resendDeadline - now()) / 1000));
    resend.disabled = remaining > 0;
    resend.textContent = remaining > 0 ? `Отправим снова через ${remaining} сек` : 'Отправить еще раз';
    if (remaining > 0 && dialog.open && step === 'code') resendTimer = schedule(syncResend, 1000);
  }

  function restartResend() {
    resendDeadline = now() + ACCOUNT_RESEND_SECONDS * 1000;
    syncResend();
  }

  function stopInstallOffer() {
    installPending = false;
    if (installTimer !== undefined) unschedule(installTimer);
    installTimer = undefined;
  }

  function scheduleInstallOffer() {
    if (!installPending || doc.hidden) return;
    if (installTimer !== undefined) unschedule(installTimer);
    installTimer = schedule(() => {
      installTimer = undefined;
      if (!installPending || doc.hidden || (doc.hasFocus && !doc.hasFocus())) return;
      installPending = false;
      open(undefined, 'install');
    }, 1200);
  }

  function cancelFormAnimation() {
    ++motionRevision;
    formAnimation?.cancel();
    formAnimation = null;
  }

  function clearGesture() {
    const previous = gesture;
    gesture = null;
    delete dialog.dataset.dragging;
    if (previous?.target.hasPointerCapture?.(previous.id)) previous.target.releasePointerCapture(previous.id);
  }

  function setDragOffset(offset) {
    form.style.setProperty('--account-drag-y', `${offset}px`);
  }

  function currentSheetOffset() {
    const rect = form.getBoundingClientRect();
    return Math.max(0, rect.top - (dialog.getBoundingClientRect().bottom - rect.height));
  }

  function animateForm(frames, duration, finish, easing = EASE_INTO_PLACE) {
    cancelFormAnimation();
    if (reduceMotion() || !form.animate) {
      finish?.();
      return;
    }
    const revision = motionRevision;
    const animation = form.animate(frames, { duration, easing, fill: 'forwards' });
    formAnimation = animation;
    animation.finished.then(() => {
      if (revision !== motionRevision) return;
      formAnimation = null;
      animation.cancel();
      finish?.();
    }).catch(() => {});
  }

  function settleForm(start, end, rebound, duration, finish) {
    animateForm([
      { ...start, easing: EASE_INTO_PLACE },
      { ...end, offset: .8, easing: 'ease-in-out' },
      { ...end, ...rebound, offset: .9, easing: 'ease-out' },
      end,
    ], duration, finish, 'linear');
  }

  function animateSheet(from, to, duration, finish, easing) {
    const start = { transform: `translateY(${from}px)` };
    const end = { transform: `translateY(${to}px)` };
    if (to > 0) {
      const opacity = hostWindow.getComputedStyle(form).opacity;
      if (opacity && opacity !== '1') start.opacity = end.opacity = opacity;
    }
    const complete = () => {
      setDragOffset(to);
      finish?.();
    };
    if (to === 0 && from >= 4) {
      // Keep the bottom edge covered while the sheet rebounds.
      const rebound = Math.min(1, from * .04);
      settleForm(start, end, { transform: `translateY(${rebound}px)` }, duration, complete);
    } else {
      animateForm([start, end], duration, complete, easing);
    }
  }

  function dismiss(offset) {
    if (!dialog.open || closing) return;
    clearGesture();
    if (reduceMotion() || !form.animate) {
      close();
      return;
    }
    closing = true;
    dialog.dataset.closing = 'true';
    if (dialog.dataset.mobile === 'true') {
      // Keep the input focused and the keyboard geometry stable until the sheet leaves.
      animateSheet(offset ?? currentSheetOffset(), form.getBoundingClientRect().height + 16, 280, close, EASE_OUT_OF_VIEW);
    } else {
      const style = hostWindow.getComputedStyle(form);
      animateForm([
        { opacity: style.opacity ?? '1', transform: style.transform ?? 'none', clipPath: style.clipPath ?? 'none' },
        { opacity: 0, transform: 'translateY(6px) scale(.985)', clipPath: style.clipPath ?? 'none' },
      ], 220, close, EASE_OUT_OF_VIEW);
    }
  }

  function startGesture(event) {
    if (!dialog.open || dialog.dataset.mobile !== 'true' || closing || gesture || event.isPrimary === false || event.button > 0) return;
    if (event.currentTarget !== handle && event.target.closest('button, input, textarea, select, a')) return;
    suppressHandleClick = false;
    const offset = currentSheetOffset();
    cancelFormAnimation();
    setDragOffset(offset);
    gesture = {
      id: event.pointerId, target: event.currentTarget,
      x: event.clientX, y: event.clientY, startOffset: offset, offset,
      lastY: event.clientY, lastTime: event.timeStamp, speed: 0, active: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Prevent focus moving from the textfield to the grabber during a drag.
    event.preventDefault();
  }

  function moveGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.active) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        suppressHandleClick = true;
        const offset = gesture.offset;
        clearGesture();
        animateSheet(offset, 0, 230);
        return;
      }
      if (Math.abs(dy) <= 8 || Math.abs(dy) < Math.abs(dx)) return;
      gesture.active = true;
      dialog.dataset.dragging = 'true';
    }
    const elapsed = event.timeStamp - gesture.lastTime;
    if (event.clientY !== gesture.lastY && elapsed > 0) {
      gesture.speed = (event.clientY - gesture.lastY) / elapsed;
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;
    }
    gesture.offset = Math.max(0, gesture.startOffset + dy);
    setDragOffset(gesture.offset);
    event.preventDefault();
  }

  function finishGesture(event, canceled = false) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!canceled) moveGesture(event);
    if (!gesture) return;
    const { offset, speed, lastTime, active } = gesture;
    suppressHandleClick = active;
    clearGesture();
    if (!active) {
      if (offset > 0) animateSheet(offset, 0, 230);
      return;
    }
    const threshold = Math.min(96, Math.max(56, form.getBoundingClientRect().height * .25));
    const fast = offset >= 20 && speed >= .5 && event.timeStamp - lastTime <= 80;
    if (!canceled && (offset >= threshold || fast)) dismiss(offset);
    else animateSheet(offset, 0, 230);
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    for (const { input, description } of fields) {
      input.removeAttribute('aria-invalid');
      if (description) input.setAttribute('aria-describedby', description);
      else input.removeAttribute('aria-describedby');
    }
  }

  function showError(input, message) {
    const description = fields.find(field => field.input === input)?.description;
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', description ? `${description} ${error.id}` : error.id);
    input.focus({ preventScroll: true });
  }

  function syncClearButtons() {
    for (const field of fields) {
      field.clear.hidden = field.step !== step || !field.input.value;
    }
  }

  function resetField(input) {
    input.value = '';
    clearError();
    codeStatus.textContent = '';
    input.focus({ preventScroll: true });
    syncClearButtons();
  }

  function render(nextStep, focus = true) {
    step = nextStep;
    const completed = step === 'result' ? resultScreen : OUTCOMES[step];
    dialog.dataset.step = step;
    if (resultScreen) handle.setAttribute('aria-label', step === 'result' ? 'Закрыть' : 'Закрыть проверку номера');
    clearError();
    codeStatus.textContent = '';
    phoneStep.hidden = step !== 'phone';
    codeStep.hidden = step !== 'code';
    fieldPanel.hidden = step !== 'phone' && step !== 'code';
    confirmPanel.hidden = step !== 'confirm';
    confirmAction.hidden = step !== 'confirm';
    phoneLegal.hidden = step !== 'phone';
    confirmTerms.hidden = step !== 'confirm';
    phone.disabled = step !== 'phone';
    code.disabled = step !== 'code';
    codePhone.textContent = step === 'code' ? formatAccountPhone(phone.value) : '';
    status.hidden = !completed?.image;
    statusDescription.hidden = !completed?.description;
    statusDescription.textContent = completed?.description ?? '';
    next.hidden = step !== 'phone';
    resend.hidden = step !== 'code';
    action.hidden = !completed;
    title.textContent = completed?.title ?? (step === 'phone' ? phoneTitle : step === 'confirm' ? 'Откройте золотой счет,\nчтобы купить золото' : 'Подтверждение');
    if (step === 'code') syncResend();
    else stopResendTimer();
    if (completed || step === 'confirm') {
      if (completed?.image) statusImage.src = `/oms-account/${completed.image}.svg`;
      if (completed) action.textContent = completed.action;
      // Release the software keyboard before showing the result card.
      doc.activeElement?.blur();
      if (focus) title.focus({ preventScroll: true });
    } else if (focus) {
      (step === 'phone' ? phone : code).focus({ preventScroll: true });
    }
    syncClearButtons();
  }

  function showStep(nextStep) {
    if (reduceMotion() || !form.animate) {
      render(nextStep);
      return;
    }

    const previous = form.getBoundingClientRect();
    clearGesture();
    cancelFormAnimation();
    setDragOffset(0);
    render(nextStep);
    const current = form.getBoundingClientRect();
    const duration = nextStep === 'code' ? 260 : 360;

    if (dialog.dataset.mobile === 'true') {
      // Move the top edge from its previous position as the sheet grows upward.
      animateSheet(Math.max(0, previous.top - current.top), 0, duration);
    } else {
      // Reveal the extra height around the center without stretching the contents.
      const inset = Math.max(0, (current.height - previous.height) / 2);
      settleForm(
        { clipPath: `inset(${inset}px 0 round 24px)`, transform: 'none' },
        { clipPath: 'inset(0px 0 round 24px)', transform: 'none' },
        { transform: DESKTOP_REBOUND },
        duration,
      );
    }
  }

  function syncGeometry() {
    if (!dialog.open) return;
    if (gesture) {
      suppressHandleClick = gesture.active;
      clearGesture();
      cancelFormAnimation();
      setDragOffset(0);
    }
    const bounds = accountViewportBounds(preview?.getBoundingClientRect() ?? { width: hostWindow.innerWidth }, {
      width: hostWindow.innerWidth,
      height: hostWindow.innerHeight,
    }, hostWindow.visualViewport);
    const mobile = String(bounds.mobile);
    if (!closing && dialog.dataset.mobile !== mobile) {
      cancelFormAnimation();
      setDragOffset(0);
    }
    dialog.dataset.mobile = mobile;
    // Only the desktop's simulated phone clips the overlay to its preview.
    // A real phone needs the native full-screen backdrop and an unclipped
    // sheet surface below visualViewport.bottom, behind the keyboard.
    dialog.dataset.constrained = String(bounds.mobile && hostWindow.innerWidth > 700);
    for (const key of ['left', 'top', 'width', 'height']) {
      dialog.style.setProperty(`--account-${key}`, `${bounds[key]}px`);
    }
  }

  function release() {
    stopResendTimer();
    stopInstallOffer();
    clearGesture();
    cancelFormAnimation();
    setDragOffset(0);
    closing = false;
    suppressHandleClick = false;
    backdropPointer = false;
    delete dialog.dataset.closing;
    delete dialog.dataset.viewportReady;
    if (!scrollLock) return;
    doc.body.style.overflow = scrollLock.overflow;
    doc.body.style.paddingRight = scrollLock.paddingRight;
    scrollLock = null;
    // Test credentials are ephemeral, including after an Escape/backdrop close.
    phone.value = '';
    code.value = '';
    codePhone.textContent = '';
    codeStatus.textContent = '';
    activeTrigger?.setAttribute('aria-expanded', 'false');
    if (!returnFocus && doc.activeElement === activeTrigger) activeTrigger?.blur();
    activeTrigger = null;
    onOpenChange(false);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function close() {
    if (dialog.open) dialog.close();
    // Native close events are queued. Restore immediately so a close followed
    // by an immediate reopen cannot let the old event clear the new session.
    release();
  }

  function open(activation, initialStep = 'phone') {
    if (dialog.open) return;
    activeTrigger = activation?.currentTarget ?? trigger ?? doc.activeElement;
    const openedByPointer = activation?.detail > 0;
    returnFocus = openedByPointer ? null : activeTrigger;
    // Keep the native dialog from remembering the tapped button or an old input.
    if (openedByPointer) doc.activeElement?.blur();
    const selectedOutcome = typeof outcome === 'string' ? outcome : outcome.value;
    result = ['opened', 'existing', 'non-client', 'opening-error'].includes(selectedOutcome) ? selectedOutcome : 'opened';
    stopInstallOffer();
    resendDeadline = 0;
    phone.value = '';
    code.value = '';
    render(initialStep, false);
    scrollLock = { overflow: doc.body.style.overflow, paddingRight: doc.body.style.paddingRight };
    const scrollbar = Math.max(0, hostWindow.innerWidth - doc.documentElement.clientWidth);
    if (scrollbar) {
      const padding = parseFloat(hostWindow.getComputedStyle(doc.body).paddingRight) || 0;
      doc.body.style.paddingRight = `${padding + scrollbar}px`;
    }
    doc.body.style.overflow = 'hidden';
    dialog.showModal();
    syncGeometry();
    if (dialog.dataset.mobile === 'true' && dialog.dataset.constrained === 'false') {
      // Commit the initial bounds before focus starts the native keyboard resize.
      dialog.getBoundingClientRect();
      dialog.dataset.viewportReady = 'true';
    }
    activeTrigger?.setAttribute('aria-expanded', 'true');
    onOpenChange(true);
    // Focus the phone during its click to summon the keyboard on iOS.
    (initialStep === 'phone' ? phone : title).focus({ preventScroll: true });
    syncClearButtons();
    if (dialog.dataset.mobile === 'true') {
      settleForm(
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'none' },
        { transform: 'translateY(1px)' },
        300,
      );
    } else {
      settleForm(
        { opacity: 0, transform: 'translateY(6px) scale(.985)' },
        { opacity: 1, transform: 'none' },
        { transform: DESKTOP_REBOUND },
        250,
      );
    }
  }

  function submit(event) {
    event.preventDefault();
    if (!dialog.open || closing) return;
    if (step === 'phone') {
      const number = normalizeAccountPhone(phone.value);
      if (!number) {
        showError(phone, 'Введите номер телефона полностью');
        return;
      }
      phone.value = formatAccountPhone(number);
      restartResend();
      showStep('code');
    } else if (step === 'code') {
      if (!/^\d{4}$/.test(code.value.trim())) {
        showError(code, 'Введите код из СМС');
        return;
      }
      completeVerification();
    }
  }

  function completeVerification() {
    if (onVerified) {
      // Open the app from the same input event so Safari can use its user gesture.
      close();
      onVerified();
    } else {
      showStep(result === 'opened' || result === 'opening-error' ? 'confirm' : result);
    }
  }

  if (trigger) on(trigger, 'click', open);
  on(form, 'submit', submit);
  const updatePhone = inputType => {
    formatPhoneInput(phone, inputType);
    clearError();
    syncClearButtons();
  };
  on(phone, 'beforeinput', event => {
    if (!event.cancelable || event.isComposing || phone.selectionStart !== phone.selectionEnd) return;
    const caret = phone.selectionStart;
    if (caret === null || !phone.value.startsWith('+7 ')) return;
    const backward = event.inputType === 'deleteContentBackward';
    if (!backward && event.inputType !== 'deleteContentForward') return;
    if (phone.value[backward ? caret - 1 : caret] !== ' ') return;
    event.preventDefault();
    // The first separator belongs to the country code. Backspace crosses it.
    if (backward && caret === 3) {
      phone.setSelectionRange(2, 2);
      return;
    }
    const start = backward ? caret - 2 : caret;
    const end = backward ? caret : caret + 2;
    phone.setRangeText('', start, end, 'start');
    updatePhone(event.inputType);
  });
  on(phone, 'input', event => {
    if (!event.isComposing) updatePhone(event.inputType);
  });
  on(phone, 'compositionend', () => updatePhone());
  on(phone, 'blur', () => { phone.value = formatAccountPhone(phone.value); });
  on(code, 'input', event => {
    if (event.isComposing) return;
    code.value = code.value.replace(/\D/g, '').slice(0, 4);
    clearError();
    codeStatus.textContent = '';
    syncClearButtons();
    if (dialog.open && !closing && step === 'code' && code.value.length === 4) completeVerification();
  });
  on(code, 'keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) submit(event);
  });
  for (const field of fields) {
    on(field.input, 'focus', () => syncClearButtons(field.input));
    on(field.input, 'blur', event => syncClearButtons(event.relatedTarget));
    on(field.clear, 'blur', event => syncClearButtons(event.relatedTarget));
    on(field.clear, 'pointerdown', event => event.preventDefault());
    on(field.clear, 'click', () => {
      if (dialog.open && !closing && step === field.step) resetField(field.input);
    });
  }
  on(resend, 'pointerdown', event => event.preventDefault());
  on(resend, 'click', () => {
    if (!dialog.open || closing || step !== 'code' || now() < resendDeadline) return;
    resetField(code);
    restartResend();
    codeStatus.textContent = 'Код отправлен повторно';
  });
  on(confirmAction, 'click', () => {
    if (dialog.open && !closing && step === 'confirm') showStep(result);
  });
  on($('#account-close'), 'click', () => dismiss());
  on(handle, 'click', event => {
    if (suppressHandleClick && event.detail !== 0) {
      suppressHandleClick = false;
      event.preventDefault();
      return;
    }
    dismiss();
  });
  on(handle, 'pointerdown', startGesture);
  on(header, 'pointerdown', startGesture);
  on(hostWindow, 'pointermove', moveGesture, { passive: false });
  on(hostWindow, 'pointerup', event => finishGesture(event));
  on(hostWindow, 'pointercancel', event => finishGesture(event, true));
  on(hostWindow, 'lostpointercapture', event => finishGesture(event, true));
  on(action, 'click', () => {
    if (!dialog.open || closing) return;
    if (step === 'non-client') { showStep('requested'); return; }
    if (step === 'requested' || step === 'opening-error') { dismiss(); return; }
    const destination = step === 'result' ? resultScreen?.href : step === 'install' ? INSTALL_URL : ACCOUNT_DESTINATIONS[step];
    if (!destination) return;
    if ((step === 'opened' || step === 'existing') && dialog.dataset.mobile === 'true') {
      // Safari exposes neither app installation nor dismissal of its prompt.
      // Offer installation only if the page stays visible and focused after the
      // attempted handoff; a real departure cancels this fallback.
      close();
      installPending = true;
      scheduleInstallOffer();
    }
    navigate(destination);
  });
  on(dialog, 'cancel', event => { event.preventDefault(); dismiss(); });
  on(dialog, 'close', () => { if (!dialog.open) release(); });
  on(dialog, 'pointerdown', event => {
    backdropPointer = event.target === dialog;
    if (backdropPointer && dialog.dataset.mobile === 'true') event.preventDefault();
  });
  on(dialog, 'click', event => {
    if (event.target === dialog && backdropPointer) dismiss();
    backdropPointer = false;
  });
  on(hostWindow, 'resize', syncGeometry);
  on(hostWindow, 'scroll', syncGeometry, { passive: true });
  on(hostWindow, 'pagehide', close);
  on(hostWindow, 'focus', scheduleInstallOffer);
  on(hostWindow, 'pageshow', scheduleInstallOffer);
  if (doc.addEventListener) on(doc, 'visibilitychange', () => {
    if (doc.hidden) {
      stopInstallOffer();
      if (step === 'install') close();
    } else scheduleInstallOffer();
  });
  if (hostWindow.visualViewport) {
    on(hostWindow.visualViewport, 'resize', syncGeometry);
    on(hostWindow.visualViewport, 'scroll', syncGeometry);
  }
  const observer = hostWindow.ResizeObserver ? new hostWindow.ResizeObserver(syncGeometry) : null;
  if (preview) observer?.observe(preview);

  return {
    open,
    openResult() { if (resultScreen) open(undefined, 'result'); },
    close,
    destroy() {
      close();
      observer?.disconnect();
      listeners.forEach(remove => remove());
    },
  };
}
