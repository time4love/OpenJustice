'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CopyableCode } from '@/components/CopyableCode';
import { DeclareTabs } from '@/components/shell/RightPane';
import { displayUrl, formatCaptureDate } from '@/lib/format';
import { useOpenRecord } from './RecordSheet';
import type { TrajectoryCapture, TrajectoryEntry } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CLAIMS VIEW'S ROWS AND SHEET — docs/gf-ui-flows.md §25 :788–:810 as amended 2026-09-20; the UI plan's
// :616–:627 and §10 :1217–:1223 ("a run strip per claim and the claim's sheet on the right").
//
// THE ROWS ARE THE READ'S, IN THE READ'S ORDER. `list_trajectories` orders by the date the claim LAST LEFT,
// latest first, so "removed and never restored" reads first (§6.1 :248–:249) — and that key is NOT derivable
// from anything on a row: `lastSeen` is the last capture the claim was SEEN at, which for a claim that
// returned is NEWER than the day it left. Five rows of the real page prove it. So this component sorts
// nothing, and `claims-per-page` holds that a re-sort is caught.
//
// ONE TICK PER CAPTURE, NEVER ONE PER FLIP (§25 :791, ruled 2026-09-20). The vector is `captures[]`; the
// spans in `changes[]` name their FIRST capture only, so a strip drawn from them showed 4 marks for 22
// captures. Each tick carries its own instant in `data-`, never as text (§4 :167).
//
// THE SHEET IS A RIGHT-PANE TAB through the shell's own `DeclareTabs` and the corpus's own
// `useOpenRecord` — the same mechanism the record sheet uses, CALLED and never re-spelled. What differs is
// the id (`claimIdOf`) and the content; the act of opening is one function for both.
//
// THE DIFFS ARE COMPOSED FROM CONSECUTIVE CAPTURES WHOSE `present` FLIPS, and this is the whole reason the
// vector exists. The pair a claim left in is (the capture before the flip, the capture at it). Measured on
// the real body: composed this way, all 87 flip pairs of the page's 26 rows are diffs the walk actually
// wrote; composed from the spans instead, 49 of 87 name pairs that do not exist.
//
// NO CURRENCY MARK AND NO CITED MARK (§25 :795–:806): both are properties of a (thesis, trajectory) pair and
// have no meaning on a row this read computes without any thesis.
// ---------------------------------------------------------------------------

/** A row's stable identity — the same string the tap sets and the tab declares. Never rendered. */
export function claimIdOf(entry: TrajectoryEntry): string {
  return `claim:${entry.page.trackedUrlId}:${entry.patternHash}`;
}

/** The captures at which the claim's state FLIPPED, each with the capture before it — the diffs it moved in. */
export function flipsOf(captures: readonly TrajectoryCapture[]): { before: TrajectoryCapture; after: TrajectoryCapture }[] {
  return captures.flatMap((capture, index) => {
    const previous = captures.at(index - 1);
    if (index === 0 || previous === undefined || previous.present === capture.present) return [];
    return [{ before: previous, after: capture }];
  });
}

/** The page a row belongs to, shown as §4 :167–:178 requires: the domain and path, never the `trackedUrlId`. */
function PageLabel({ url }: { url: string }) {
  return (
    <bdi dir="ltr" data-page-label className="break-all text-xs text-ink-muted">
      {displayUrl(url)}
    </bdi>
  );
}

/**
 * THE RUN STRIP — one tick per capture, in capture order, present or absent.
 *
 * AN SVG AND NOT A ROW OF SPANS, for two reasons that are not style. A span per capture is an EMPTY element
 * whose only content is its colour, which is what W-24 exists to refuse; and a tick must be a SHAPE rather
 * than a hue, so a reader who cannot distinguish the two tones still sees present as a full mark and absent
 * as a hollow one. Every mark is `currentColor` inside a token class, so there is no palette here.
 *
 * THE GEOMETRY IS CAPTURE ORDER, NOT ELAPSED TIME, and that is deliberate. §25 :791 asks for the pattern
 * "across its captures"; the page card's true-time axis (§24 region 3) is ONE PAGE's shape, where the voids
 * between captures are the point. Here every tick is one observation of one sentence, and spacing them by
 * date would make a row of 22 marks unreadable at 375px while saying nothing the page card does not already
 * say above it. The instant is still on every tick, in `data-capture`.
 */
