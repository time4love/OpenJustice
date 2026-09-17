import type { Citation } from '@/types/thesis';
import { domainOf, formatCaptureDate } from '@/lib/format';

// ---------------------------------------------------------------------------
// THE DATED TICK — docs/gf-ui-refactor-plan.md §10 :1121–:1122; docs/gf-ui-flows.md §18 :564 as
// amended 2026-09-16; canvas `build.mjs` :157 (`.tick`), pages 1–3.
//
// A citation in the researcher's text is a DATED TICK carrying ONE status dot — and the marks' WORDS
// live in the record, not in the body (§10 :1122; the researcher's ruling Q4, CONFIRMED 2026-09-17).
// Before this, „מאומת מול העוגן” and „נטען בדיון” rendered INLINE, four times each, in the same face,
// size and weight as the words they judge: the third of the three separations the reading test found
// missing.
//
// ONE DOT, AND ONE ONLY. The first match wins, so a reader never has to rank two marks against each
// other. The tone vocabulary is §1.8's own — olive is verified·added·present, amber is
// flagged·missing·draft — and a citation the body gave no verdict for gets no colour, not a fifth one.
//
// THE LABEL IS WHAT A PERSON RECOGNISES (§4 :167–:178): a capture by its date, a diff by its interval,
// a trajectory by its claim's first words. Never the 64-hex name, never the cuid, never the 14-digit
// stamp — `no-id-as-text` reads every `[data-tick]`'s text nodes and says so.
// ---------------------------------------------------------------------------

/** §1.8's meaning colours, and the absence of one. Never a fifth. */
export type TickTone = 'verified' | 'flagged' | 'neutral';

export interface TickFace {
  label: string;
  tone: TickTone;
  /** A date, an interval and a domain read left-to-right inside Hebrew; a claim's words do not. */
  ltr: boolean;
}

/**
 * The tick a citation wears, derived from the BODY's fields and from nothing computed here — the page
 * re-derives no verdict (§21 :626–:627).
 */
export function tickFace(citation: Citation | undefined, locale: string): TickFace {
  if (citation === undefined) return { label: '—', tone: 'neutral', ltr: false };
  if (citation.kind === 'TRAJECTORY') {
    if (!citation.resolves) return { label: '—', tone: 'neutral', ltr: false };
    return {
      label: citation.claimText.split(/\s+/).slice(0, 5).join(' '),
      tone: citation.current ? 'verified' : 'flagged',
      ltr: false,
    };
  }
  const { record } = citation;
  const label =
    record.capture === undefined
      ? `${formatCaptureDate(record.before ?? '', locale)}–${formatCaptureDate(record.after ?? '', locale)}`
      : formatCaptureDate(record.capture, locale);
  const tone: TickTone = citation.flag.flagged
    ? 'flagged'
    : 'verified' in citation.verified && citation.verified.verified
      ? 'verified'
      : 'neutral';
  return { label, tone, ltr: true };
}

/** The domain a tick line is headed by — what a reader recognises the page as. */
export function domainOfCitation(citation: Citation): string | null {
  return citation.kind === 'EVIDENCE' ? domainOf(citation.record.url) : null;
}

/** The mark itself. Presentational: it computes nothing and decides nothing. */
export function Tick({ label, tone, ltr }: TickFace) {
  return (
    <span data-tick data-tick-tone={tone} className="tick">
      <span className={`tick-dot tick-dot-${tone}`} aria-hidden="true" />
      {ltr ? <bdi dir="ltr">{label}</bdi> : <bdi>{label}</bdi>}
    </span>
  );
}
