'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { MAX_SLIDER_POSITION, MIN_WEIGHT_GRAMS, MAX_WEIGHT_GRAMS, weightToPosition, positionToWeight, nextWeight } from '@/public/oms-hero-lab-v2/weight-scale.js';
import './oms-weight-slider.css';

type Props = { value: number; onChange: (weight: number, animate?: boolean) => void; onPointerStart?: () => void; className: string; id?: string; label: string; describedBy?: string; valueText?: string };
type Gesture = { id: number; x: number; y: number; startedAt: number; active: boolean; dragging: boolean; touch: boolean; overlay: boolean; tap: boolean };
const tapDistance = 6;

/** Native range events may arrive after pointerup on iOS. Retain the completed
 * gesture classification until the next interaction, as in the accepted lab. */
export function OmsWeightSlider({ value, onChange, onPointerStart, className, id, label, describedBy, valueText }: Props) {
  const gesture = useRef<Gesture | null>(null);
  const touchLabel = useRef<HTMLLabelElement>(null);
  const touchSwitch = useRef<HTMLInputElement>(null);
  const switchId = useId();
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const control = touchSwitch.current;
    if (control && 'switch' in control && touchLabel.current) {
      control.setAttribute('switch', '');
      touchLabel.current.dataset.nativeHaptic = 'true';
    }
    const end = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current?.active || current.id !== event.pointerId) return;
      current.active = false;
      current.tap = event.isTrusted && !current.dragging && event.timeStamp - current.startedAt <= 450
        && Math.hypot(event.clientX - current.x, event.clientY - current.y) <= tapDistance;
      setPressed(false);
      if (current.tap && current.touch && !current.overlay && window.matchMedia('(max-width:767px)').matches) {
        window.navigator.vibrate?.(12);
      }
    };
    const cancel = (event: PointerEvent) => {
      if (gesture.current?.active && gesture.current.id === event.pointerId) {
        gesture.current = null;
        setPressed(false);
      }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', cancel); };
  }, []);

  function start(event: ReactPointerEvent, overlay = false) {
    if (event.button !== 0 || !event.isPrimary) return;
    onPointerStart?.();
    gesture.current = {
      id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: event.timeStamp,
      active: true, dragging: false, touch: event.pointerType === 'touch', overlay, tap: false,
    };
    setPressed(true);
  }

  function chooseAt(surface: HTMLElement, clientX: number, animate: boolean) {
    const { left, width } = surface.getBoundingClientRect();
    // Match the travel of the 12 px native thumb, measured from its center.
    const progress = Math.max(0, Math.min(1, (clientX - left - 6) / Math.max(1, width - 12)));
    onChange(positionToWeight(Math.round(progress * MAX_SLIDER_POSITION)), animate);
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current?.active || current.id !== event.pointerId) return;
    if (!current.dragging) {
      const dx = Math.abs(event.clientX - current.x), dy = Math.abs(event.clientY - current.y);
      if (Math.hypot(dx, dy) <= tapDistance) return;
      if (current.overlay && dy >= dx) {
        gesture.current = null;
        setPressed(false);
        return;
      }
      current.dragging = true;
      if (!current.overlay) onChange(value, false);
    }
    if (current.overlay) chooseAt(event.currentTarget, event.clientX, false);
  }

  const position = Math.round(weightToPosition(value));
  return <div className={`oms-weight-control ${className}`} data-pressed={pressed || undefined}>
    <input id={id} className="oms-weight-range" type="range" min={0} max={MAX_SLIDER_POSITION} step={1} value={position}
      aria-label={label} aria-valuetext={valueText ?? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)} г`} aria-describedby={describedBy}
      style={{ '--progress': `${position / MAX_SLIDER_POSITION * 100}%` } as CSSProperties}
      onPointerDown={event => start(event)} onPointerMove={move}
      onChange={event => onChange(positionToWeight(Number(event.currentTarget.value)), !gesture.current?.dragging)}
      onKeyDown={event => {
        gesture.current = null;
        setPressed(false);
        const directions: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 1, PageDown: -1 };
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault(); onChange(event.key === 'Home' ? MIN_WEIGHT_GRAMS : MAX_WEIGHT_GRAMS, false);
        } else if (directions[event.key]) {
          event.preventDefault(); let next = value;
          for (let i = 0; i < (event.key.startsWith('Page') ? 10 : 1); i++) next = nextWeight(next, directions[event.key]);
          onChange(next, false);
        }
      }} />
    <label ref={touchLabel} className="oms-weight-touch" htmlFor={switchId} aria-hidden="true"
      onPointerDown={event => start(event, true)} onPointerMove={move}
      onPointerUp={event => {
        const current = gesture.current;
        if (current?.active && current.overlay && current.dragging && current.id === event.pointerId) {
          chooseAt(event.currentTarget, event.clientX, false);
        }
      }}
      onClick={event => {
        const current = gesture.current;
        if (!event.isTrusted || !current?.overlay || !current.tap) {
          event.preventDefault();
          return;
        }
        current.tap = false;
        // Safari only plays switch haptics for a trusted activation of the label.
        if (!current.touch) event.preventDefault();
        chooseAt(event.currentTarget, event.clientX, true);
      }} />
    <input ref={touchSwitch} id={switchId} className="oms-weight-haptic-switch" type="checkbox"
      tabIndex={-1} aria-hidden="true" onFocus={event => event.currentTarget.blur()} />
  </div>;
}
