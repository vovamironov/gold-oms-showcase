'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useViewerLoading() {
  const [ready, setReady] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const completed = useRef(false);
  const shownAt = useRef<number | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const finishTimer = useRef<number | undefined>(undefined);

  const markReady = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    window.clearTimeout(showTimer.current);
    const remaining = shownAt.current === null
      ? 0 : Math.max(0, 500 - (performance.now() - shownAt.current));
    const finish = () => {
      setShowLoader(false);
      setReady(true);
    };
    if (remaining === 0) finish();
    else finishTimer.current = window.setTimeout(finish, remaining);
  }, []);

  const cancelLoading = useCallback(() => {
    completed.current = true;
    window.clearTimeout(showTimer.current);
    window.clearTimeout(finishTimer.current);
    setShowLoader(false);
  }, []);

  useEffect(() => {
    showTimer.current = window.setTimeout(() => {
      if (completed.current) return;
      shownAt.current = performance.now();
      setShowLoader(true);
    }, 300);
    return () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(finishTimer.current);
    };
  }, []);

  return { ready, showLoader, markReady, cancelLoading };
}
