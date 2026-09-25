'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import { PlatformMark, type MarkKind } from '@/components/thesis/PlatformMark';
import { formatCaptureDate, formatDate } from '@/lib/format';
import type { ContentUnit, EvidenceReview, FlagReason, NamedRecord, NotEvaluable, ThesisOwedEntry, ThesisReview, TrajectoryCurrency } from '@/types/research';

// ---------------------------------------------------------------------------
// WHAT I OWE — docs/gf-ui-flows.md §29 :890–:894 and §11 :402–:408; thesis T6 :881–:882 ("stop-shaped …
// material, old beside new, and one command to paste"); UI plan :717–:719.
//
// ONE STRIP, TWO SUBJECTS. This is region 1 of `/research` and region 2 of the working view — so it takes its
// entries as a value and knows nothing about which page drew it.
//
// THE TWO SUBJECTS ARE THE SAME ENTRY UNDER DIFFERENT COVER, SINCE 2026-09-22 (the researcher, R71). `/research`
// reads `list_thesis_reviews`, whose element is A4 :1523's `E` PLUS what that list pays reads to render — the
// instant, the MATERIAL and the author. The working view reads its own thesis's `reviews`, A4 :1476's
// `E & { record, owedSince }`, every field of it free off the rows that read already loads.
//
// SO THE RECORD HAS TWO HOMES AND ONE MEANING: `material.record` on the list's row, `record` on the working
// view's. This file reads whichever the entry has and draws ONE `RecordName` either way — a second component,
// or a page that drew the record only when a material rode with it, would be the same rule twice.
//
// AND `owedSince` IS NULLABLE ON ONE ARM ONLY. FLAGGED's date is the CITATION SHEET's (ui §11 :404), because it
// is computed FROM the material (`thesisReviews.ts` :228) and `publishedAt` alone would OVERSTATE how long the
// flag has been open. Nothing is defaulted: a null instant draws NO line rather than a date nobody computed.
//
// ONE COMMAND, OR SEVERAL, AND THE BODY DECIDES. §29 :892–:894 gives a thesis review "ONE COMMAND with a copy
// button" and the corpus-wide entries "the commands", plural — and the two envelopes say exactly that
// (`command: string` at thesis A4 :1523, `commands: string[]` at evidence A4 :1146). So the row takes an ARRAY
// and a thesis review passes a one-member one: one renderer, one COPY control per command, and no branch that
// could disagree with itself.
//
// THE THESIS IS NAMED BY ITS CLAIM — RULED 2026-09-20 (R67 Q-G), §29 :890 ("the thesis (claim)"). The claim
// comes from the THESES read this page already made, joined on `thesisId`: a join over a field another body on
// the same page carries is not a second read (§12 :464), and an entry whose thesis is outside that body — a
// colleague's, while the switch is on `mine` — draws no claim rather than an id.
//
// EVERY WORD HERE IS APPROVED OR CALLED. The record's name is `record.capture` / `record.diff`, the flag's
// reasons are `theses.sheet.flag.*`, the trajectory's standing is a `theses.marks.*` mark through
// `PlatformMark`: one concept, one string, wherever it is drawn.
//
// NOTHING HERE WRITES. The COPY control puts a command on the clipboard and the researcher pastes it into the
// chat, where the act is made and attributed (§12 :459–:461). That is the one actionable element this page has.
// ---------------------------------------------------------------------------

type OwedKind = 'FLAGGED' | 'STALE_TRAJECTORY' | 'UNARGUED' | 'CONTENT_MOVED';

// THE DATE IS ISOLATED BY THE LINE'S OWN `dir="auto"` — RULED 2026-09-20 (the researcher, R67 round 3):
// "`dir="auto"` on the line is the right isolation for a Hebrew sentence carrying a date", and no amendment
// to the frozen row is owed.
//
// WHY IT IS NOT A COMPROMISE, recorded because the earlier draft of this note called it one. The rule §17
// :533–:534 states is that a date inside Hebrew must not reverse the line; `<bdi dir="ltr">` around the
// SENTENCE would lay the HEBREW out left-to-right, which is the defect rather than the fix, and next-intl
// can only put an element around a VALUE through a TAG the frozen string does not have (`t.rich`'s values
// are typed `string | number | Date | RichTagsFunction`). `dir="auto"` resolves the line RTL from its first
// strong character and the digits read correctly inside it. `bidi-isolated` holds it, and E3 — the same line
// with the attribute removed — reddens that scan by name.

