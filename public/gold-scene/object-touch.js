// Mobile ownership is decided once at the start of each gesture.
const TAP_DISTANCE = 8;
const TAP_DURATION = 450;

export function installObjectTouch(canvas, hitTest, { tapEnabled = () => true, allowPageScroll = () => true, allowSceneGestures = () => false, allowNativeTap = () => false, onTap, onObjectPointerDown } = {}) {
  const pointers = new Set();
  let owner = null;
  let tap = null;
  const moved = event => Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_DISTANCE;
  canvas.style.touchAction = 'pan-y pinch-zoom';

  canvas.addEventListener('pointerdown', event => {
    const touch = event.pointerType === 'touch';
    let hit;
    if (touch) {
      if (owner === null) {
        hit = hitTest(event.clientX, event.clientY);
        owner = hit || allowSceneGestures() ? 'object' : 'page';
      }
      pointers.add(event.pointerId);
      if (owner === 'page') event.stopImmediatePropagation();
    }
    if (!onTap || !tapEnabled()) return;
    if ((tap && tap.id !== event.pointerId) || pointers.size > 1 || event.isPrimary === false) {
      tap = null;
      return;
    }
    if (!touch && event.button !== 0) return;
    if (!touch) hit = hitTest(event.clientX, event.clientY);
    if (!hit && !touch) event.stopImmediatePropagation();
    if (hit) onObjectPointerDown?.();
    tap = hit ? { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: event.timeStamp, native: touch && allowNativeTap() } : null;
  }, { capture: true });
  if (onTap) canvas.addEventListener('pointermove', event => {
    if (tap?.id === event.pointerId && moved(event)) tap = null;
  }, { capture: true });

  // Inside a modal, a swipe on empty canvas must not pan the parent page.
  // Touchstart stays available for taps and pinch zoom outside the mesh.
  const touch = event => {
    const modalPan = event.type === 'touchmove' && event.touches?.length === 1 && !allowPageScroll();
    const nativeTapStart = event.type === 'touchstart' && tap?.native && pointers.size === 1;
    if (event.cancelable && !nativeTapStart && (owner === 'object' || modalPan)) event.preventDefault();
  };
  canvas.addEventListener('touchstart', touch, { passive: false });
  canvas.addEventListener('touchmove', touch, { passive: false });
  const release = event => {
    if (event.pointerType === 'touch') {
      pointers.delete(event.pointerId);
      if (!pointers.size) owner = null;
    }
    if (!tap || tap.id !== event.pointerId) return;
    const isTap = event.type === 'pointerup' && !moved(event) && event.timeStamp - tap.startedAt <= TAP_DURATION;
    const native = tap.native;
    tap = null;
    if (isTap && tapEnabled()) onTap(event, native);
  };
  canvas.addEventListener('pointerup', release, { capture: Boolean(onTap) });
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => { pointers.clear(); owner = null; tap = null; });
  return () => owner;
}
