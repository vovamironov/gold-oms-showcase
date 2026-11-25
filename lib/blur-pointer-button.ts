import type { MouseEvent } from 'react';

export function blurPointerButton(event: MouseEvent<HTMLElement>) {
  if (event.detail === 0 || !(event.target instanceof Element)) return;
  event.target.closest('button')?.blur();
}