/**
 * The record as evidence A1 names it — by its page's dates, through the keys the record pages already use — or a
 * DOCUMENT by its TITLE, the researcher's own words (R81 QB), never its commitment (§4 :167). An untitled one (a SEALED
 * document, step 32) reads '—', the tick's precedent for a record with nothing to name.
 */
function RecordName({ record, locale }: { record: NamedRecord; locale: string }) {
  const t = useTranslations('record');
  if ('commitment' in record) {
    return (
      <p data-record-name data-record-kind="document" dir="auto" className="text-xs text-ink-muted">
        {record.title ?? '—'}
      </p>
    );
  }
  return (
    <p data-record-name dir="auto" className="text-xs text-ink-muted">
      {'capture' in record
        ? t('capture', { date: formatCaptureDate(record.capture, locale) })
        : t('diff', { before: formatCaptureDate(record.before, locale), after: formatCaptureDate(record.after, locale) })}
    </p>
  );
}

/**
 * THE FLAG'S REASONS, THROUGH THE WORDS THAT ALREADY EXIST — `theses.sheet.flag.*` (UI-5), so one reason has
 * one sentence wherever it is shown.
 *
 * ALL THREE OF THE WIRE'S REASONS HAVE ONE, since 2026-09-20 (the researcher, Q-I): the table held WITHDRAWN
 * and NOT_CITATION_CURRENT, and `AWAITING_DERIVATION` — a `FlagReason` the wire has always carried — had no
 * approved word in THIS meaning, so the page drew nothing for it. It was NOT given
 * `research.owed.notEvaluableReason.AWAITING_DERIVATION`, which was frozen for the `notEvaluable` list: one
 * approved sentence behind two meanings is the defect the freeze rule prevents. It has its own row now.
 *
 * `SHED` is in the catalogue's table and is NOT here, because this read cannot answer it — the map is over
 * what the WIRE carries, not over what the catalogue happens to hold.
 */
export const FLAG_REASON_KEYS: Record<FlagReason, string> = {
  WITHDRAWN: 'WITHDRAWN',
  NOT_CITATION_CURRENT: 'NOT_CITATION_CURRENT',
  AWAITING_DERIVATION: 'AWAITING_DERIVATION',
};

/**
 * The cited pass's standing, as the mark the thesis page already draws for it (`RecordPane.tsx` :96–:105).
 *
 * TWO CLASSES, NOT FOUR — and the APPENDIX decides which word goes where, not the state's name. Thesis A3
 * :1386–:1388: "the cited computation's currency is PINNED_IS_LATEST or RECOMPUTED_AGREES … 
 * RECOMPUTED_DISAGREES and NOT_FOLLOWED_BY_LATEST are STALE_TRAJECTORY". An earlier draft of this function
 * read NOT_FOLLOWED_BY_LATEST as `trajectoryUnresolved` on the strength of the word "unresolved" — which is
 * what `RecordPane` means by an id naming no computation at all, a different fact. A mark chosen from a
 * state's NAME rather than from the clause that classes it is a judgement the appendix already made.
 */
function currencyMark(state: TrajectoryCurrency['state']): MarkKind {
  if (state === 'RECOMPUTED_DISAGREES' || state === 'NOT_FOLLOWED_BY_LATEST') return 'trajectoryStale';
  return 'trajectoryCurrent';
}

