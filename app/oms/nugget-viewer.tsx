'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useViewerLoading } from '@/hooks/use-viewer-loading';

export function NuggetViewer({ weight, displayScale, mobileModelScale = 1, fallback, enableHeroTap, onStateChange }: { weight: number; displayScale?: number; mobileModelScale?: number; fallback?: { index: number; scale: number }; enableHeroTap?: boolean; onStateChange?: (state: 'loading' | 'ready' | 'error') => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latestWeight = useRef(weight);
  const latestScale = useRef(displayScale);
  const [initialScale] = useState(displayScale);
  const visible = useRef(true);
  const [initialWeight] = useState(weight);
  const { ready, showLoader, markReady, cancelLoading } = useViewerLoading();
  const canReveal = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { onStateChange?.(failed ? 'error' : ready ? 'ready' : 'loading'); }, [ready, failed, onStateChange]);
  const sendWeight = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'nugget-select', weight: latestWeight.current, displayScale: latestScale.current }, window.location.origin);
  }, []);
  const sendVisibility = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: 'nugget-visible', visible: visible.current }, window.location.origin);
  }, []);
  const sendReveal = useCallback(() => {
    const sceneFrame = frame.current;
    if (!sceneFrame) return;
    const rect = sceneFrame.getBoundingClientRect();
    const reveal = canReveal.current && rect.height > 0 && rect.top <= window.innerHeight - Math.min(rect.height * .25, 160) && rect.bottom > 0;
    sceneFrame.contentWindow?.postMessage({ type: 'nugget-reveal', reveal }, window.location.origin);
  }, []);

  useEffect(() => {
    canReveal.current = ready && !failed;
    if (!canReveal.current) return;
    const scheduled = window.requestAnimationFrame(sendReveal);
    return () => window.cancelAnimationFrame(scheduled);
  }, [ready, failed, sendReveal]);

  useEffect(() => { latestWeight.current = weight; latestScale.current = displayScale; sendWeight(); }, [weight, displayScale, sendWeight]);
  useEffect(() => {
    let waitingForReady = true;
    const stopWaiting = () => {
      waitingForReady = false;
      window.clearTimeout(timeout);
      window.clearInterval(handshake);
    };
    const fail = () => {
      stopWaiting();
      cancelLoading();
      setFailed(true);
    };
    const timeout = window.setTimeout(fail, 30000);
    const handshake = window.setInterval(() => {
      frame.current?.contentWindow?.postMessage({ type: 'nugget-ready-request' }, window.location.origin);
    }, 1000);
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.type === 'nugget-error') {
        fail();
        return;
      }
      if (event.data?.type !== 'nugget-ready' || !waitingForReady) return;
      stopWaiting();
      markReady();
      sendWeight();
      sendVisibility();
      sendReveal();
    };
    window.addEventListener('message', receive);
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      sendVisibility(); sendReveal();
    }, { rootMargin: '100px' });
    if (frame.current) observer.observe(frame.current);
    return () => {
      stopWaiting();
      observer.disconnect();
      window.removeEventListener('message', receive);
    };
  }, [sendWeight, sendVisibility, sendReveal, markReady, cancelLoading]);
  useEffect(() => {
    let scheduled = 0;
    const schedule = () => {
      if (!scheduled) scheduled = window.requestAnimationFrame(() => { scheduled = 0; sendReveal(); });
    };
    sendReveal();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.cancelAnimationFrame(scheduled);
    };
  }, [sendReveal]);

  return <div className={`oms-nugget-viewer${ready && !failed ? ' is-ready' : ''}`} aria-busy={!ready && !failed}
    style={mobileModelScale === 1 ? undefined : { '--oms-nugget-mobile-scale': mobileModelScale } as CSSProperties}>
    {!failed && <iframe ref={frame} src={`/oms-nugget-viewer/index.html?stage=${initialWeight}${initialScale === undefined ? '' : `&displayScale=${initialScale}`}${mobileModelScale === 1 ? '' : `&mobileModelScale=${mobileModelScale}`}&objectTouch=1${enableHeroTap ? '&heroInspectTap=1' : ''}&v=51`} title="Золотой самородок в 3D — потяните для вращения" aria-hidden={!ready} onLoad={() => {
      sendWeight(); sendVisibility(); sendReveal();
      frame.current?.contentWindow?.postMessage({ type: 'nugget-ready-request' }, window.location.origin);
    }} />}
    {showLoader && !failed && <div className="oms-nugget-loader"><img src="/oms-hero-lab/tui-loader.svg" width="40" height="40" alt="Загрузка самородка" /></div>}
    {failed && <img className="oms-nugget-fallback" src={`/oms-hero-lab/static-weights/weight-${String(fallback?.index ?? Math.max(1, Math.min(100, Math.round(weight * 10)))).padStart(3, '0')}.webp`} alt="Золотой самородок" style={fallback ? { transform: `translateX(-50%) scale(calc(${fallback.scale} * var(--oms-nugget-fallback-boost, 1)))` } : undefined} />}
  </div>;
}
