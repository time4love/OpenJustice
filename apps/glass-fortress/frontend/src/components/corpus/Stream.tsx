'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import { LabelledOpinion } from '@/components/opinion/LabelledOpinion';
import { displayUrl, formatCaptureDate } from '@/lib/format';
import { partitionBySignificance } from '@/lib/corpusSignificance';
import type { CaptureEntry, CorpusEntry, DiffEntry } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CHRONOLOGY — docs/gf-ui-flows.md §24 region 4 and :660–:666 (the two weights of row); evidence A4
// :1080–:1093 (the bodies). ONE component, rendered here at `scope: 'public'`; UI-8 renders THE SAME ONE at
// `all` with its three additions and completes `one-stream-two-doors`. Writing it twice is the defect this
// repository names as its own.
//
// TWO WEIGHTS, BECAUSE TWO KINDS OF THING. A CAPTURE is an ENDPOINT — a thin row: the page's label, the date
// and time, the anchor mark, and a COPY giving the citation token. A DIFF is the EVENT — a card: the page's
// label, the interval, the size of the change by side, the CITED and NARROWED marks, AWAITING DERIVATION as
// a state, and the classifier's opinion inside `LabelledOpinion`. The weights are not decoration: a reader
// scanning a page's history looks for the events, and the ticks between them are what give the events dates.
//
// THE THREE COMPONENTS SHARE A FILE deliberately. The two row weights are the two halves of THIS list,
// neither is rendered anywhere else, and a reader judging whether a row is drawn right needs both in front of
// them. When UI-8 or a record page renders one alone, it moves out with its own name.
//
// NO ROW IS A LINK YET, AND THAT IS THE CONTRACT RATHER THAN AN OMISSION. §24's region 4 opens a record as a
// RIGHT-PANE TAB, and the record pages it reaches are chunk 5b. A row that navigated somewhere unbuilt is the
// defect this round has already paid for four times.
//
// IT IS A CLIENT COMPONENT FOR ONE REASON: the reveals. The significance gate's count line and the opinion's
// „קרא עוד" are both a reader's choice made after the page arrives, and neither is a navigation — a server
// component cannot hold that state and a URL parameter would make a reading preference linkable, which it is
// not. Everything else here is computed from the body.
// ---------------------------------------------------------------------------

/** The page a row belongs to, shown as §4 :167–:178 requires: the domain and path, never the `trackedUrlId`. */
function PageLabel({ url }: { url: string }) {
  return (
    <bdi dir="ltr" data-page-label className="break-all text-xs text-ink-muted">
      {displayUrl(url)}
    </bdi>
  );
}

/**
 * A CAPTURE — the thin row. Its date is FORMATTED, never printed: the body carries a 14-digit wayback
 * timestamp and §4 :168 bars exactly that from being read aloud. `formatCaptureDate` is CALLED, the same
 * function every capture date on the thesis page goes through.
 *
 * THE ANCHOR MARK IS THE BODY'S FACT, never a verdict this page computed (§21 :629): ATTRIBUTED, or not yet.
 * THE COPY CARRIES THE CITATION TOKEN and is labelled by what it is FOR (§4 :172), which is why the hash it
 * copies is never drawn as text beside it.
 */
function CaptureRow({ entry }: { entry: CaptureEntry }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  return (
    <li data-entry="CAPTURE" data-capture-row className="flex flex-col gap-1 border-b border-line py-2">
      <PageLabel url={entry.page.url} />
      <span className="flex flex-wrap items-baseline gap-2 text-sm text-ink">
        <bdi dir="ltr">{formatCaptureDate(entry.capture, locale)}</bdi>
        <span data-anchor-mark className="text-xs text-ink-muted">
          {t(entry.anchor.attributed ? 'anchor.attributed' : 'anchor.notYet')}
        </span>
        <CopyableCode value={`#ev_${entry.fileHash}`} label={t('copyToken')} />
      </span>
    </li>
  );
}

