'use client';

import { useEffect, useRef, useState, type ComponentProps, type MouseEventHandler } from 'react';
import NumberFlow from '@number-flow/react';
import { Button } from '@/components/ui/button';
import { blurPointerButton } from '@/lib/blur-pointer-button';
import { AnimatedBullionPrice } from './animated-price';
import { NuggetInspectionViewer } from './nugget-inspection-viewer';
import { PURCHASE_AMOUNT_PRESETS, quantizeWeight, weightForBudget } from '@/public/oms-hero-lab-v2/weight-scale.js';
import { OmsWeightSlider } from './oms-weight-slider';
import { DesktopProductBreadcrumbs } from '../desktop-product-breadcrumbs';
import { HeroInspectionHint, useHeroInspectionHint } from '../hero-inspection-hint';
import { ProductConfiguratorLink } from '../product-configurator-link';
import './oms-final-hero.css';

const money = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const format = { maximumFractionDigits: 2 };
const quoteMoney = new Intl.NumberFormat('ru-RU', format);
const weightFormat = { maximumFractionDigits: 1 };
const grams = new Intl.NumberFormat('ru-RU', weightFormat);

const groupSeparator = '\u00a0';
const mobileInputs = '(max-width: 767px)';
const stripInputFormatting = (value: string) => value.replace(/[\s₽г]/g, '');

function caretInFormattedNumber(value: string, characters: number) {
  let position = 0;
  while (position < value.length && characters > 0) {
    if (value[position] !== groupSeparator) characters--;
    position++;
  }
  return position;
}