function RunStrip({ entry }: { entry: TrajectoryEntry }) {
  const t = useTranslations('corpus.claims');
  const locale = useLocale();
  const width = entry.captures.length * 6;
  return (
    <svg
      data-run-strip
      viewBox={`0 0 ${String(width)} 8`}
      className="h-2 w-full max-w-[12rem]"
      role="img"
      aria-label={t('strip', {
        first: formatCaptureDate(entry.captures.at(0)?.waybackTimestamp ?? '', locale),
        last: formatCaptureDate(entry.captures.at(-1)?.waybackTimestamp ?? '', locale),
      })}
    >
      <g className="text-ink">
        {entry.captures.map((capture, index) => (
          <circle
            key={capture.waybackTimestamp}
            data-claim-tick
            data-capture={capture.waybackTimestamp}
            data-present={capture.present ? 'true' : undefined}
            cx={index * 6 + 3}
            cy={4}
            r={2}
            fill={capture.present ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1"
          />
        ))}
      </g>
    </svg>
  );
}

/** One row: the claim's first words, the page, the strip, the two facts, and the group's count if it is one. */
function ClaimRow({ entry, onOpen }: { entry: TrajectoryEntry; onOpen: (entry: TrajectoryEntry) => void }) {
  const t = useTranslations('corpus.claims');
  const sheet = useTranslations('theses.sheet');
  const first = entry.claims.at(0);
  return (
    <li data-claim-row className="flex flex-col gap-1 border-b border-line py-2">
      <button
        type="button"
        data-open-claim={claimIdOf(entry)}
        onClick={() => {
          onOpen(entry);
        }}
        className="flex flex-col gap-1 text-start"
      >
        {/* THE ARCHIVE'S OWN BYTES, in the one class that says so (§26 :820's rule applied at §25 :790): the
            platform did not author this sentence, and the thesis page's `#tr_` pane already draws it so. */}
        <span dir="auto" className="record-captured">
          {first?.claimText ?? ''}
        </span>
        <PageLabel url={entry.page.url} />
        <RunStrip entry={entry} />
        <span className="flex flex-wrap items-baseline gap-2 text-xs text-ink-muted">
          {/* THE THESIS PAGE'S OWN PLURAL, CALLED: the trajectory pane states this exact fact, and a second
              key for one number is the orphaned-copy defect. */}
          <span data-transitions>{sheet('transitions', { count: entry.transitions })}</span>
          <span data-final-state>{entry.finalState === 'PRESENT' ? t('present') : t('absent')}</span>
          {/* THE CO-MOVEMENT IS THE FINDING (§25 :791): a row showing one sentence of a group of 45 hides it. */}
          {entry.claimCount > 1 ? <span data-also-moved>{t('alsoMoved', { count: entry.claimCount - 1 })}</span> : null}
        </span>
      </button>
    </li>
  );
}

/** The sheet: the claim at every capture, the diffs it moved in, and every member of the group. */
function ClaimSheet({ entry }: { entry: TrajectoryEntry }) {
  const t = useTranslations('corpus.claims');
  const corpus = useTranslations('corpus');
  const record = useTranslations('record');
  const locale = useLocale();
  const id = entry.page.trackedUrlId;
  const flips = flipsOf(entry.captures);
  return (
    <div data-claim-sheet className="flex flex-col gap-3 p-3">
      <h2 className="record-title">{t('overTime')}</h2>

      {/* EVERY CAPTURE, IN ORDER, each a link to its own record page (§25 :809). The link's word is the
          capture's own — the date, through the catalogue's `record.capture` — so no id is read aloud. */}
      <ul data-claim-captures className="record-meta flex flex-col gap-1">
        {entry.captures.map((capture) => (
          <li key={capture.waybackTimestamp}>
            {/* `dir="auto"` ON THE DATED STRING — the `RecordContent` heading's own fix, for the same string
                and the same reason: „צילום של העמוד מ־{date}" is Hebrew with a NEUTRAL run at its end, and a
                date left to the paragraph's direction renders its parts in the wrong order at the boundary.
                `bidi-isolated` found it here exactly as it found it on the capture page. */}
            <a dir="auto" data-capture-link href={`/pages/${id}/captures/${capture.waybackTimestamp}`} className="record-links underline">
              {record('capture', { date: formatCaptureDate(capture.waybackTimestamp, locale) })}
            </a>{' '}
            <span data-capture-state>{capture.present ? t('capturePresent') : t('captureAbsent')}</span>
          </li>
        ))}
      </ul>

      {/* THE DIFFS IT LEFT OR RETURNED IN — composed from consecutive captures whose `present` flips, which
          is the pair the walk wrote. A pair built from the SPANS instead names a diff that does not exist. */}
      {flips.length === 0 ? null : (
        <ul data-claim-diffs className="record-meta flex flex-col gap-1">
          {flips.map((flip) => (
            <li key={`${flip.before.waybackTimestamp}-${flip.after.waybackTimestamp}`}>
              {/* The interval is TWO DATES AND NOTHING ELSE, so it is `ltr` outright — the stream's own
                  spelling for the same `corpus.interval` string. */}
              <a
                dir="ltr"
                data-diff-link
                href={`/pages/${id}/diffs/${flip.before.waybackTimestamp}/${flip.after.waybackTimestamp}`}
                className="record-links underline"
              >
                {corpus('interval', {
                  first: formatCaptureDate(flip.before.waybackTimestamp, locale),
                  last: formatCaptureDate(flip.after.waybackTimestamp, locale),
                })}
              </a>{' '}
              <span data-flip-direction>{flip.after.present ? t('returnedIn') : t('leftIn')}</span>
            </li>
          ))}
        </ul>
      )}

      {/* THE GROUP'S MEMBERS (§25 :810): a thesis cites ONE `ClaimTrajectory.id` and never a pattern, so a
          group of 45 is 45 tokens and the group itself has none. A single-claim row has one control. */}
      <ul data-claim-members className="flex flex-col gap-2">
        {entry.claims.map((claim) => (
          <li key={claim.trajectoryId} className="flex flex-col gap-1">
            <span dir="auto" className="record-captured">
              {claim.claimText}
            </span>
            <CopyableCode value={`#tr_${claim.trajectoryId}`} label={corpus('copyToken')} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The pane's declaration — the open claim is the reader's choice after the page arrives, so it is state. */
function ClaimSheetTab({ entries, openId }: { entries: readonly TrajectoryEntry[]; openId: string | null }) {
  const open = entries.find((entry) => claimIdOf(entry) === openId);
  if (open === undefined) return <DeclareTabs tabs={[]} />;
  // A TAB'S LABEL IS THE CLAIM'S OWN WORDS, never an id (§4) and never the `patternHash` the tab is keyed on.
  const label = open.claims.at(0)?.claimText ?? displayUrl(open.page.url);
  return <DeclareTabs tabs={[{ id: claimIdOf(open), label, content: <ClaimSheet key={claimIdOf(open)} entry={open} /> }]} />;
}

/**
 * WHICH EMPTY THIS IS, and the two are different claims about the corpus.
 *
 * `tracked` — no pass describes this page's current state, so the corpus has nothing to say about its
 * claims at all (§6.1 :248's `undetected`). `filtered` — the reader asked about a window, or asked
 * malformedly, and THIS ANSWER is empty; the corpus may know plenty. Saying "no tracked claims were found
 * on this page" over a date chip would be false in the direction that closes an investigation, so the
 * caller decides which sentence it has the standing to say, and the stream's own `emptyFiltered` carries
 * the other one — the same words `/corpus` uses for the same situation.
 */
export type ClaimsEmptiness = 'tracked' | 'filtered';

export function Claims({ entries, emptiness }: { entries: readonly TrajectoryEntry[]; emptiness: ClaimsEmptiness }) {
  const t = useTranslations('corpus.claims');
  const corpus = useTranslations('corpus');
  const [openId, setOpenId] = useState<string | null>(null);
  const openRecord = useOpenRecord();
  const open = (entry: TrajectoryEntry): void => {
    setOpenId(claimIdOf(entry));
    openRecord(claimIdOf(entry));
  };
  if (entries.length === 0) {
    return emptiness === 'tracked' ? (
      <p data-claims-empty className="text-sm text-ink-muted">{t('empty')}</p>
    ) : (
      <p data-stream-empty className="text-sm text-ink-muted">{corpus('emptyFiltered')}</p>
    );
  }
  return (
    <>
      <ClaimSheetTab entries={entries} openId={openId} />
      <ul data-claims className="flex flex-col gap-2">
        {entries.map((entry) => (
          <ClaimRow key={claimIdOf(entry)} entry={entry} onOpen={open} />
        ))}
      </ul>
    </>
  );
}
