'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CitingTheses } from '@/components/record/CitingTheses';
import { useTranslations, useLocale } from 'next-intl';
import { fetchJson } from '@/lib/api';
import { parseCaptureText } from '@/lib/corpusBody';
import { CopyableCode } from '@/components/CopyableCode';
import { LabelledOpinion } from '@/components/opinion/LabelledOpinion';
import { RecordContent } from '@/components/record/RecordContent';
import { PlatformMark } from '@/components/thesis/PlatformMark';
import { type PaneTab, usePaneLayer, usePaneSelection } from '@/components/shell/RightPane';
import { displayUrl, formatCaptureDate } from '@/lib/format';
import type { CaptureEntry, CorpusEntry, DiffEntry } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE RECORD SHEET — docs/gf-ui-flows.md §26 :822–:825, and §24 region 4's "a row tap opens THE RECORD as a
// RIGHT-PANE TAB (§26, and the UI plan's §10 — a tab since the shell gained a pane, not a sheet)".
//
// IT IS A TAB, AND THE SHEET IS HOW THE PHONE DRAWS ONE. §18 as amended: the record is a right-pane tab at
// width and full-screen on the phone, on the ONE Sheet primitive of UI-4b. So there is no second presentation
// here and no second primitive: `DeclareTabs` is CALLED, `usePaneLayer` opens the layer, `usePaneSelection`
// chooses the tab, and the shell draws all of it. This file builds an array and holds which row is open.
//
// `PaneTabs.tsx` IS NOT RE-SPELLED AND NOT EDITED. It is `components/thesis/*`, a KEEP path, and it builds
// tabs from a `Citation` — the thesis page's shape, which a corpus row is not. What the two share is the
// SHELL's primitive, and that is what both call. Re-spelling the mechanism is the defect this round already
// paid for once, in the gate predicate.
//
// A TAB'S LABEL IS DERIVED, NEVER AN ID (§4): a capture is its domain and date, a diff its domain and
// interval. NO NEW STRING: every word here is already in the `corpus` namespace, approved and landed.
//
// THE BYTES ARE `RecordContent`'S, ON BOTH SURFACES — §26 clause (1), as replaced 2026-09-19. What stays
// here is the corpus ROW's own context: the anchor mark, the cited mark, `narrowed`, the change size, the
// labelled opinion, the citation token and the citing theses. None of those exists on a thesis citation,
// which is exactly why the CONTENT was extracted and the PANE was not.
//
// WHAT THIS SHEET DOES NOT CARRY YET, said rather than half-drawn:
//   · A CAPTURE'S TEXT. §26 opens the sheet with "a capture's text", and `list_corpus` does not return one —
//     the body carries `fileHash`, `textHash`, the anchor and the evidence link, and no text at all. THE
//     QUESTION IS NOW ANSWERED (§26 clause (3), evidence A4): the read is `get_capture`, a RESOURCE at
//     `GET /api/pages/:trackedUrlId/captures/:capture`, built at chunk (b) and called on open at chunk (d).
//     Until then the capture sheet's content is LOADING — the state it genuinely is — and never a `CAPTURE`
//     holding an empty string, which would tell a reader the archive held nothing. A DIFF's chunks ARE in
//     this body and are drawn in full.
//   · THE ONE LINK ONWARD to the record's own page — LANDED 2026-09-20 with the record pages themselves,
//     as this note said it would. `OpenRecord` below composes it from `page.trackedUrlId` and the row's own
//     endpoints, for both kinds.
// ---------------------------------------------------------------------------

/** A row's stable identity — the same string the tap sets and the tab declares. Never rendered. */
export function recordIdOf(entry: CorpusEntry): string {
  return entry.kind === 'CAPTURE' ? `capture:${entry.page.trackedUrlId}:${entry.capture}` : `diff:${entry.page.trackedUrlId}:${entry.before}:${entry.after}`;
}

/**
 * THE CAPTURE'S TEXT, READ WHEN THE SHEET OPENS — docs/gf-ui-flows.md §26 clause (2), evidence A4 :1082.
 *
 * `list_corpus` carries `fileHash`, `textHash`, the anchor and the evidence link and NO text at all
 * (measured on the running body: a capture row's keys hold `textHash` and no `text`), so the bytes need
 * their own read. `get_capture` is it, and it is a RESOURCE — one capture, by its page and its timestamp.
 *
 * A READER'S ACT, NOT A FILTER. §8 forbids a page fetching a second read to answer a FILTER; nothing here
 * changes the stream's query or answers the list. It is the same shape as the thesis page's history diff,
 * which reads on the reader's press — and the request is issued only when a sheet is actually opened.
 *
 * NO `textHash` IS SENT, deliberately: a corpus row is not a citation and has no pin, so what this surface
 * wants is the capture's CURRENT extraction — which is exactly what the read answers when the argument is
 * omitted. The argument exists for the thesis page, whose citation does have a pin (§26 clause (2)).
 */
