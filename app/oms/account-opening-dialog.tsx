import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createAccountFlow, type AccountFlow, type AccountOutcome, type AccountResultScreen } from './account-flow.js';
import './account-flow.css';

export type AccountOpeningDialogHandle = Pick<AccountFlow, 'open' | 'openResult' | 'close'>;
type AccountOpeningDialogProps = { phoneTitle?: string; onVerified?: () => void; resultScreen?: AccountResultScreen; outcome?: AccountOutcome; minimumPurchaseAmount?: number };

const termsLink = 'https://www.tbank.ru/bank/help/debit-cards/tinkoff-black/additional-options/golden-account/';
const benefits = [
  { icon: 'gold', title: 'Начните с небольшой суммы' },
  { icon: 'exchange', title: 'Покупка и продажа 24/7', description: 'Даже в праздничные дни' },
  { icon: 'percent', title: 'Бесплатное обслуживание', description: 'И отсутствие комиссий' },
] as const;

// Keep opening and focusing synchronous with the caller's click: iOS only
// summons the keyboard while the initiating user gesture is still active.
export const AccountOpeningDialog = forwardRef<AccountOpeningDialogHandle, AccountOpeningDialogProps>(function AccountOpeningDialog({ phoneTitle = 'Введите номер телефона,\nчтобы открыть счет', onVerified, resultScreen, outcome = 'opened', minimumPurchaseAmount = 1076.53 }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const flow = useRef<AccountFlow | null>(null);
  const minimumPrice = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minimumPurchaseAmount);

  useImperativeHandle(ref, () => ({
    open: activation => flow.current?.open(activation),
    openResult: () => flow.current?.openResult(),
    close: () => flow.current?.close(),
  }), []);

  useEffect(() => {
    if (!dialog.current) return;
    const controller = createAccountFlow({ dialog: dialog.current, phoneTitle, onVerified, resultScreen, outcome });
    flow.current = controller;
    return () => {
      flow.current = null;
      controller.destroy();
    };
  }, [phoneTitle, onVerified, resultScreen, outcome]);

  return <dialog ref={dialog} id="account-dialog" aria-labelledby="account-flow-title" data-step="phone" data-mobile="false">
    <div className="account-flow-toolbar-surface" aria-hidden="true" />
    <form id="account-flow-form" className="account-flow-shell" noValidate>
      <button id="account-sheet-handle" className="account-flow-grabber" type="button" aria-label={onVerified ? 'Закрыть проверку номера' : 'Закрыть открытие счета'}><span aria-hidden="true" /></button>
      <header className="account-flow-header">
        <h2 id="account-flow-title" tabIndex={-1} aria-live="polite" aria-atomic="true">{phoneTitle}</h2>
        <button id="account-close" className="account-flow-close" type="button" aria-label="Закрыть"><span aria-hidden="true" /></button>
        <p id="account-code-subtitle" className="account-flow-description">Отправили код на номер <span id="account-code-phone" /></p>
        <p id="account-status-description" className="account-flow-description" hidden />
      </header>
      <div className="account-flow-fields">
        <div id="account-phone-step" className="account-flow-field">
          <label htmlFor="account-phone">Телефон</label>
          <input id="account-phone" className="account-flow-input" type="tel" inputMode="tel" autoComplete="tel" placeholder=" " enterKeyHint="next" spellCheck={false} required />
          <button id="account-clear-phone" className="account-flow-clear" type="button" aria-label="Очистить номер телефона" hidden><span aria-hidden="true" /></button>
        </div>
        <div id="account-code-step" className="account-flow-field" hidden>
          <label htmlFor="account-code">Код</label>
          <input id="account-code" className="account-flow-input" type="text" inputMode="numeric" autoComplete={onVerified ? 'off' : 'one-time-code'} placeholder=" " enterKeyHint="done" spellCheck={false} aria-describedby="account-code-subtitle" required />
          <button id="account-clear-code" className="account-flow-clear" type="button" aria-label="Очистить код" hidden><span aria-hidden="true" /></button>
        </div>
        <p id="account-field-error" role="alert" hidden />
        <button id="account-resend" className="account-flow-resend" type="button" hidden>Отправить еще раз</button>
      </div>
      <div id="account-confirm-panel" hidden>
        <ul className="account-confirm-benefits">
          {benefits.map(benefit => <li className="account-confirm-benefit" key={benefit.icon}>
            <span className="account-confirm-avatar" aria-hidden="true">
              {benefit.icon === 'percent' ? <span className="account-confirm-icon account-confirm-icon-percent" /> : <picture className="account-confirm-icon">
                <source media="(min-width: 701px)" srcSet={`/oms-account/benefit-${benefit.icon}-desktop.svg`} />
                <img src={`/oms-account/benefit-${benefit.icon}.svg`} width="24" height="24" alt="" />
              </picture>}
            </span>
            <span className="account-confirm-copy">
              <span className="account-confirm-title">{benefit.title}</span>
              <span className="account-confirm-description">{benefit.icon === 'gold' ? `Цена за 0,1 г золота — ${minimumPrice} ₽` : benefit.description}</span>
            </span>
          </li>)}
        </ul>
      </div>
      <div id="account-status-panel" hidden>
        <img id="account-status-image" src="/oms-account/thumb-up.svg" width="220" height="220" alt="" aria-hidden="true" />
      </div>
      <footer className="account-flow-footer">
        <div className="account-flow-actions">
          <button id="account-continue" className="account-flow-primary" type="submit">Продолжить</button>
          <button id="account-confirm-action" className="account-flow-primary" type="button" hidden>Открыть счет</button>
          <button id="account-status-action" className="account-flow-primary" type="button" hidden>Купить золото</button>
        </div>
        <p id="account-phone-legal" className="account-flow-legal">Заполняя форму,<br />вы соглашаетесь <a href={termsLink} target="_blank" rel="noopener noreferrer">с условиями</a></p>
        <p id="account-confirm-terms" className="account-flow-legal" hidden>Нажимая «Открыть счет»<br />вы соглашаетесь <a href={termsLink} target="_blank" rel="noopener noreferrer">с условиями</a></p>
      </footer>
      <p id="account-code-status" className="sr-only" role="status" />
    </form>
  </dialog>;
});
