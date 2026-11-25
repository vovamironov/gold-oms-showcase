function blurInspectionFocus(anchor: HTMLElement | null) {
  const active = anchor?.ownerDocument.activeElement as HTMLElement | null | undefined;
  if (active && anchor?.contains(active)) active.blur();
}

// Give WebKit several frames after its toolbar layout settles to read the tint.
const safariTintSampleMs = 500;

function anchorSafariInspection(dialog: HTMLDialogElement) {
  if (!globalThis.CSS?.supports('-webkit-touch-callout', 'none') || !dialog.closest('.bars-final-surface,.oms-landing')) return;

  // The top-layer dialog stays modal, but its absolute box is relative to the document.
  const sync = () => dialog.style.setProperty('--inspection-scroll-top', `${window.scrollY}px`);
  sync();
  dialog.setAttribute('data-document-positioned', '');
  const doc = dialog.ownerDocument;
  const root = doc.documentElement;
  const themeColor = doc.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  const previousThemeColor = themeColor?.content;
  // Change the existing document hint before showModal(). Don't change the
  // document's color-scheme metadata: WebKit can give the transparent 3D iframe
  // an opaque canvas when the embedding document and frame schemes differ.
  if (themeColor) themeColor.content = window.getComputedStyle(root).getPropertyValue('--inspection-surface-color').trim();
  let restorePending = true;
  const restoreChrome = () => {
    if (!restorePending) return;
    restorePending = false;
    root.removeAttribute('data-safari-inspection');
    if (themeColor && previousThemeColor !== undefined) themeColor.content = previousThemeColor;
  };
  // The React closing commit starts the scene fade before dialog.close().
  // Restore the light hint before the next paint, even if the 3D return takes longer.
  const observer = new MutationObserver(() => {
    if (dialog.dataset.closing || !dialog.open) restoreChrome();
  });
  observer.observe(dialog, { attributeFilter: ['data-closing', 'open'] });
  // Leave the lower edge to the scene. A fixed element there replaces the
  // translucent toolbar backdrop with a solid band until the sample expires.
  const tintSample = doc.createElement('div');
  tintSample.className = 'bars-inspection-toolbar-sample';
  tintSample.setAttribute('aria-hidden', 'true');
  const removeTintSample = () => tintSample.remove();
  let releaseTintSample: number | undefined;
  const sampleTint = () => {
    if (!dialog.open || dialog.dataset.closing || doc.hidden) return;
    if (!tintSample.isConnected) dialog.append(tintSample);
    window.clearTimeout(releaseTintSample);
    // Remove the fixed paint so Safari's floating glass shows the scene again.
    releaseTintSample = window.setTimeout(removeTintSample, safariTintSampleMs);
  };
  // Paint the viewport edge after WebKit has moved the iframe to the top layer.
  const tint = window.requestAnimationFrame(() => {
    if (!dialog.open || !restorePending) return;
    root.setAttribute('data-safari-inspection', '');
    sampleTint();
  });
  window.addEventListener('scroll', sync, { passive: true });
  window.visualViewport?.addEventListener('resize', sampleTint);
  doc.addEventListener('visibilitychange', sampleTint);
  return () => {
    observer.disconnect();
    window.cancelAnimationFrame(tint);
    window.clearTimeout(releaseTintSample);
    removeTintSample();
    restoreChrome();
    window.removeEventListener('scroll', sync);
    window.visualViewport?.removeEventListener('resize', sampleTint);
    doc.removeEventListener('visibilitychange', sampleTint);
    dialog.removeAttribute('data-document-positioned');
    dialog.style.removeProperty('--inspection-scroll-top');
  };
}

export function showInspectionDialog(
  dialog: HTMLDialogElement, anchor: HTMLElement | null, closeButton: HTMLElement | null, keyboard: boolean,
) {
  const releasePosition = anchorSafariInspection(dialog);
  if (keyboard) {
    dialog.showModal();
    closeButton?.focus({ preventScroll: true });
    return releasePosition;
  }

  // Otherwise the dialog can remember the focused hero iframe as its return target.
  blurInspectionFocus(anchor);
  dialog.setAttribute('autofocus', '');
  try {
    dialog.showModal();
  } finally {
    dialog.removeAttribute('autofocus');
  }
  if (dialog.ownerDocument.activeElement !== dialog) dialog.focus({ preventScroll: true });
  return releasePosition;
}

export function restoreInspectionFocus(anchor: HTMLElement | null, trigger: HTMLElement | null, keyboard: boolean) {
  if (keyboard) trigger?.focus({ preventScroll: true });
  else blurInspectionFocus(anchor);
}
