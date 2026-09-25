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
  /**
   * A DOCUMENT's tick wears the document glyph before its words (board י4, ui §17 :540 as ruled 2026-09-22) and reads
   * its `dir` FROM THE TITLE — "הצ׳יפ קורא dir מהשם" (the board's own note) — so a Hebrew title lays the pill out
   * right-to-left and an English one left-to-right.
   */
  document?: true;
}

/** How many of a document's title words the tick carries — board י4 draws four („מערך הנתונים המשלים למאמר"). */
const DOCUMENT_TITLE_WORDS = 4;

/**
 * THE TITLE'S FIRST WORDS — tokens that carry a letter or a digit. A punctuation-only token (— – - · ,) is not a word: it
 * is SKIPPED, never counted, so the chip never ends on a dangling mark (R82 Entry 19, at the page: „קוד נירנברג (1947) —"
 * was the fourth whitespace token's em dash; SUPPRESSED, overrulable at the page).
 */
function firstWordsOf(title: string): string {
  return title
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .slice(0, DOCUMENT_TITLE_WORDS)
    .join(' ');
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
  if (citation.kind === 'DOCUMENT') {
    // THE TITLE'S FIRST WORDS, never the commitment (§4 :167; ui §17 :540 as ruled). An untitled document — a SEALED
    // one step 32's door brings — is '—', the trajectory's precedent above for a tick with nothing to name.
    return {
      label: citation.title === null ? '—' : firstWordsOf(citation.title),
      // ONE DOT, THE SAME RULE AS A RECORD'S (board י4: "מצוטט וטרם נטען · מאומת · מסומן"): flagged first, then
      // VERIFIED(d) as the body computed it, and no colour otherwise.
      tone: citation.flag.flagged ? 'flagged' : citation.verified ? 'verified' : 'neutral',
      ltr: false,
      document: true,
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

/**
 * Which chip an EVIDENCE citation wears: a DIFF names the pair it spans, a CAPTURE one timestamp
 * (§18 :567), and a name the body resolved nothing for is a statement rather than a control.
 *
 * ONE SPELLING, TWO CALLERS — the tick line and a request's `restsOn`. It sat inline in `Appeals.tsx`
 * until the tick line needed the same answer, and a second copy of a three-branch ternary is how two
 * regions of one page come to disagree about what a record is.
 */
export function evidenceChipKind(citation: Citation | undefined): 'capture' | 'diff' | 'document' | 'unresolved' {
  if (citation === undefined) return 'unresolved';
  if (citation.kind === 'DOCUMENT') return 'document';
  return citation.kind === 'EVIDENCE' && citation.record.capture === undefined ? 'diff' : 'capture';
}

/** Board י4's document glyph — the page with its corner turned, drawn in the board's own path. */
function DocumentGlyph() {
  return (
    <svg data-tick-glyph="document" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="tick-glyph" aria-hidden="true">
      <path d="M4 2h5l3 3v9H4z" />
      <path d="M9 2v3h3" />
    </svg>
  );
}

/** The mark itself. Presentational: it computes nothing and decides nothing. */
export function Tick({ label, tone, ltr, document }: TickFace) {
  if (document === true) {
    return (
      <span data-tick data-tick-tone={tone} data-tick-kind="document" dir="auto" className="tick tick-document">
        <span className={`tick-dot tick-dot-${tone}`} aria-hidden="true" />
        <DocumentGlyph />
        <bdi dir="auto">{label}</bdi>
      </span>
    );
  }
  return (
    <span data-tick data-tick-tone={tone} className="tick">
      <span className={`tick-dot tick-dot-${tone}`} aria-hidden="true" />
      {ltr ? <bdi dir="ltr">{label}</bdi> : <bdi>{label}</bdi>}
    </span>
  );
}
