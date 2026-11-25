'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { restoreInspectionFocus, showInspectionDialog } from '@/lib/inspection-dialog-focus';
import { nuggetMorphForWeight, nuggetScaleForWeight, staticNuggetForWeight } from '@/public/oms-hero-lab-v2/nugget-growth.js';
import { NuggetViewer } from './nugget-viewer';
import { nuggetInspectionGeometry } from './nugget-inspection-geometry.js';
import type { HeroInspectionEvent } from '../hero-inspection-hint';
import '../bars/bullion-inspection-viewer.css';
import './nugget-inspection-viewer.css';

type Box = { width: number; height: number; left: number; top: number };
type InspectionDustWindow = Window & { setInspectionDustVisible?: (visible: boolean) => void };
const easing = 'cubic-bezier(.22,1,.36,1)';
const mobileHero = '(max-width: 767px)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const geometry = (rect: Box) => nuggetInspectionGeometry(rect, { width: innerWidth, height: innerHeight });

function visibleInspectionSize(modal: HTMLDialogElement) {
  if (!matchMedia(mobileHero).matches) return { width: innerWidth, height: innerHeight };
  const bounds = modal.getBoundingClientRect();
  const style = getComputedStyle(modal);
  const inset = (edge: string) => parseFloat(style.getPropertyValue(`--oms-safe-${edge}`)) || 0;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const halfWidth = bounds.width / 2;
  const halfHeight = bounds.height / 2;
  const x = bounds.left + halfWidth;
  const y = bounds.top + halfHeight;
  return {
    width: 2 * Math.max(.5, Math.min(halfWidth - inset('left'), halfWidth - inset('right'),
      x - left, left + (viewport?.width ?? innerWidth) - x)),
    height: 2 * Math.max(.5, Math.min(halfHeight - inset('top'), halfHeight - inset('bottom'),
      y - top, top + (viewport?.height ?? innerHeight) - y)),
  };
}

