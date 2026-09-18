// ---------------------------------------------------------------------------
// THE PHONE'S SWIPE INTO THE RIGHT PANE — docs/gf-ui-flows.md §18 :564, amended 2026-09-18 on the researcher's
// ruling. The refusals are part of that clause, not an implementation's caution. FIVE of them are geometry and
// live here; the SIXTH — a gesture inside the open nav drawer — needs the shell's state and lives in Shell.tsx.
//
// THE PROBLEM IT SOLVES, in the researcher's words: on a phone the thesis page gives no easy way to reach
// what the desktop shows in the right pane. Today the ONLY door is a dated tick — `useOpenRecord`
// (`components/thesis/PaneTabs.tsx`), reached by pressing a document's date bubble — and a reader who does
// not press one never learns the pane is there. A swipe right opens it; a swipe left returns to the read.
//
// THIS MODULE IS PURE. It reads no React, holds no state and issues no request: it answers "what does this
// finger mean?" from two points and a viewport, so the whole decision is testable without a touch event and
// without layout. `Shell.tsx` owns the listeners and calls in here; nothing else may re-spell the decision
// (refactor plan §4: one helper per kind).
//
// WHY EACH GUARD EXISTS — every one of them is a way this gesture would otherwise STEAL a touch that
// belongs to something else, and a stolen touch reads as a defect rather than a feature:
//
//   · THE EDGE BELONGS TO THE OPERATING SYSTEM. A drag begun within `edgeGuard` of either side is the
//     platform's own — Safari's interactive back, Android's back, Control Centre — and a page that acts on
//     it fights the phone and loses. The gesture must therefore begin INSIDE the page, not at its border.
//   · A WIDE THING PANS ITSELF. The researcher's Markdown renders tables inside `.md-table-scroll` and code
//     inside its own scroller; a finger dragged across one of those is panning it, not asking for the pane.
//   · A SCROLL IS MOSTLY VERTICAL, AND A SWIPE IS MOSTLY NOT. Without `dominance` a diagonal flick during an
//     ordinary read would open the pane under the reader.
//   · A SLOW DRAG IS NOT A SWIPE. Past `maxDuration` the finger is doing something deliberate and other.
//   · TWO FINGERS ARE A PINCH. A zoom is never a navigation.
// ---------------------------------------------------------------------------

/**
 * THE BREAKPOINT IS THE STYLESHEET'S, NOT A SECOND OPINION. Below `48rem` the pane is a full-screen layer
 * (`globals.css`'s `@media (width < 48rem)`); at and above it the pane already sits beside the centre and
 * there is nothing to swipe into. The two are held together by `pane-swipe`'s own case, which reads the
 * media query out of `globals.css` and compares it — because a breakpoint written twice is a breakpoint
 * that will disagree once.
 */
export const PHONE_QUERY = '(width < 48rem)';

export const PANE_SWIPE = {
  /** Pixels from either side of the viewport that belong to the platform's own edge gestures. */
  edgeGuard: 24,
  /** The shortest horizontal travel that counts as a swipe. */
  minDistance: 56,
  /** How far horizontal travel must beat vertical travel: |dx| > |dy| × this. */
  dominance: 1.6,
  /** Milliseconds past which a drag is deliberate and other. */
  maxDuration: 600,
} as const;

export interface SwipePoint {
  x: number;
  y: number;
  /** A timestamp in milliseconds; only the difference is ever read. */
  t: number;
}

/** What a finger meant: open the pane, close it, or nothing at all. */
export type SwipeOutcome = 'open' | 'close' | null;

/**
 * THE DECISION, from geometry alone.
 *
 * The direction mapping is the researcher's and is stated in their terms: a swipe RIGHT carries the reader
 * to the right pane, a swipe LEFT brings them back to the thesis. It is deliberately NOT derived from the
 * writing direction — the pane is called the right pane because at `md` it is drawn against the right edge
 * (`.shell` is `ltr` so flex-row puts its last child there), and the gesture names the same side the
 * researcher does.
 *
 * `paneOpen` decides which half is live, so the two directions can never both fire: a rightward swipe with
 * the pane already open is nothing, not a second open.
 */
export function decideSwipe(start: SwipePoint, end: SwipePoint, viewportWidth: number, paneOpen: boolean): SwipeOutcome {
  const withinEdge = start.x < PANE_SWIPE.edgeGuard || start.x > viewportWidth - PANE_SWIPE.edgeGuard;
  if (withinEdge) return null;

  if (end.t - start.t > PANE_SWIPE.maxDuration) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) < PANE_SWIPE.minDistance) return null;
  if (Math.abs(dx) <= Math.abs(dy) * PANE_SWIPE.dominance) return null;

  if (dx > 0) return paneOpen ? null : 'open';
  return paneOpen ? 'close' : null;
}

/**
 * Whether anything between `target` and `root` (inclusive of `target`, exclusive of `root`'s parent) is
 * WIDER THAN ITS BOX and therefore pans horizontally on its own.
 *
 * IT DOES NOT ASK WHICH WAY THAT THING CAN STILL SCROLL, and that is a deliberate trade rather than an
 * omission. Asking would mean reading `scrollLeft` against a direction, and `scrollLeft`'s sign and origin
 * differ between engines in an RTL box — the centre and the pane are both `direction: rtl`. The
 * conservative rule costs a reader nothing they can see: a swipe begun ON a wide table simply does not open
 * the pane, and the rest of the page still does. The other way round — the pane opening mid-pan because a
 * table had reached its end — is a defect the reader feels immediately.
 */
export function pansHorizontally(target: Element | null, root: Element): boolean {
  let node: Element | null = target;
  while (node !== null && node !== root.parentElement) {
    // A one-pixel allowance: sub-pixel layout makes `scrollWidth` exceed `clientWidth` on boxes that do not
    // actually pan, and treating those as scrollers would silently disable the gesture over ordinary text.
    if (node.scrollWidth > node.clientWidth + 1) return true;
    node = node.parentElement;
  }
  return false;
}
