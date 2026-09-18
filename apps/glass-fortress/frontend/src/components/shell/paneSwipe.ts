// ---------------------------------------------------------------------------
// THE PHONE'S SWIPE INTO THE RIGHT PANE — docs/gf-ui-flows.md §18 :564, amended 2026-09-18 on the researcher's
// ruling. The refusals are part of that clause, not an implementation's caution. FIVE of them are geometry and
// live here; the SIXTH — a gesture inside the open nav drawer — needs the shell's state and lives in Shell.tsx.
//
// THE PROBLEM IT SOLVES, in the researcher's words: on a phone the thesis page gives no easy way to reach
// what the desktop shows in the right pane. Today the ONLY door is a dated tick — `useOpenRecord`
// (`components/thesis/PaneTabs.tsx`), reached by pressing a document's date bubble — and a reader who does
// not press one never learns the pane is there. A swipe LEFT opens it; a swipe RIGHT returns to the read,
// and the centre slides with the finger so the reader can see which way the pages lie.
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
 * A SWIPE LEFT OPENS THE RIGHT PANE; A SWIPE RIGHT RETURNS TO THE READ. **This is the CORRECTION of
 * 2026-09-18, and the reason is worth keeping**: the first implementation took the researcher's words
 * literally — "swipe right to go to the right side" — and it read backwards on the phone. Content follows
 * the finger. A finger moving LEFT drags the page left and uncovers what lies to its RIGHT; a finger moving
 * RIGHT pushes the page back and the right pane leaves with it. Naming the destination and naming the
 * gesture are opposite acts, and the gesture is what the hand is doing.
 *
 * IT IS STILL NOT DERIVED FROM THE WRITING DIRECTION. The mapping is PHYSICAL — where the pane is drawn,
 * not which way Hebrew runs — so it is the same in both locales. `.shell-centre` is `direction: rtl` and
 * that changes nothing here.
 *
 * `paneOpen` decides which half is live, so the two directions can never both fire: a leftward swipe with
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

  // LEFT (dx < 0) opens, RIGHT (dx > 0) closes — the correction above.
  if (dx < 0) return paneOpen ? null : 'open';
  return paneOpen ? 'close' : null;
}

/**
 * Whether anything between `target` and `root` (inclusive of `target`, exclusive of `root`'s parent) actually
 * PANS HORIZONTALLY on its own — wider than its box AND able to scroll in that axis.
 *
 * **BOTH HALVES ARE REQUIRED, AND THE SECOND WAS LEARNED IN A BROWSER (2026-09-18).** The first version asked
 * only whether a box was wider than its client area, and that is not what "pans" means: a box can be wider and
 * CLIP. `.shell` is exactly that — `overflow: hidden` by design — and the moment the centre slide landed, the
 * translated centre extended the shell's scroll area to 443px against a 375px client. The walk reaches the
 * root, called it a panner, and refused every gesture inside the open pane, so the swipe back stopped working.
 * **The motion that exists to explain the gesture had disabled the gesture**, and twenty-three green cases
 * said nothing, because jsdom computes no layout and no cascade.
 *
 * With the overflow read, the real scrollers still block — `.shell-tabs` is `auto` at 749px against 375 — and
 * a box that merely clips does not.
 *
 * IT STILL DOES NOT ASK WHICH WAY THAT THING CAN STILL SCROLL, and that remains a deliberate trade. Asking
 * would mean reading `scrollLeft` against a direction, and `scrollLeft`'s sign and origin differ between
 * engines in an RTL box — the centre and the pane are both `direction: rtl`. A swipe begun ON a wide table
 * simply does not move the pane; the pane opening mid-pan is the defect a reader would feel.
 */
export function pansHorizontally(target: Element | null, root: Element): boolean {
  let node: Element | null = target;
  while (node !== null && node !== root.parentElement) {
    if (node.scrollWidth > node.clientWidth + 1 && scrollsHorizontally(node)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Whether this box's own overflow lets a finger pan it. `visible`, `hidden` and `clip` cannot be panned at all;
 * `auto` and `scroll` can. Read from the computed style, so a rule in the stylesheet counts and not only an
 * inline one — which is why this cannot be held in jsdom by dimensions alone.
 */
function scrollsHorizontally(node: Element): boolean {
  const overflowX = node.ownerDocument.defaultView?.getComputedStyle(node).overflowX;
  return overflowX === 'auto' || overflowX === 'scroll';
}
