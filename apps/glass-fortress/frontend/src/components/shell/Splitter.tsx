'use client';

import { useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// THE DRAG HANDLES — docs/gf-ui-refactor-plan.md §9 :1058–:1060; canvas page 1's `.split` and `.side .edge`.
//
// Two handles, one component: the SPLITTER between the centre and the right pane, and the sidebar's own drag
// EDGE. They differ only in which direction a drag widens the region, so they are one implementation with a
// sign rather than two components that will drift.
//
// IT IS A `separator`, NOT A BUTTON. The role carries `aria-orientation` and `aria-valuenow`, so the width is
// readable and adjustable without a mouse: a keyboard reader moves it with the arrow keys, which is the only
// way this control exists at all for them. A `<div>` with a mousedown handler would be invisible to everyone
// not holding a pointer.
//
// WHAT NO CASE HERE CAN SEE: the drag. jsdom has no layout, so a pointer drag moves nothing it can measure —
// the case holds the keyboard half and the accessible name, and the drag itself is read in the local run.
// ---------------------------------------------------------------------------

/** How much one arrow-key press moves a boundary, in pixels. */
const STEP = 16;

export interface SplitterProps {
  /** `sidebar` widens away from the inline start; `pane` widens towards it. */
  kind: 'sidebar' | 'pane';
  label: string;
  width: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
}

export function Splitter({ kind, label, width, min, max, onResize }: SplitterProps) {
  const dragging = useRef(false);
  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, next)), [min, max]);

  // THE LATEST WIDTH, not the one this render closed over. A held arrow key fires faster than React
  // re-renders, and every press in a burst would otherwise compute from the SAME stale `width` and land on
  // the same single step — measured in the local run: four presses moved the sidebar 16px, not 64px. The ref
  // re-adopts the prop on every render, so it is never a second source of truth.
  const latest = useRef(width);
  useEffect(() => {
    latest.current = width;
  }, [width]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const towardsStart = event.key === 'ArrowLeft';
    const towardsEnd = event.key === 'ArrowRight';
    if (!towardsStart && !towardsEnd) return;
    event.preventDefault();
    // The sidebar sits at the inline start and the pane at the inline end, so the same key moves them in
    // opposite directions in width terms. One sign, stated once.
    const direction = kind === 'sidebar' ? 1 : -1;
    const next = clamp(latest.current + (towardsEnd ? STEP : -STEP) * direction);
    latest.current = next;
    onResize(next);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const fromStart = event.clientX;
      onResize(clamp(kind === 'sidebar' ? fromStart : globalThis.innerWidth - fromStart));
    };
    const onUp = () => {
      dragging.current = false;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [kind, clamp, onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-shell-splitter={kind}
      className={kind === 'sidebar' ? 'shell-edge' : 'shell-splitter'}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
    >
      <span className="shell-grip" />
    </div>
  );
}