function OwedEntry({
  kind,
  claim,
  owedSince,
  commands,
  author,
  locale,
  children,
}: {
  kind: OwedKind;
  /** The thesis's claim, joined from the theses read — null when that body does not carry it (Q-G). */
  claim: string | null;
  /** The instant the thing became owed, where the entry carries one — `null` draws no line (A4 :1476 carries none). */
  owedSince: string | null;
  commands: readonly string[];
  /** The author's handle when the entry is on a COLLEAGUE'S thesis — the command is theirs to run (§11 :407). */
  author: string | null;
  locale: string;
  children?: ReactNode;
}) {
  const t = useTranslations('research.owed');
  return (
    <li data-owed-entry={kind} className="rounded border border-line bg-surface p-3 text-sm">
      <p className="text-ink">{t(`kind.${kind}`)}</p>
      {claim === null ? null : (
        <p data-owed-claim dir="auto" className="text-sm text-ink">
          {claim}
        </p>
      )}
      {owedSince === null ? null : (
        <p data-owed-since dir="auto" className="text-xs text-ink-muted">
          {t('since', { date: formatDate(owedSince, locale) })}
        </p>
      )}
      {author === null ? null : (
        <p data-owed-by-author className="text-xs text-ink-muted">
          {t('byAuthor', { handle: author })}
        </p>
      )}
      {children}
      <div className="mt-2 flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{t('command')}</span>
        {commands.map((command) => (
          <CopyableCode key={command} value={command} label={t('command')} showValue />
        ))}
      </div>
    </li>
  );
}

/**
 * WHAT A THESIS ENTRY SHOWS BENEATH ITS HEADING — the kind's own facts, and its MATERIAL where the entry carries
 * one (T6 :881–:882, "material, old beside new, and one command to paste").
 *
 * THE KIND IS NARROWED FIRST AND THE MATERIAL SECOND, in that order and in one place: `reasons` and `state` are on
 * EVERY entry of their kind (A4 :1476 and :1523 alike), while the record, the chunks and the cited claim come from
 * `list_thesis_reviews`' extra reads. Narrowing the other way round would need the same reasons rendered twice.
 */
function ThesisEntryDetail({ review, locale }: { review: ThesisReview | ThesisOwedEntry; locale: string }) {
  const t = useTranslations('research.owed');
  const flag = useTranslations('theses.sheet.flag');

  if (review.kind === 'FLAGGED') {
    return (
      <>
        <RecordName record={'material' in review ? review.material.record : review.record} locale={locale} />
        <ul className="flex flex-col gap-1">
          {review.reasons.map((reason) =>
            FLAG_REASON_KEYS[reason] === undefined ? null : (
              <li key={reason} data-flag-reason={reason} className="text-xs text-ink-muted">
                {flag(FLAG_REASON_KEYS[reason])}
              </li>
            ),
          )}
        </ul>
        {'material' in review ? (
          <>
            <Chunks label={t('affirmed')} units={review.material.pin.chunks} />
            {review.material.current === null ? null : <Chunks label={t('current')} units={review.material.current.chunks} />}
          </>
        ) : null}
      </>
    );
  }

  if (review.kind === 'STALE_TRAJECTORY') {
    return (
      <>
        {/* THE CITED CLAIM'S OWN WORDS — the corpus's text, not a label, so it carries `dir="auto"` and no key.
            What the newest pass says about it is a MARK, the one the thesis page draws. */}
        {'material' in review ? (
          <p data-cited-claim dir="auto" className="text-xs text-ink">
            {review.material.cited.claimText}
          </p>
        ) : null}
        <span data-currency={review.state}>
          <PlatformMark kind={currencyMark(review.state)} />
        </span>
      </>
    );
  }

  return <RecordName record={'material' in review ? review.material.record : review.record} locale={locale} />;
}