// The same mounted iframe keeps the model's rotation through the handoff.
export function NuggetInspectionViewer({ weight, onHeroInspectionEvent }: {
  weight: number;
  onHeroInspectionEvent?: (event: HeroInspectionEvent) => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLIFrameElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const keyboardFocus = useRef(false);
  const animation = useRef<Animation | null>(null);
  const phase = useRef<'closed' | 'opening' | 'open' | 'closing'>('closed');
  const [box, setBox] = useState<Box | null>(null);
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const dustActive = Boolean(box && !closing && status === 'ready');
  const currentScale = useRef(1);
  const frame = useCallback(() => stage.current?.querySelector('iframe'), []);
  const inspect = useCallback((active: boolean, scale = 1) => {
    const modal = dialog.current;
    const viewport = active && modal?.open ? visibleInspectionSize(modal) : undefined;
    frame()?.contentWindow?.postMessage({ type: 'nugget-inspect', active, renderScale: scale, viewport }, location.origin);
  }, [frame]);
  const syncDust = useCallback(() => {
    const effect = dust.current;
    const scene = effect?.contentWindow as InspectionDustWindow | null | undefined;
    const visible = Boolean(dialog.current?.open && phase.current !== 'closing' && effect?.dataset.dustActive === 'true' && !document.hidden);
    if (scene?.setInspectionDustVisible) scene.setInspectionDustVisible(visible);
    else scene?.postMessage({ type: 'inspection-dust-visible', visible }, location.origin);
  }, []);
  const open = useCallback((keyboard: boolean) => {
    if (!anchor.current || phase.current !== 'closed' || status === 'loading') return;
    keyboardFocus.current = keyboard;
    onHeroInspectionEvent?.('interacted');
    const rect = anchor.current.getBoundingClientRect();
    if (status === 'error') { setStatus('loading'); setAttempt(value => value + 1); }
    setBox({ width: rect.width, height: rect.height, left: rect.left, top: rect.top });
  }, [onHeroInspectionEvent, status]);
  const restoreInline = useCallback(() => {
    const modal = dialog.current, viewer = stage.current;
    if (!modal || !viewer || phase.current === 'closed') return;
    // Native close events are queued. Restore all layout synchronously in this
    // task, before the browser can paint the former modal scale in the hero.
    if (modal.open) modal.close();
    phase.current = 'closed';
    animation.current?.cancel(); animation.current = null;
    viewer.style.removeProperty('transform');
    inspect(false);
    flushSync(() => { setBox(null); setClosing(false); });
    restoreInspectionFocus(anchor.current, trigger.current, keyboardFocus.current);
    if (keyboardFocus.current && !trigger.current) frame()?.contentDocument?.querySelector('canvas')?.focus({ preventScroll: true });
  }, [frame, inspect]);
  const close = useCallback((keyboard: boolean) => {
    const modal = dialog.current, viewer = stage.current, inline = anchor.current;
    if (!modal?.open || !viewer || !inline || phase.current === 'closing') return;
    keyboardFocus.current = keyboard;
    phase.current = 'closing';
    flushSync(() => setClosing(true));
    syncDust();
    const transform = getComputedStyle(viewer).transform;
    animation.current?.cancel();
    const leave = viewer.animate([{ transform }, { transform: geometry(inline.getBoundingClientRect()).inline }], {
      duration: reduced() ? 0 : 420, easing, fill: 'both',
    });
    animation.current = leave;
    void leave.finished.then(() => { if (animation.current === leave) restoreInline(); }).catch(() => {});
  }, [restoreInline, syncDust]);

  useLayoutEffect(() => {
    if (!box || !dialog.current || !stage.current) return;
    const modal = dialog.current, viewer = stage.current;
    const overflow = document.body.style.overflow, paddingRight = document.body.style.paddingRight;
    const scrollbar = innerWidth - document.documentElement.clientWidth;
    if (scrollbar > 0) document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + scrollbar}px`;
    document.body.style.overflow = 'hidden';
    phase.current = 'opening';
    const transforms = geometry(box);
    currentScale.current = transforms.scale;
    const releasePosition = showInspectionDialog(modal, anchor.current, closeButton.current, keyboardFocus.current);
    syncDust();
    inspect(true, transforms.scale);
    const enter = viewer.animate([{ transform: transforms.inline }, { transform: transforms.full }], {
      duration: reduced() ? 0 : 560, easing, fill: 'both',
    });
    animation.current = enter;
    void enter.finished.then(() => { if (phase.current === 'opening') phase.current = 'open'; }).catch(() => {});
    return () => {
      animation.current?.cancel(); animation.current = null;
      if (modal.open) modal.close();
      releasePosition?.();
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [box, inspect, syncDust]);

  useLayoutEffect(syncDust, [dustActive, syncDust]);
  useEffect(() => { if (status === 'ready' && box) inspect(true, currentScale.current); }, [status, box, inspect, attempt]);
  useEffect(() => {
    const mobile = matchMedia(mobileHero);
    const syncMobileScale = () => frame()?.contentWindow?.postMessage({ type: 'nugget-hero-tap-mode', enabled: mobile.matches, tapEnabled: true }, location.origin);
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame()?.contentWindow) return;
      if (event.data?.type === 'nugget-ready') syncMobileScale();
      if (event.data?.type === 'nugget-hero-interaction') onHeroInspectionEvent?.('interacted');
      if (event.data?.type === 'nugget-hero-tap') open(event.data.keyboard === true);
      if (event.data?.type === 'nugget-inspect-close') close(true);
      if (event.data?.type === 'nugget-inspection-wind' && dialog.current?.open && phase.current !== 'closing' && !document.hidden && Number.isFinite(event.data.x) && Number.isFinite(event.data.y)) {
        dust.current?.contentWindow?.postMessage({ type: 'inspection-dust-wind', x: event.data.x, y: event.data.y }, location.origin);
      }
    };
    const resize = () => {
      if ((phase.current !== 'opening' && phase.current !== 'open') || !anchor.current || !stage.current || !dialog.current) return;
      const rect = anchor.current.getBoundingClientRect(), transforms = geometry(rect);
      phase.current = 'open';
      currentScale.current = transforms.scale;
      dialog.current.style.setProperty('--inspection-width', `${rect.width}px`);
      dialog.current.style.setProperty('--inspection-height', `${rect.height}px`);
      animation.current?.cancel(); animation.current = null;
      stage.current.style.transform = transforms.full;
      inspect(true, transforms.scale);
    };
    const updateVisibleSize = () => {
      if (phase.current === 'opening' || phase.current === 'open') inspect(true, currentScale.current);
    };
    const visualViewport = window.visualViewport;
    window.addEventListener('message', receive);
    window.addEventListener('resize', resize);
    visualViewport?.addEventListener('resize', updateVisibleSize);
    visualViewport?.addEventListener('scroll', updateVisibleSize);
    mobile.addEventListener('change', syncMobileScale);
    document.addEventListener('visibilitychange', syncDust);
    syncMobileScale();
    return () => {
      window.removeEventListener('message', receive);
      window.removeEventListener('resize', resize);
      visualViewport?.removeEventListener('resize', updateVisibleSize);
      visualViewport?.removeEventListener('scroll', updateVisibleSize);
      mobile.removeEventListener('change', syncMobileScale);
      document.removeEventListener('visibilitychange', syncDust);
    };
  }, [close, frame, inspect, onHeroInspectionEvent, open, syncDust]);

  return <div className="bars-inspection oms-inspection" data-model-ready={status === 'ready'} ref={anchor}>
    {!box && status === 'error' && <Button ref={trigger} className="bars-inspection-button bars-inspection-expand" data-model-trigger variant="ghost" size="icon" aria-label="Рассмотреть золото" aria-haspopup="dialog" onClick={event => open(event.detail === 0)} />}
    <dialog ref={dialog} className="bars-inspection-window oms-inspection-window" role={box ? 'dialog' : 'presentation'} aria-modal={box ? true : undefined} aria-label={box ? 'Просмотр золота' : undefined} data-mobile-layout="centered" data-gold-rays data-rays-standby={dustActive || undefined} data-inspection-palette="amber" data-closing={closing || undefined} data-inspection-state={box && status === 'error' ? 'error' : undefined} style={box ? { '--inspection-width': `${box.width}px`, '--inspection-height': `${box.height}px` } as CSSProperties : undefined} onCancel={event => { event.preventDefault(); close(true); }} onClose={() => { if (!dialog.current?.open) restoreInline(); }}>
      <div className="bars-inspection-surface" aria-hidden="true" />
      {status === 'ready' && <iframe ref={dust} className="bars-inspection-dust" title="Золотая пыльца" aria-hidden="true" tabIndex={-1} data-dust-active={dustActive} src="/inspection-effects/dust.html?rays=1&palette=amber&standby=1" onLoad={syncDust} />}
      <div ref={stage} className="bars-inspection-stage"><NuggetViewer key={attempt} weight={nuggetMorphForWeight(weight)} displayScale={nuggetScaleForWeight(weight)} mobileModelScale={1.3} fallback={staticNuggetForWeight(weight)} enableHeroTap onStateChange={setStatus} /></div>
      {box && status === 'error' && <div className="bars-inspection-status"><div className="bars-inspection-error" role="alert"><img src="/bars-assets/inspection/load-error-dark.svg" width="144" height="144" alt="" /><h2>Не загрузилось</h2><p>Попробуйте обновить</p><Button className="bars-inspection-retry" variant="secondary" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>Обновить</Button></div></div>}
      {box && <Button ref={closeButton} className="bars-inspection-button bars-inspection-close" variant="ghost" size="icon" aria-label="Закрыть просмотр золота" onClick={event => close(event.detail === 0)}><span className="bars-inspection-close-icon" aria-hidden="true" /></Button>}
    </dialog>
  </div>;
}
