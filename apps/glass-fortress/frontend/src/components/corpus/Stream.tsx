'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import { LabelledOpinion } from '@/components/opinion/LabelledOpinion';
import { PlatformMark } from '@/components/thesis/PlatformMark';
import { DeclareTabs, type PaneTab } from '@/components/shell/RightPane';
import { formatCaptureDate } from '@/lib/format';
import { partitionBySignificance } from '@/lib/corpusSignificance';
import { PageUrl } from './PageUrl';
import { recordIdOf, useOpenRecord, useRecordTab } from './RecordSheet';
import type { CaptureEntry, CorpusEntry, DiffEntry } from '@/types/corpus';

/**
 * §27's EXTRACTION SHEET, AS A SLOT THIS COMPONENT DOES NOT FILL — and the direction of that dependency is
 * the point.
 *
 * The three reads behind the sheet are `/api/research/*`: they answer a bearer and nothing else. If this
 * file imported them, `/corpus` — a public, anonymous page — would carry the gated reader in its bundle and
 * in every scan's import closure, and `one-stream-two-doors` would be holding that two doors share a
 * component which knows about one of them. So the GATED PAGE supplies the sheet and this component places
 * it: `tabs` join the page's ONE declaration, `control` is the research tree's own words on a capture row.
 * At `public` the slot is absent and there is nothing to place.
 */
export interface ExtractionSlot {
  /** The sheets this page has open, contributed to the one declaration below. */
  tabs: readonly PaneTab[];
  /** The control a capture row draws to open the sheet, rendered by whoever owns the copy for it. */
  control: (entry: CaptureEntry) => ReactNode;
}

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
// A ROW NAMES ITS PAGE ONLY WHEN THE VIEW SPANS PAGES (§24 :763 as amended 2026-09-21). On a single-page view
// the card above already names the page, so every row repeating the same url is a redundancy — measured on
// the real corona body, FORTY-THREE repetitions of one string. `spansPages` is the VIEW's fact and is passed
// in rather than derived from the entries: a cross-page stream whose window happens to return rows of one
// page still spans pages, and it carries NO card, so a row that dropped the label on that evidence would
// leave the reader with no page named anywhere. The page in force is what the door knows and the rows do not.
//
// THE THREE COMPONENTS SHARE A FILE deliberately. The two row weights are the two halves of THIS list,
// neither is rendered anywhere else, and a reader judging whether a row is drawn right needs both in front of
// them. When UI-8 or a record page renders one alone, it moves out with its own name.
//
// A ROW TAP OPENS THE RECORD AS A RIGHT-PANE TAB (§24 region 4, §26), and this is new surface as of chunk
// 5b(b) — until now no row was a link at all, which was correct while no destination existed. It is a BUTTON
// and not an anchor, deliberately: the record is a pane tab and not a route, so a link would promise a URL
// this act does not produce. The record PAGES are 5b(c) and the sheet's one link onward lands with them.
//
// IT IS A CLIENT COMPONENT FOR ONE REASON: the reveals. The significance gate's count line and the opinion's
// „קרא עוד" are both a reader's choice made after the page arrives, and neither is a navigation — a server
// component cannot hold that state and a URL parameter would make a reading preference linkable, which it is
// not. Everything else here is computed from the body.
// ---------------------------------------------------------------------------

/**
 * A CAPTURE — the thin row. Its date is FORMATTED, never printed: the body carries a 14-digit wayback
 * timestamp and §4 :168 bars exactly that from being read aloud. `formatCaptureDate` is CALLED, the same
 * function every capture date on the thesis page goes through.
 *
 * THE ANCHOR MARK IS THE BODY'S FACT, never a verdict this page computed (§21 :629): ATTRIBUTED, or not yet.
 * THE COPY CARRIES THE CITATION TOKEN and is labelled by what it is FOR (§4 :172), which is why the hash it
 * copies is never drawn as text beside it.
 */
