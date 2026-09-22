'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import type { AsyncState } from '@/hooks/useAsyncData';
import type { ResearchRead, ResearchRefusal } from '@/lib/researchFetch';

// ---------------------------------------------------------------------------
// THE STATES OF A GATED READ, IN ONE PLACE — docs/gf-ui-flows.md §13 :469–:480 and A2 :1145–:1155; UI plan
// UI-8 :713–:715, :771 ("one wrapper, no page composes it").
//
// TWO COMPONENTS, BECAUSE THERE ARE TWO KINDS OF STATE, and the split is the page's own shape rather than a
// flag on one component:
//
//   THE DOOR'S — 401 and 403. They belong to the MOUNT, not to a read: `requireResearcher` answers them
//   before any route runs (§7 :284–:287), so every read of the page answers the same one at the same moment.
//   §13 :474–:475 gives each ONE act and ONE sentence, and a page with four regions drawing four copies of
//   "this account is not an approved researcher" is four answers to one question. `ResearchDoor` reads every
//   state and draws it once.
//
//   THE READ'S — loading, unreachable, and a named 404. These differ per read: one region may still be
//   loading while another has landed, and a 404 names the thing that was not found. `ResearchFetchBoundary`
//   draws them beside the region they belong to, so a slow or failed read never blanks the page.
//
// NEITHER IS COMPOSED BY A PAGE. Four regions and the sheets after them each spelling these would be one rule
// with many implementations, and the one that got the 401 wrong would be the one nobody read.
// ---------------------------------------------------------------------------

const REFUSAL_KEYS: Record<ResearchRefusal, string> = {
  NO_THESIS: 'noThesis',
  NO_FRAMING: 'noFraming',
  SESSION_NOT_FOUND: 'noDebate',
  NOT_SURVEYED: 'notSurveyed',
  NO_SUCH_RULE: 'noRule',
};

/** Whichever door refusal the reads met — they all meet the same one, so the first is the page's. */
function doorRefusalOf(states: readonly AsyncState<ResearchRead<unknown>>[]): 'SIGNED_OUT' | 'NOT_A_RESEARCHER' | null {
  for (const state of states) {
    if (state.status !== 'ok') continue;
    if (state.data.state === 'SIGNED_OUT' || state.data.state === 'NOT_A_RESEARCHER') return state.data.state;
  }
  return null;
}

function returnToOfStates(states: readonly AsyncState<ResearchRead<unknown>>[]): string | null {
  for (const state of states) {
    if (state.status === 'ok' && state.data.state === 'SIGNED_OUT') return state.data.returnTo;
  }
  return null;
}

/**
 * THE DOOR, ONCE FOR THE WHOLE PAGE.
 *
 * The 401 is an ACT, not a sentence: §13 :474 sends the reader to `/login?returnTo=` this page and brings them
 * back. `researchFetch` composed the BARE path (the `/he/he/…` trap of OAuth plan §7.0f) and this performs the
 * navigation, because a module outside React cannot. It renders nothing while it goes — a sentence that
 * appears for one frame before a redirect is a sentence nobody asked for.
 */
export function ResearchDoor({ states, children }: { states: readonly AsyncState<ResearchRead<unknown>>[]; children: ReactNode }) {
  const t = useTranslations('research.state');
  const router = useRouter();
  const returnTo = returnToOfStates(states);
  const refusal = doorRefusalOf(states);

  useEffect(() => {
    if (returnTo === null) return;
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [returnTo, router]);

  if (refusal === 'SIGNED_OUT') return null;
  if (refusal === 'NOT_A_RESEARCHER') {
    return (
      <p data-research-forbidden className="text-sm text-ink">
        {t('forbidden')}{' '}
        <Link href="/researchers" className="underline">
          {t('forbiddenLink')}
        </Link>
      </p>
    );
  }
  return <>{children}</>;
}

/**
 * WHAT A 400 RENDERS, AND WHY IT IS A PROP RATHER THAN A BRANCH IN HERE.
 *
 * A2 :1149 gives the 400 ONE rendering on both doors — "the filters shown for removal" — and the read view's
 * §27 pages are the first of its pages to send a filter at all. What the removal controls ARE is the corpus's
 * own context line, which this module must not know about: a boundary that imported the chips would be the
 * gated door's generic state machine depending on one page's furniture.
 *
 * SO THE CALLER OPTS IN, AND THE DEFAULT STAYS LOUD. A read that sends no parameter cannot legitimately meet
 * a 400 — the platform built a malformed URL — and for those this still throws by name rather than drawing a
 * region a reader cannot act on (`readUnfiltered`'s ruling, `lib/api.ts` :205–:213).
 */
export function ResearchFetchBoundary<T>({
  state,
  refused,
  children,
}: {
  state: AsyncState<ResearchRead<T>>;
  /** The filters in force, drawn for removal — supplied only by a page that sends filters (A2 :1149). */
  refused?: ReactNode;
  children: (body: T) => ReactNode;
}): ReactNode {
  const t = useTranslations();

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <p data-research-loading className="text-sm text-ink-muted">
        {t('common.loading')}
      </p>
    );
  }

  // A THROWN READ IS A DEFECT, not a state: `researchFetch` turns an unreachable backend into `UNREACHABLE`
  // below, so anything that escapes it is a parser refusing a drifted body — which must be loud (R63).
  if (state.status === 'error') throw state.error;

  const read = state.data;
  switch (read.state) {
    case 'BODY':
      return <>{children(read.body)}</>;
    case 'UNREACHABLE':
      // `research.state.unreachable` CALLS `marking.offline` — one sentence for one fact, in both catalogues,
      // rather than a second key saying the same thing.
      return (
        <p data-research-unreachable className="text-sm text-ink-muted">
          {t('marking.offline')}
        </p>
      );
    case 'REFUSED':
      return (
        <p data-research-refused className="text-sm text-ink">
          {t(`research.state.${REFUSAL_KEYS[read.code]}`)}
        </p>
      );
    case 'SIGNED_OUT':
    case 'NOT_A_RESEARCHER':
      // THE DOOR ABOVE HAS ALREADY ANSWERED, once for the page. A region that drew it again would be the
      // second and third and fourth copy of one sentence.
      return null;
    case 'FILTERS_REFUSED':
      // A READ THAT SENDS NO FILTER CANNOT LEGITIMATELY MEET A 400 — that is the platform building a malformed
      // URL, a defect and not a state, and it throws by name. A read that DOES send filters (§27's corpus
      // pages) hands in what to draw instead, which A2 :1149 says is the filters shown for removal.
      if (refused === undefined) throw new Error('research boundary: a read this page sends no filters to answered 400');
      return <>{refused}</>;
  }
}