export function OmsFinalHero({weight, buy, animated, onWeightChange, onBuy}: {
  weight: number; buy: number; animated: boolean; onWeightChange: (weight: number, animate?: boolean) => void; onBuy: MouseEventHandler<HTMLButtonElement>;
}) {
  const [editing, setEditing] = useState<'weight' | 'amount' | null>(null);
  const [draft, setDraft] = useState('');
  const editingInput = useRef<HTMLInputElement>(null);
  const { hintRef, onHeroInspectionEvent } = useHeroInspectionHint();
  const total = weight * buy;
  const choose = (value: number, animate = false) => onWeightChange(quantizeWeight(value), animate);
  const finishEditing = () => editingInput.current?.blur();

  useEffect(() => {
    const input = editingInput.current;
    const viewport = window.visualViewport;
    if (!editing || !input || !viewport || !window.matchMedia(mobileInputs).matches) return;
    const field = input.closest('.oms-final-field');
    if (!field) return;
    const navigation = document.querySelector('.product-mobile-nav');
    const heightBeforeKeyboard = window.innerHeight;
    const gap = 16;
    let frame = 0;

    const keepFieldVisible = () => {
      frame = 0;
      const layoutHeight = Math.max(heightBeforeKeyboard, document.documentElement.clientHeight);
      if (document.activeElement !== input || layoutHeight - viewport.height < 100) return;
      const visibleTop = Math.max(viewport.offsetTop, navigation?.getBoundingClientRect().bottom ?? 0) + gap;
      const visibleBottom = viewport.offsetTop + viewport.height - gap;
      const bounds = field.getBoundingClientRect();
      if (bounds.bottom > visibleBottom) {
        window.scrollBy({ top: bounds.bottom - visibleBottom, behavior: 'instant' });
      } else if (bounds.top < visibleTop && bounds.height <= visibleBottom - visibleTop) {
        window.scrollBy({ top: bounds.top - visibleTop, behavior: 'instant' });
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(keepFieldVisible);
    };
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
    schedule();
    return () => {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [editing]);

  function updateDraft(field: 'weight' | 'amount', input: HTMLInputElement, inputType?: string) {
    let value = input.value;
    let start = input.selectionStart ?? value.length;
    let end = input.selectionEnd ?? start;

    // When a delete removed only a generated separator, delete the adjacent digit as well.
    const backward = inputType === 'deleteContentBackward';
    if ((backward || inputType === 'deleteContentForward') && start === end
      && draft[start] === groupSeparator && value === draft.slice(0, start) + draft.slice(start + 1)) {
      const digit = backward ? start - 1 : start;
      value = value.slice(0, digit) + value.slice(digit + 1);
      start = end = digit;
    }

    const decimal = stripInputFormatting(value).replace('.', ',');
    const parts = /^(\d+)(,\d*)?$/.exec(decimal);
    if (!parts) {
      setDraft(input.value);
      return;
    }
    const formatted = parts[1].replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator) + (parts[2] ?? '');
    if (formatted !== input.value) {
      const from = caretInFormattedNumber(formatted, stripInputFormatting(value.slice(0, start)).length);
      const to = caretInFormattedNumber(formatted, stripInputFormatting(value.slice(0, end)).length);
      const direction = input.selectionDirection ?? 'none';
      // Update the value and selection together so React's commit doesn't move the caret.
      input.value = formatted;
      input.setSelectionRange(from, to, direction);
    }
    setDraft(formatted);
    const number = Number(decimal.replace(',', '.'));
    if (Number.isFinite(number)) choose(field === 'weight' ? number : weightForBudget(number, buy));
  }

  const inputProps = (field: 'weight' | 'amount', formatted: string): ComponentProps<'input'> => ({
    inputMode: 'decimal',
    enterKeyHint: 'send',
    autoComplete: 'off',
    value: editing === field ? draft : formatted,
    onFocus: event => {
      const input = event.currentTarget;
      const value = formatted.replace(/\s[₽г]$/, '');
      const caret = Math.min(input.selectionStart ?? value.length, value.length);
      editingInput.current = input;
      setEditing(field);
      setDraft(value);
      input.value = value;
      if (window.matchMedia(mobileInputs).matches) input.setSelectionRange(caret, caret);
      else input.select();
    },
    onChange: event => {
      const inputEvent = event.nativeEvent as InputEvent;
      if (inputEvent?.isComposing) setDraft(event.currentTarget.value);
      else updateDraft(field, event.currentTarget, inputEvent?.inputType);
    },
    onCompositionEnd: event => updateDraft(field, event.currentTarget),
    onBlur: () => {
      editingInput.current = null;
      setEditing(null);
    },
    onKeyDown: event => {
      if (!event.nativeEvent.isComposing && (event.key === 'Enter' || event.key === 'Escape')) {
        event.preventDefault();
        event.currentTarget.blur();
      }
    },
  });

  return <section className="oms-final-hero" aria-labelledby="oms-title" data-hero-revision="8485:51680">
    <DesktopProductBreadcrumbs product="oms" />
    <a className="oms-final-back" href="/">Назад</a>
    <div className="oms-final-copy">
      <h1 id="oms-title">Золотой счет<span className="oms-final-title-suffix"> в Т-Банке</span></h1>
      <p>
        <span className="oms-final-desktop-subtitle">Вы покупаете золото за рубли, а на счете он учитывается в граммах</span>
        <span className="oms-final-mobile-subtitle">Откройте золотой счёт, чтобы покупать<br /> и хранить золото в граммах</span>
      </p>
      <ProductConfiguratorLink product="oms" />
    </div>
    <div className="oms-final-scene" id="oms-showcase">
      <div className="oms-final-card" id="oms-configurator" tabIndex={-1} onClickCapture={blurPointerButton}>
        <h2>Сколько хотите купить</h2>
        <div className="oms-final-field oms-final-input-slider">
          <label htmlFor="oms-weight-input">Вес золота</label>
          <div className="oms-final-value">
            <input id="oms-weight-input" {...inputProps('weight', `${grams.format(weight)} г`)} />
            <span className="oms-final-number" aria-hidden="true">
              <NumberFlow animated={animated} value={weight} locales="ru-RU" format={weightFormat} suffix=" г" respectMotionPreference />
            </span>
          </div>
          <OmsWeightSlider className="oms-final-range" value={weight} onChange={choose} onPointerStart={finishEditing} label="Выбрать вес слайдером" describedBy="oms-weight-scale" />
        </div>
        <span id="oms-weight-scale" className="sr-only">От 0,1 до 1000 граммов. До 10 г — шаг 0,1 г, затем шаг 1 г.</span>
        <div className="oms-final-field oms-final-amount">
          <label htmlFor="oms-amount-input">Сумма покупки</label>
          <div className="oms-final-value">
            <input id="oms-amount-input" aria-describedby="oms-amount-scale" {...inputProps('amount', `${money.format(total)} ₽`)} />
            <span className="oms-final-number" aria-hidden="true">
              <AnimatedBullionPrice value={total} format={format} animated={animated} />
            </span>
          </div>
        </div>
        <span id="oms-amount-scale" className="sr-only">При вводе суммы выбирается максимальный доступный вес в пределах этой суммы.</span>
        <div className="oms-final-amount-suggestions" role="group" aria-label="Быстрый выбор суммы покупки">
          {PURCHASE_AMOUNT_PRESETS.map(amount => <Button key={amount} type="button" variant="outline" onClick={() => {
            finishEditing();
            choose(weightForBudget(amount, buy), true);
          }}>{quoteMoney.format(amount)}&nbsp;₽</Button>)}
        </div>
        <Button className="oms-final-buy oms-open-button" aria-haspopup="dialog" aria-controls="account-dialog" onClick={onBuy}>Открыть счет</Button>
        <p className="oms-final-hint">
          Расчет предварительный.
          <br />
          Купить золото можно после открытия счета
        </p>
      </div>
      <div className="oms-final-visual">
        <NuggetInspectionViewer weight={weight} onHeroInspectionEvent={onHeroInspectionEvent} />
        <HeroInspectionHint hintRef={hintRef}>Нажмите на золото, чтобы рассмотреть</HeroInspectionHint>
      </div>
    </div>
  </section>;
}