type CaptureText = { state: 'LOADING' } | { state: 'READ'; text: string } | { state: 'FAILED' };

function useCaptureText(entry: CaptureEntry, offline: string): CaptureText {
  const [read, setRead] = useState<CaptureText>({ state: 'LOADING' });
  const path = `/api/pages/${entry.page.trackedUrlId}/captures/${entry.capture}`;
  useEffect(() => {
    const controller = new AbortController();
    // NO RESET TO LOADING HERE — a synchronous `setState` in an effect is what `react-hooks/set-state-in-effect`
    // refuses, and `RecordSheetTab` KEYS this component by the record's id so a different record mounts a
    // FRESH one whose state already starts at LOADING.
    //
    // THE KEY IS LOAD-BEARING, and the road to knowing that is worth more than the sentence. Without it a
    // REUSED instance keeps the previous record's `read` while the new record's request is still in flight,
    // so the sheet draws the PREVIOUS capture's archive bytes under the NEW capture's date — the wrong
    // document presented as the right one. `sheet-reads-on-open`'s SR-6 holds it, and goes RED the moment the
    // key is removed from the element it renders.
    //
    // TWO EARLIER MEASUREMENTS SAID OTHERWISE AND BOTH WERE BROKEN, recorded so neither is repeated. The
    // first drove the PANE, where the sheet does not survive a record change for an unrelated reason —
    // `DeclareTabs` re-registers whenever its tabs' signature changes and `RightPane` early-returns `null` at
    // zero tabs — so the key's absence was masked. The second rendered the component directly but let
    // `rerender` replace a wrapped tree with an unwrapped one, giving the two renders different STRUCTURES,
    // which remounts everything and makes any key look unnecessary. A decoy that reddens nothing is a claim
    // about the instrument before it is a claim about the code.
    void (async () => {
      try {
        const body = parseCaptureText(await fetchJson<unknown>(path, { signal: controller.signal, offline }));
        setRead({ state: 'READ', text: body.text });
      } catch {
        // AN ABORT IS NOT A FAILURE: it means this sheet was closed or replaced, and the component is
        // already gone. Setting FAILED here would be a verdict about a read nobody is waiting for.
        if (!controller.signal.aborted) setRead({ state: 'FAILED' });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [path, offline]);
  return read;
}

/** THE MARKS IN FULL (§26): the anchor as the body states it, and the cited mark where the row is. */
function CaptureMarks({ entry }: { entry: CaptureEntry }) {
  const t = useTranslations('corpus');
  return (
    <span data-sheet-marks className="flex flex-wrap gap-2 text-xs text-ink-muted">
      <span data-anchor-mark>{t(entry.anchor.attributed ? 'anchor.attributed' : 'anchor.notYet')}</span>
      {entry.evidence === null ? null : <span data-cited-mark>{t('cited')}</span>}
    </span>
  );
}

/**
 * EXPORTED FOR ITS OWN INSTRUMENT. `sheet-reads-on-open`'s SR-6 renders this component directly, at a fixed
 * position, so the property under test is THIS component's — "a new record starts clean" — and not a side
 * effect of how the pane happens to re-register its tabs. Nothing in `src/` imports it.
 */
/**
 * THE ONE LINK ONWARD (§26 :824, "ONE link onward to the record's own page"), for both kinds.
 *
 * IT LANDS WITH THE RECORD PAGES AND NOT BEFORE — an anchor to an unbuilt route is what
 * `no-door-before-it-exists` catches, and this sheet carried the absence, declared, since chunk 5b.
 * `record.openRecord` is the word; `page.trackedUrlId` and the row's own endpoints are the href.
 */
function OpenRecord({ entry }: { entry: CorpusEntry }) {
  const r = useTranslations('record');
  const href =
    entry.kind === 'CAPTURE'
      ? `/pages/${entry.page.trackedUrlId}/captures/${entry.capture}`
      : `/pages/${entry.page.trackedUrlId}/diffs/${entry.before}/${entry.after}`;
  return (
    <p data-open-record className="text-xs">
      <a href={href} className="text-ink underline">
        {r('openRecord')}
      </a>
    </p>
  );
}

/**
 * WHETHER THIS ROW'S RECORD CAN BE OPENED AT ALL — the PUBLIC_PAGE predicate, CALLED from the body's own
 * `page.public` and never re-derived (§27 :866; evidence A3 :1051).
 *
 * THE THREE RECORD PATHS OFF THIS SHEET ARE PUBLIC-ONLY AND THERE IS NO GATED TWIN. `get_capture` refuses
 * `NOT_PUBLIC` (`getCapture.ts` :89), `/pages/[trackedUrlId]/captures/[capture]` and `…/diffs/…` are public
 * pages, and ui §7's fourteen gated routes contain no second spelling of any of them. So at `all`, where the
 * stream carries rows of pages no published thesis has opened, a link onward would land on the one 404 and a
 * text read would answer it — an anchor to a door that refuses this reader, which is the defect
 * `no-door-before-it-exists` exists for, and a fetch whose only possible answer is a refusal.
 *
 * IT IS THE ROW'S `public`, NOT THE SCOPE, and that is the narrower and truer rule: at `public` the read
 * returns only opened pages, so the predicate is already true of every row there and a `scope` prop would
 * decide nothing. The mark says what the absence is, so nothing is silently missing.
 */
function opensRecord(entry: CorpusEntry): boolean {
  return entry.page.public;
}

/** A record the reader may not open: what it is, its marks, and the platform's word for why (§21 :626). */
function ClosedRecord({ heading, domain, children }: { heading: string; domain: string; children: ReactNode }) {
  return (
    <>
      <p className="record-head">
        <bdi dir="ltr">{domain}</bdi>
      </p>
      <h2 className="record-title">{heading}</h2>
      {children}
      <p data-record-not-public className="record-meta">
        <PlatformMark kind="notPublic" />
      </p>
    </>
  );
}

/**
 * THE ARCHIVE'S BYTES, and it is its own component for one reason: it OWNS the read.
 *
 * A hook cannot be called conditionally, so the not-public branch must not merely skip rendering what the
 * read returned — it must never mount the thing that reads. Splitting here is what makes "zero requests to
 * `/api/pages/…` for a closed record" a property of the tree rather than of a flag nobody can see.
 */
function CaptureText({ entry }: { entry: CaptureEntry }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const read = useCaptureText(entry, t('textUnread'));
  const domain = displayUrl(entry.page.url);
  const heading = formatCaptureDate(entry.capture, locale);
  return (
    <>
      {/* A FAILED READ DRAWS NO ARCHIVE BOX — and it must not draw the skeleton either, which would say
          "still arriving" about a read that has already ended. IT SAYS SO IN WORDS (approved 2026-09-19):
          silence here is a region a reader cannot tell from "there is nothing to show", which is the shape
          `lib/corpusBody.ts`' own rule is written against. The SAME sentence is `fetchJson`'s `offline`
          message, so a backend that never answered and a backend that refused read identically to a
          reader — both are "the text could not be read", and neither is a claim about the archive. The
          marks are one component called by both branches, never two spellings of one row's marks. */}
      {read.state === 'FAILED' ? (
        <>
          <p className="record-head">
            <bdi dir="ltr">{domain}</bdi>
          </p>
          <h2 className="record-title">{heading}</h2>
          <CaptureMarks entry={entry} />
          <p data-text-unread className="record-meta">{t('textUnread')}</p>
        </>
      ) : (
        <RecordContent
          domain={domain}
          heading={heading}
          content={read.state === 'READ' ? { kind: 'CAPTURE', text: read.text } : { kind: 'LOADING' }}
        >
          <CaptureMarks entry={entry} />
        </RecordContent>
      )}
    </>
  );
}

export function CaptureSheet({ entry }: { entry: CaptureEntry }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const open = opensRecord(entry);
  return (
    <div data-record-sheet data-record-kind="CAPTURE" className="flex flex-col gap-3 p-3">
      {open ? (
        <CaptureText entry={entry} />
      ) : (
        <ClosedRecord heading={formatCaptureDate(entry.capture, locale)} domain={displayUrl(entry.page.url)}>
          <CaptureMarks entry={entry} />
        </ClosedRecord>
      )}
      {/* THE CITATION TOKEN STAYS ON BOTH BRANCHES. It is the row's own `fileHash` and the body already
          carries it; a researcher citing a record the public cannot yet read is exactly how a page BECOMES
          public, so withholding the token would remove the act the gated door exists for. */}
      <CopyableCode value={`#ev_${entry.fileHash}`} label={t('copyToken')} />
      <CitingTheses evidence={entry.evidence} />
      {open ? <OpenRecord entry={entry} /> : null}
    </div>
  );
}

function DiffSheet({ entry }: { entry: DiffEntry }) {
  const t = useTranslations('corpus');
  const locale = useLocale();
  const chunks = entry.current?.chunks ?? [];
  const removed = chunks.filter((chunk) => chunk.side === 'REMOVED');
  const added = chunks.filter((chunk) => chunk.side === 'ADDED');
  return (
    <div data-record-sheet data-record-kind="DIFF" className="flex flex-col gap-3 p-3">
      {/* THE CURRENT CHUNKS, STACKED BY SIDE (§26) — drawn by `RecordContent`, the ONE component §26
          clause (1) rules, so the side words and the serif box are the same element the thesis page's
          record pane uses. The chunks are ALREADY IN THIS BODY, so nothing is read to draw them; only a
          capture's text needs a read, which is why the two sheets differ in their content value and not in
          their component. AWAITING carries the approved sentence this namespace already owns. */}
      <RecordContent
        domain={displayUrl(entry.page.url)}
        heading={t('interval', { first: formatCaptureDate(entry.before, locale), last: formatCaptureDate(entry.after, locale) })}
        content={entry.current === null ? { kind: 'AWAITING', statement: t('awaitingDerivation') } : { kind: 'DIFF', chunks }}
      >
        <span data-sheet-marks className="flex flex-wrap gap-2 text-xs text-ink-muted">
          {entry.evidence === null ? null : <span data-cited-mark>{t('cited')}</span>}
          {entry.narrowed ? <span data-narrowed-mark>{t('narrowed')}</span> : null}
        </span>
        {entry.current === null ? null : (
          <span data-change-size className="text-xs text-ink-muted">{t('changeSize', { removed: removed.length, added: added.length })}</span>
        )}
      </RecordContent>
      {/* The opinion in FULL here — the stream clamps it to two lines, and the sheet is where the rest is
          (§24 region 4: "the rest in the sheet"). It stays inside the one labelled container either way. */}
      {entry.opinion === null ? null : <LabelledOpinion opinion={entry.opinion} />}
      {entry.page.public ? null : <PlatformMark kind="notPublic" />}
      <CitingTheses evidence={entry.evidence} />
      {opensRecord(entry) ? <OpenRecord entry={entry} /> : null}
    </div>
  );
}

/**
 * THE OPEN RECORD'S TAB, AS A VALUE — not a declaration, and the change is forced rather than stylistic.
 *
 * `DeclareTabs` REPLACES the registry (`RightPane.tsx` :44–:46, :66–:72: `declare(tabs)` sets, unmounting
 * clears it to `[]`). One page, two declarers, and the second erases the first — which is exactly what
 * `/research/corpus` would be, where the record sheet and §27's extraction sheet are open at once, and what
 * §11 :452–:454 requires instead ("a sheet may open one further sheet"). So every sheet on a page is built as
 * a `PaneTab` and ONE component declares them all. The mechanism is unchanged and the shell is untouched:
 * `DeclareTabs` + `useOpenRecord(id)` are still the only way a sheet opens.
 *
 * The open record is the READER'S CHOICE made after the page arrives, so it is client state and not a URL
 * parameter: a record opened is not a filtered view and must not be linkable as one. That is the same
 * reasoning `Stream` already records for its reveals.
 */
export function useRecordTab(entries: readonly CorpusEntry[], openId: string | null): PaneTab | null {
  const locale = useLocale();
  const open = entries.find((entry) => recordIdOf(entry) === openId);
  if (open === undefined) return null;
  const label =
    open.kind === 'CAPTURE'
      ? `${displayUrl(open.page.url)} · ${formatCaptureDate(open.capture, locale)}`
      : `${displayUrl(open.page.url)} · ${formatCaptureDate(open.before, locale)}–${formatCaptureDate(open.after, locale)}`;
  return {
    id: recordIdOf(open),
    label,
    // KEYED BY THE RECORD: a different record is a different sheet, not the same sheet re-pointed, so
    // no record ever draws the previous one's bytes. `useCaptureText` records what was measured.
    content: open.kind === 'CAPTURE' ? <CaptureSheet key={recordIdOf(open)} entry={open} /> : <DiffSheet entry={open} />,
  };
}

/**
 * Opening a thing in the pane: the layer opened and the tab selected — one act, one place.
 *
 * IT TAKES AN ID AND NOT A ROW (widened 2026-09-20). The act is "select this tab and open the layer", and it
 * never read anything off the entry but its id. A corpus row is not the only thing the pane holds — the
 * claims view opens a CLAIM's sheet through this same call — and the alternative was a second hook doing the
 * same two things for a different shape, which is the one-rule-many-implementations defect. Each caller names
 * its own id: `recordIdOf` for a row, `claimIdOf` for a trajectory.
 */
export function useOpenRecord(): (id: string) => void {
  const [, setLayer] = usePaneLayer();
  const [, select] = usePaneSelection();
  return (id: string) => {
    select(id);
    setLayer(true);
  };
}
