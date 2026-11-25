'use client';

import NumberFlow, { type Format } from '@number-flow/react';

const priceFormat = { maximumFractionDigits: 2 };
const priceMotionTiming = { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)' };
const priceOpacityTiming = { duration: 180, easing: 'ease-out' };

export function AnimatedBullionPrice({ value, className = 'bars-price-number', format = priceFormat, animated = true }: { value: number; className?: string; format?: Format; animated?: boolean }) {
  return <NumberFlow
    className={className}
    value={value}
    locales="ru-RU"
    format={format}
    animated={animated}
    suffix=" ₽"
    transformTiming={priceMotionTiming}
    spinTiming={priceMotionTiming}
    opacityTiming={priceOpacityTiming}
    respectMotionPreference
  />;
}

