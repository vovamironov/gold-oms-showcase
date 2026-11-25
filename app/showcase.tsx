'use client';

import { useRef, useState } from 'react';
import { useGoldQuote } from '@/hooks/use-gold-quote';
import type { GoldQuote } from '@/lib/cbr-gold';
import { getGoldAccountPrices } from '@/lib/gold-account-prices';
import { quantizeWeight } from '@/public/oms-hero-lab-v2/weight-scale.js';
import './oms/oms-showcase-base.css';
import { OmsFinalHero } from './oms/oms-final-hero';
import { AccountOpeningDialog, type AccountOpeningDialogHandle } from './oms/account-opening-dialog';
import type { AccountOutcome } from './oms/account-flow.js';

export function OmsShowcase({ initialGoldQuote, outcome = 'opened' }: {
  initialGoldQuote: GoldQuote;
  outcome?: AccountOutcome;
}) {
  const quote = useGoldQuote(initialGoldQuote);
  const { buy } = getGoldAccountPrices(quote.value);
  const [weight, setWeight] = useState(.1);
  const [animateNumbers, setAnimateNumbers] = useState(false);
  const accountDialog = useRef<AccountOpeningDialogHandle>(null);

  const updateWeight = (value: number, animate = false) => {
    setAnimateNumbers(animate);
    setWeight(quantizeWeight(value));
  };

  return <div className="oms-landing" data-variant="b">
    <main className="oms-page">
      <OmsFinalHero
        weight={weight}
        buy={buy}
        animated={animateNumbers}
        onWeightChange={updateWeight}
        onBuy={event => accountDialog.current?.open(event)}
      />
    </main>
    <AccountOpeningDialog ref={accountDialog} outcome={outcome} minimumPurchaseAmount={buy / 10} />
  </div>;
}