/**
 * A DIFF — the card. The interval is two FORMATTED dates, never the pair of timestamps that names it; the
 * size of the change is counted from `current.chunks` BY SIDE, which is the body's own measure and not a
 * judgement this page makes. `current` is null while a diff awaits derivation, which §24's region 4 calls a
 * STATE and not an error — the card says so instead of showing a size of nothing.
 *
 * THE OPINION IS INSIDE `LabelledOpinion` OR IT IS NOT RENDERED (§10 :384, "Never outside one").
 */
function DiffCard({ entry }: { entry: DiffEntry }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const removed = entry.current?.chunks.filter((one) => one.side === 'REMOVED').length ?? 0;
  const added = entry.current?.chunks.filter((one) => one.side === 'ADDED').length ?? 0;
  return (
    <li data-entry="DIFF" data-diff-card className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
      <PageLabel url={entry.page.url} />
      {/* THE INTERVAL USES THE CATALOGUE'S OWN `interval` STRING, which the pages list already draws — one
          approved spelling of "from one date to another", not a second. An arrow between the two dates was
          written first and `no-emoji` caught it: that instrument bars an arrow under `src/` precisely so a
          glyph never stands in for a word the catalogue should own. */}
      <span data-interval className="text-sm text-ink">
        <bdi dir="ltr">{t('interval', { first: formatCaptureDate(entry.before, locale), last: formatCaptureDate(entry.after, locale) })}</bdi>
      </span>
      {entry.current === null ? (
        <span data-awaiting className="text-xs text-ink-muted">{t('awaitingDerivation')}</span>
      ) : (
        <span data-change-size className="text-xs text-ink-muted">{t('changeSize', { removed, added })}</span>
      )}
      <span className="flex flex-wrap gap-2 text-xs text-ink-muted">
        {entry.evidence === null ? null : <span data-cited-mark>{t('cited')}</span>}
        {entry.narrowed ? <span data-narrowed-mark>{t('narrowed')}</span> : null}
      </span>
      {entry.opinion === null ? null : <LabelledOpinion opinion={entry.opinion} />}
    </li>
  );
}

/**
 * THE STREAM. Oldest first WITHIN THE RANGE is the read's own order (A4 :1091: "in TIMESTAMP order across
 * pages; no other order exists"), so this component re-sorts nothing — a second ordering here would be a
 * second answer to a question the body has already answered.
 *
 * THE GATE'S TWO HALVES ARE ONE ELEMENT. `partitionBySignificance` decides what is hidden and this draws the
 * line that says how many, with the tap that reveals them. They are computed in one pass from one list, so
 * the count can never disagree with what it describes; and they land together, because hiding without
 * announcing is the half §24 forbids.
 */
export function Stream({ entries }: { entries: readonly CorpusEntry[] }) {
  const t = useTranslations('corpus');
  const [revealed, setRevealed] = useState(false);
  const { shown, hidden } = partitionBySignificance(entries);
  if (entries.length === 0) return <p data-stream-empty className="text-sm text-ink-muted">{t('emptyFiltered')}</p>;
  const drawn = revealed ? [...shown, ...hidden] : shown;
  return (
    <>
      <ul data-stream className="flex flex-col gap-2">
        {drawn.map((entry) =>
          entry.kind === 'CAPTURE' ? (
            <CaptureRow key={`c-${entry.capture}-${entry.page.trackedUrlId}`} entry={entry} />
          ) : (
            <DiffCard key={`d-${entry.before}-${entry.after}-${entry.page.trackedUrlId}`} entry={entry} />
          ),
        )}
      </ul>
      {hidden.length === 0 || revealed ? null : (
        <button
          type="button"
          data-hidden-count
          onClick={() => {
            setRevealed(true);
          }}
          className="self-start text-xs text-ink-muted underline"
        >
          {t('hiddenCount', { count: hidden.length })}
        </button>
      )}
    </>
  );
}