/** The chunks affirmed beside the chunks now — the "old beside new" T6 :881 asks for, and nothing derived. */
function Chunks({ label, units }: { label: string; units: readonly ContentUnit[] }) {
  return (
    <div className="mt-2">
      <p className="text-xs text-ink-muted">{label}</p>
      <ul className="flex flex-col gap-1">
        {units.map((unit, index) => (
          <li key={`${unit.text}-${String(index)}`} data-owed-chunk={unit.side ?? 'ABSENT'} dir="auto" className="text-xs text-ink">
            {unit.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * IT TAKES THE ROWS IT DRAWS, NEVER A COUNT — and the count is gone from the prop because reading one was the
 * defect (measured on `/research` at `mine`, 2026-09-21: `owed: 4` beside 0 kept rows drew an empty `<ul>`
 * where „אין כרגע מה שחייבים." belongs).
 *
 * THE WIRE'S `owed` IS NOT THIS VIEW'S COUNT, by the design's own words: ui §7.1 :326 has `owed` counting
 * EVERY researcher's entries at `all`, and :328 has the page open on `mine` by KEEPING the entries whose
 * `mine` is true. The working view keeps by `thesisId` in the same way. So at every scope but `all` the
 * envelope's number answers a different question from the list beside it, and a component that mixed the two
 * could disagree with itself.
 *
 * EMPTINESS IS THEREFORE WHAT IT RENDERS: all three lists empty. It is decided HERE, once, rather than by each
 * caller deriving a count — which is the same rule with two implementations, and was already in the tree twice
 * (the dashboard's spread versus the working view's `mine.length`).
 *
 * `notEvaluable` IS ONE OF THE THREE, and that is a second silent drop closed by the same predicate: a body
 * with no reviews and a `notEvaluable` row used to draw „nothing is owed" and DROP the row, because the old
 * test never looked at the list it renders below.
 */
export function OwedStrip({
  theses,
  evidence,
  notEvaluable,
  claimOf,
  locale,
}: {
  /**
   * The thesis entries this view draws — `/research`'s, which carry their author and material, or the working
   * view's, which carry the record and a date on the arms that have one.
   */
  theses: readonly (ThesisReview | ThesisOwedEntry)[];
  /** The corpus-wide entries, `/research`'s region 1 alone; the working view passes none. */
  evidence: readonly EvidenceReview[];
  notEvaluable: readonly NotEvaluable[];
  /** The claim of a thesis the page has already read, or null — the Q-G join, never a read of its own. */
  claimOf: (thesisId: string) => string | null;
  locale: string;
}) {
  // `theses.sheet.flag` LEFT WITH THE ROWS THAT READ IT: the flag's sentences are `ThesisEntryDetail`'s now, and
  // a translator held here for a string nothing here draws is a namespace this component does not use.
  const t = useTranslations('research.owed');

  return (
    // THE REGION AND ITS HEADING ARE THE PAGE'S, not this component's — so a heading is on the page while its
    // body is still loading, for all four regions alike. Two regions drawing their heading through a boundary
    // and two outside it made the loading page say two of the four names (measured on :3011, chunk 4).
    <>
      {theses.length === 0 && evidence.length === 0 && notEvaluable.length === 0 ? (
        // AN EMPTY LIST IS AN ANSWER (A4 :1525), and the line saying so is the region — never a blank.
        <p data-owed-empty className="text-sm text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {theses.map((review) => (
            <OwedEntry
              key={`${review.kind}:${review.thesisId}:${review.name}`}
              kind={review.kind}
              claim={claimOf(review.thesisId)}
              owedSince={review.owedSince}
              commands={[review.command]}
              author={'author' in review && !review.mine ? review.author : null}
              locale={locale}
            >
              <ThesisEntryDetail review={review} locale={locale} />
            </OwedEntry>
          ))}
          {evidence.map((review) => (
            <OwedEntry
              key={review.fileHash}
              kind={review.kind}
              claim={null}
              owedSince={review.owedSince}
              commands={review.commands}
              author={null}
              locale={locale}
            >
              <RecordName record={review.record} locale={locale} />
              <Chunks label={t('affirmed')} units={review.affirmed.chunks} />
              <Chunks label={t('current')} units={review.current.chunks} />
              <Chunks label={t('entered')} units={review.moved.entered} />
              <Chunks label={t('left')} units={review.moved.left} />
              {/* THE CITING THESES ARE NOT DRAWN YET. `research.owed.citedBy` is frozen and waits for chunk 6:
                  what makes the list useful is each thesis being REACHABLE, and `/research/theses/[id]` does
                  not exist until then — a label over a list of names nobody can open is a heading with no
                  answer under it. It lands with the anchors. */}
            </OwedEntry>
          ))}
          {notEvaluable.map((row) => (
            <li key={row.fileHash} data-owed-not-evaluable={row.reason} className="rounded border border-line bg-surface p-3 text-sm">
              <p className="text-ink">{t('notEvaluable')}</p>
              <p className="text-xs text-ink-muted">{t(`notEvaluableReason.${row.reason}`)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
