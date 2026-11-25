'use client';

import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import './hero-inspection-hint.css';

type HeroFlightFrame = { progress: number; offsetY: number };
export type HeroInspectionEvent = 'interacted' | HeroFlightFrame;

export function useHeroInspectionHint() {
  const hintRef = useRef<HTMLParagraphElement>(null);
  const dismissed = useRef(false);
  const onHeroInspectionEvent = useCallback((event: HeroInspectionEvent) => {
    const hint = hintRef.current;
    if (event === 'interacted') {
      dismissed.current = true;
      if (hint) {
        hint.dataset.state = 'dismissed';
        hint.setAttribute('aria-hidden', 'true');
      }
    } else if (hint && !dismissed.current && Number.isFinite(event?.offsetY)) {
      hint.style.setProperty('--hero-flight-offset', `${event.offsetY}px`);
      if (event.progress === 1) {
        hint.dataset.state = 'visible';
        hint.setAttribute('aria-hidden', 'false');
      }
    }
  }, []);
  useLayoutEffect(() => {
    const scene = hintRef.current?.parentElement;
    if (!scene) return;
    const update = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement) onHeroInspectionEvent((event as CustomEvent<HeroFlightFrame>).detail);
    };
    scene.addEventListener('gold-hero-flight', update);
    return () => scene.removeEventListener('gold-hero-flight', update);
  }, [onHeroInspectionEvent]);
  return { hintRef, onHeroInspectionEvent };
}

export function HeroInspectionHint({ hintRef, hidden, children }: { hintRef: RefObject<HTMLParagraphElement | null>; hidden?: boolean; children: ReactNode }) {
  return <p ref={hintRef} className="hero-inspection-hint" data-state="flight" aria-hidden="true" hidden={hidden}>{children}</p>;
}
