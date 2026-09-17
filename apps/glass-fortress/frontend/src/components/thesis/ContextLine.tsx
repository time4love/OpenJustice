'use client';

import { useEffect, useState } from 'react';

/**
 * THE STICKY CONTEXT LINE — docs/gf-ui-flows.md §4 :159–:160 ("which thesis … never leaves the top"), §17 :531
 * ("sticky as the context line once scrolled past"). It appears when the claim's own heading leaves the viewport,
 * so a reader deep in the text always knows which thesis they are inside.
 *
 * `IntersectionObserver` is the browser's; where it does not exist (jsdom, a very old browser) the line simply
 * stays hidden — a missing observer must never take the page down with it.
 */
export function ContextLine({ claim, watch }: { claim: string; watch: string }) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const target = document.getElementById(watch);
    if (target === null) return;
    const observer = new IntersectionObserver((entries) => setPast(entries.some((entry) => !entry.isIntersecting)));
    observer.observe(target);
    return () => observer.disconnect();
  }, [watch]);

  if (!past) return null;
  return (
    <p data-context-line dir="auto" className="sticky-line overflow-hidden text-ellipsis whitespace-nowrap border-b border-line bg-surface py-1 text-sm text-ink-muted">
      {claim}
    </p>
  );
}