function CaptureRow({ entry, onOpen, extraction, spansPages }: { entry: CaptureEntry; onOpen: (entry: CaptureEntry) => void; extraction?: ExtractionSlot; spansPages: boolean }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  return (
    <li data-entry="CAPTURE" data-capture-row className="flex flex-col gap-1 border-b border-line py-2">
      {/* THE WHOLE ROW IS THE TARGET, and the COPY control inside it is not: a tap on the copy must copy and
          not open a record. It is a sibling button rather than a nested one, because a control inside a
          control is the nesting `valid-nesting` refuses and a browser resolves by guessing. */}
      <button type="button" data-open-record={recordIdOf(entry)} onClick={() => { onOpen(entry); }} className="text-start">
      {spansPages ? <PageUrl url={entry.page.url} weight="aside" /> : null}
      <span className="flex flex-wrap items-baseline gap-2 text-sm text-ink">
        <bdi dir="ltr">{formatCaptureDate(entry.capture, locale)}</bdi>
        <span data-anchor-mark className="text-xs text-ink-muted">
          {t(entry.anchor.attributed ? 'anchor.attributed' : 'anchor.notYet')}
        </span>
        {/* THE CITED MARK, which this row did not draw. §24 names it among the marks a row carries, and the
            2026-09-19 ruling on region 3 makes the omission visible rather than merely incomplete: a capture
            dot is ringed on the STRIP when the capture's OWN `evidence` is set, and three of this page's 22
            captures carry one. Without this the strip would ring three dots whose rows say nothing about why,
            and a reader would have a mark with no explanation six centimetres below it. The catalogue's
            existing `cited` is reused — the diff card already draws the same word, and no new string is
            approved. The condition is the capture's own `evidence`, never a diff touching it: measured, the
            other reading rings nothing at all, since 0 of 21 diffs carry one. */}
        {entry.evidence === null ? null : <span data-cited-mark className="text-xs text-ink-muted">{t('cited')}</span>}
        </span>
      </button>
      {/* THE NOT PUBLIC MARK (§27 :866) — the row of a page no published thesis has opened, so a researcher
          knows what a reader cannot see. It is the BODY's own `page.public` (§28 :882, the field UI-2 added to
          the facet "so the gated door can mark a row of a page not yet opened without a second read"), never
          a verdict this page computed, and it is `PlatformMark`'s own member rather than a second mark
          component (§21 :626). At `public` the read returns only opened pages, so it draws on neither door
          by accident. It sits OUTSIDE the row's button: a mark inside the tap is the nesting `valid-nesting`
          refuses, and it is not part of what the tap does. */}
      <span className="flex flex-wrap items-baseline gap-2">
        {entry.page.public ? null : <PlatformMark kind="notPublic" />}
        <CopyableCode value={`#ev_${entry.fileHash}`} label={t('copyToken')} />
        {/* §27's THIRD ADDITION, on a CAPTURE row and nowhere else — "THE EXTRACTION SHEET, from any capture
            row". A SIBLING of the tap, like the COPY beside it, for the same reason. */}
        {extraction?.control(entry)}
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
function DiffCard({ entry, onOpen, spansPages }: { entry: DiffEntry; onOpen: (entry: DiffEntry) => void; spansPages: boolean }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const removed = entry.current?.chunks.filter((one) => one.side === 'REMOVED').length ?? 0;
  const added = entry.current?.chunks.filter((one) => one.side === 'ADDED').length ?? 0;
  return (
    <li data-entry="DIFF" data-diff-card className="flex flex-col gap-2 rounded border border-line bg-surface p-3">
      <button type="button" data-open-record={recordIdOf(entry)} onClick={() => { onOpen(entry); }} className="flex flex-col gap-2 text-start">
      {spansPages ? <PageUrl url={entry.page.url} weight="aside" /> : null}
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
      </button>
      {/* A DIFF BELONGS TO A PAGE EXACTLY AS A CAPTURE DOES, and §27 :866 says "rows", not "capture rows":
          both weights are rows of the one stream and a diff of an unopened page is as invisible to a reader
          as a capture of it. Marking only the thin rows would leave half the stream unexplained. */}
      {entry.page.public ? null : <PlatformMark kind="notPublic" />}
      {/* THE OPINION IS OUTSIDE THE TAP, because „קרא עוד" is a control of its own and a control inside a
          control is the nesting `valid-nesting` refuses. */}
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
 * line that says how many, with the tap that reveals them. They land together, because hiding without
 * announcing is the half §24 forbids.
 *
 * THE NUMBER IS THE WINDOW'S, ON BOTH VIEWS — REVERTED 2026-09-21, the same day the page's figure landed, and
 * the two grounds are worth keeping because the second is not about scope at all.
 *
 *   (1) THE LINE IS A CONTROL FOR AUDITABILITY (§24 :684: "a hidden row that announces itself can be audited;
 *       one that does not, cannot"). A line naming thirteen whose tap reveals five breaks the promise it
 *       exists to make. PAGE-LEVEL suppression is already visible where §24 puts it — the dimmed bars of
 *       ruling (g) on region 3's strip. Two elements, two scopes, each honest about its own.
 *   (2) THE PAGE FIGURE IS WRONG BY CONSTRUCTION. `bin.passed` is ANY (`corpusReads.ts` :1123) and the sum ran
 *       over bins where `!passed`, so A BIN HOLDING ONE FLAGGED AND ONE HIDDEN DIFF CONTRIBUTES ZERO. The real
 *       corpus has 24 diffs in 24 DISTINCT bins, so nothing collides today and the figure was right BY LUCK.
 *       An honest page count needs a per-bin `hidden` the facet does not carry — so the seam was not a copy
 *       problem that could be closed by saying both figures; the page's own figure was never trustworthy.
 *
 * `hidden.length` IS THE WINDOW'S BY DEFINITION — it is exactly what the tap reveals — so the line and the
 * control state one number and the component needs no second source to reconcile.
 */
export function Stream({ entries, spansPages, extraction }: { entries: readonly CorpusEntry[]; spansPages: boolean; extraction?: ExtractionSlot }) {
  const t = useTranslations('corpus');
  const [revealed, setRevealed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRecord = useOpenRecord();
  // THE HOOK IS CALLED BEFORE THE EMPTY RETURN BELOW — an early return above a hook is the rule React has
  // no way to recover from, and the empty stream is a real state of this page.
  const recordTab = useRecordTab(entries, openId);
  const open = (entry: CorpusEntry): void => {
    setOpenId(recordIdOf(entry));
    openRecord(recordIdOf(entry));
  };
  const { shown, hidden } = partitionBySignificance(entries);
  if (entries.length === 0) return <p data-stream-empty className="text-sm text-ink-muted">{t('emptyFiltered')}</p>;
  const drawn = revealed ? [...shown, ...hidden] : shown;
  return (
    <>
      {/* ONE DECLARATION FOR THE WHOLE PAGE (§11 :452–:454, "a sheet may open one further sheet"). The
          registry is REPLACED by each `DeclareTabs` — `RightPane.tsx` :44–:46, :66–:72 — so a second declarer
          beside this one would erase whatever the first put there, and on `/research/corpus` the record sheet
          and §27's three nested sheets are open at the same moment. The record's tab is built as a VALUE by
          `useRecordTab` and the extraction slot contributes its own; this places them in the order a reader
          opened them.
          What is open is a reader's choice, so it is client state and never a URL parameter — a record opened
          is not a filtered view. */}
      <DeclareTabs tabs={[...(recordTab === null ? [] : [recordTab]), ...(extraction?.tabs ?? [])]} />
      <ul data-stream className="flex flex-col gap-2">
        {drawn.map((entry) =>
          entry.kind === 'CAPTURE' ? (
            <CaptureRow key={`c-${entry.capture}-${entry.page.trackedUrlId}`} entry={entry} onOpen={open} extraction={extraction} spansPages={spansPages} />
          ) : (
            <DiffCard key={`d-${entry.before}-${entry.after}-${entry.page.trackedUrlId}`} entry={entry} onOpen={open} spansPages={spansPages} />
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
