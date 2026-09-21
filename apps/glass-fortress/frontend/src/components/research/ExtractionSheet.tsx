'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAsyncData } from '@/hooks/useAsyncData';
import { researchFetch } from '@/lib/researchFetch';
import { parseArticleRules, parseCaptures, parseRuleHistory } from '@/lib/researchBody';
import { formatCaptureDate } from '@/lib/format';
import { useOpenRecord } from '@/components/corpus/RecordSheet';
import type { PaneTab } from '@/components/shell/RightPane';
import { ResearchFetchBoundary } from './ResearchFetchBoundary';
import type { ExtractionSlot } from '@/components/corpus/Stream';
import type { CaptureEntry } from '@/types/corpus';
import type { ArticleRule, CaptureRow, RuleHistory } from '@/types/research';

// ---------------------------------------------------------------------------
// THE EXTRACTION SHEET — "how this text was extracted". docs/gf-ui-flows.md §27 :867–:872; UI plan :754–:758;
// interaction A5 :1199 (`get_article_rules`), :1208 (`list_captures`), :1214 (`get_rule_history`).
//
// THREE READS, THREE NESTED SHEETS, OPENED ONLY ON DEMAND — "the walk's working state is reachable from the
// record and from nowhere else" (§1). ON DEMAND IS MECHANICAL HERE, not a promise: a level that is SHUT
// contributes no tab, so its body is never mounted and the read inside it never happens. A stream of 22
// capture rows therefore costs ZERO requests, opening one sheet costs one, and the rules and the history cost
// one each when a reader asks for them — measured, not asserted, by `CO-9`.
//
// THE SHEETS ARE RIGHT-PANE TABS, AND THEY ARE VALUES. `DeclareTabs` REPLACES the registry (`RightPane.tsx`
// :44–:46, :66–:72), so three components each declaring would leave one tab and erase the record sheet
// beside them. `useExtraction` therefore BUILDS the tabs and hands them up; the page's one declarer — the
// stream — puts them in the pane. The mechanism is unchanged: `DeclareTabs` + `useOpenRecord(id)`, CALLED.
//
// THE MARKING URL IS NEVER AN ANCHOR (ui §31 :925–:926; MARKING :576–:578: "the instructions come from the
// chat before the URL does"). `get_article_rules` SENDS it inside `pendingStop`, so the absence here is over
// something present rather than over nothing — which is what makes `no-marking-link-from-research` a control
// and not a tautology. The pending stop is the approved SENTENCE, `research.stop.pending`, and this file
// never reads the field at all: there is no href here to get wrong.
//
// NO ID REACHES A READER (§4 :167; Q6, ruled 2026-09-20). `get_rule_history` carries `createdById` and a
// `researcherId` per decision — the walk's reads still serve ids where the thesis's no longer do — and this
// sheet renders neither, so the rule's history shows no author at all rather than a hash where a handle
// belongs. The `ruleId` travels in a path and in a `data-` attribute, never as text.
// ---------------------------------------------------------------------------

/** A capture's own tab id — its page and its instant, never rendered (§4 :167). */
function extractionIdOf(entry: CaptureEntry): string {
  return `extraction:${entry.page.trackedUrlId}:${entry.capture}`;
}

/**
 * THE RULES IN FORCE AT A CAPTURE (§27 :869, "filtered by validFrom/validTo").
 *
 * THE COMPARISON IS ON THE CAPTURE'S OWN 14-DIGIT INSTANT, NOT ON ITS DAY, and the schema says why in as many
 * words: `Rule.validFrom` is "waybackTimestamp of the capture it was created against. **A rule marked against
 * the 14:00 capture must not govern 09:00 of the same day**" (`schema.prisma` :1790–:1795), and `validTo` is a
 * `waybackTimestamp | null` that "governs t < validTo". Both are instants; `snapshotDate` is `YYYY-MM-DD`.
 * Comparing the two spellings is not merely coarse, it is WRONG IN BOTH DIRECTIONS — `'20211201000000'` and
 * `'2021-12-23'` sort by their fourth character, `'1'` against `'-'`, so a live rule reads as not yet begun.
 * It passed only because the fixture had been written in the page's spelling rather than the wire's (the
 * `gf-a-fixture-that-does-not-match-reality` shape, found by REVIEW against a real body).
 *
 * A HALF-OPEN INTERVAL, and the two halves are not symmetrical: `validFrom` is INCLUSIVE — the capture the
 * rule was marked against is governed by it — and `validTo` is EXCLUSIVE, so a rule is already out at the
 * capture that ended it. Both are 14-digit strings of equal length, which sort lexicographically exactly as
 * they order in time: nothing is parsed, so no timezone can move a boundary.
 *
 * IT IS EXPORTED FOR ITS OWN CASE. This is the ONE derivation the sheet performs, it decides what a
 * researcher is told was in force when the text was cut, and a wrong boundary is invisible on a screen.
 */
export function rulesInForceAt(rules: readonly ArticleRule[], capture: string): ArticleRule[] {
  return rules.filter((rule) => rule.validFrom <= capture && (rule.validTo === null || capture < rule.validTo));
}

/** The work-list row for one capture — `list_captures` answers the page's rows and this is ours. */
function WorkRow({ row }: { row: CaptureRow }) {
  const t = useTranslations('research.extraction');
  const outcome = useTranslations('research.outcome');
  const locale = useLocale();
  return (
    <div data-work-row className="flex flex-col gap-1">
      <h3 className="record-title">{t('workRow')}</h3>
      {/* The outcome is the read's own closed word through the frozen catalogue, never the code itself. */}
      <p data-work-outcome className="record-meta">
        {outcome(row.outcome)}
      </p>
      {/* `comparedTo` IS A CAPTURE'S INSTANT — a 14-digit wayback timestamp — so it is FORMATTED into the
          approved sentence and never printed (§4 :167–:170). `dir="auto"` on the LINE: it is Hebrew with a
          date at its end, and the line resolves RTL from its first strong character (R67's M5 ruling). */}
      {row.comparedTo === null ? null : (
        <p dir="auto" data-work-compared className="record-meta">
          {t('comparedTo', { date: formatCaptureDate(row.comparedTo, locale) })}
        </p>
      )}
      {row.stale ? (
        <p data-work-stale className="record-meta">
          {t('stale')}
        </p>
      ) : null}
      {/* THE STOP'S GATES, as the numbers the walk names them by — `stopGates` is `(0|1|2|4|5|'DIGEST')[]`, a
          CLOSED SET of gate names and not an identifier, so it is not an id as text (§4 :167). `null` and `[]`
          are different facts and only the first means "nothing stopped here". */}
      {row.stopGates === null ? null : (
        <p data-work-gates className="record-meta">
          {t('stopGates')} <span dir="ltr">{row.stopGates.join(' · ')}</span>
        </p>
      )}
    </div>
  );
}

/** One rule, and the control that opens its history — the third and last sheet. */
function RuleRow({ rule, onOpenHistory }: { rule: ArticleRule; onOpenHistory: (ruleId: string) => void }) {
  const t = useTranslations('research.extraction');
  return (
    <li data-rule-row data-rule={rule.ruleId} className="flex flex-col gap-1 border-b border-line py-2">
      {/* A SELECTOR IS WHAT THE RULE DOES, not an identifier — and it is LTR inside a Hebrew document. */}
      <bdi dir="ltr" data-rule-selector className="break-all text-sm text-ink">
        {rule.selector}
      </bdi>
      {rule.trusted ? (
        <span data-rule-trusted className="text-xs text-ink-muted">
          {t('trusted')}
        </span>
      ) : null}
      <button
        type="button"
        data-open-rule-history
        onClick={() => {
          onOpenHistory(rule.ruleId);
        }}
        className="self-start text-xs text-ink-muted underline"
      >
        {t('ruleHistory')}
      </button>
    </li>
  );
}

/** The rule's history: every match, capture by capture, with the text it removed where a body is held. */
function RuleHistoryBody({ history }: { history: RuleHistory }) {
  const t = useTranslations('research.extraction');
  const outcome = useTranslations('research.outcome');
  const locale = useLocale();
  return (
    <div data-rule-history className="flex flex-col gap-2 p-3">
      <h3 className="record-title">{t('ruleHistory')}</h3>
      <bdi dir="ltr" data-rule-selector className="break-all text-sm text-ink">
        {history.rule.selector}
      </bdi>
      {history.rule.trusted ? (
        <span data-rule-trusted className="text-xs text-ink-muted">
          {t('trusted')}
        </span>
      ) : null}
      <ul data-rule-matches className="flex flex-col gap-2">
        {history.matches.map((match) => (
          <li key={match.capture} data-rule-match className="flex flex-col gap-1">
            <span dir="auto" className="record-meta">
              {formatCaptureDate(match.capture, locale)} · {outcome(match.outcome)}
            </span>
            {/* `removed: null` means the corpus holds no body to re-derive from; `[]` means the rule removed
                NOTHING — two different facts (A5 :1218–:1222), and only the second is a list with no members. */}
            {match.removed === null ? null : (
              <>
                <span className="text-xs text-ink-muted">{t('removed')}</span>
                <ul className="flex flex-col gap-1">
                  {match.removed.map((text, index) => (
                    // THE ARCHIVE'S OWN BYTES, in the one class that says so (§26 :820): the platform did not
                    // author the text a rule cut out of a captured page.
                    <li key={`${match.capture}-${String(index)}`} dir="auto" data-removed-text className="record-captured">
                      {text}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * EACH SHEET OWNS ITS OWN READ, AND THAT IS FORCED BY THE SHELL RATHER THAN CHOSEN.
 *
 * `DeclareTabs` re-registers only when its SIGNATURE changes, and the signature is the ids and the labels —
 * the content is a node and cannot be compared (`RightPane.tsx` :63–:72). So a tab whose id stays put while
 * its content changes keeps the node the pane was first handed: a sheet whose read is held by the PAGE would
 * be registered at `loading` and stay there for ever, on staging exactly as in a case. Measured here on
 * 2026-09-21, and it is the same shape `CaptureSheet` already answers — the component that needs a body reads
 * for itself, so the node the pane holds re-renders itself and no declaration has to notice.
 */
function ExtractionBody({ entry }: { entry: CaptureEntry }) {
  const page = entry.page.trackedUrlId;
  const read = useMemo(() => (signal: AbortSignal) => researchFetch(`/api/research/pages/${page}/captures`, parseCaptures, { signal }), [page]);
  const captures = useAsyncData(read);
  return (
    <ResearchFetchBoundary state={captures.state}>
      {(rows) => {
        const row = rows.find((one) => one.capture === entry.capture);
        // A CAPTURE THE PAGE'S OWN WORK LIST DOES NOT HOLD IS A CONTRADICTION, not an empty state: the stream
        // row came from the same corpus. It fails by name rather than drawing a blank sheet.
        if (row === undefined) throw new Error(`extraction sheet: the work list of ${entry.page.url} holds no row for this capture`);
        return <WorkRow row={row} />;
      }}
    </ResearchFetchBoundary>
  );
}

function RulesBody({ trackedUrlId, capture, onOpenHistory }: { trackedUrlId: string; capture: string; onOpenHistory: (ruleId: string) => void }) {
  const t = useTranslations('research.extraction');
  const stopPending = useTranslations('research.stop')('pending');
  const read = useMemo(
    () => (signal: AbortSignal) => researchFetch(`/api/research/pages/${trackedUrlId}/rules`, parseArticleRules, { signal }),
    [trackedUrlId],
  );
  const rules = useAsyncData(read);
  return (
    <ResearchFetchBoundary state={rules.state}>
      {(answer) => (
        <>
          <h3 className="record-title">{t('rulesInForce')}</h3>
          <ul data-rules-in-force className="flex flex-col gap-2">
            {rulesInForceAt(answer.rules, capture).map((rule) => (
              <RuleRow key={rule.ruleId} rule={rule} onOpenHistory={onOpenHistory} />
            ))}
          </ul>
          {/* THE PENDING STOP IS A FACT IN WORDS AND NOTHING ELSE (§27 :874–:876). `answer.pendingStop` carries
              `markingUrl` and this never reads it: there is no href here to get wrong. */}
          {answer.pendingStop === null ? null : (
            <p data-stop-pending className="record-meta">
              {stopPending}
            </p>
          )}
        </>
      )}
    </ResearchFetchBoundary>
  );
}

function HistoryBody({ trackedUrlId, ruleId }: { trackedUrlId: string; ruleId: string }) {
  const read = useMemo(
    () => (signal: AbortSignal) => researchFetch(`/api/research/pages/${trackedUrlId}/rules/${ruleId}/history`, parseRuleHistory, { signal }),
    [trackedUrlId, ruleId],
  );
  const history = useAsyncData(read);
  return <ResearchFetchBoundary state={history.state}>{(answer) => <RuleHistoryBody history={answer} />}</ResearchFetchBoundary>;
}

/**
 * THE THREE SHEETS, as one value the gated page hands to the stream.
 *
 * `trackedUrlId` NAMES THE PAGE ON EVERY ROUTE (ui §7 :302–:306, "the route names the page by
 * `:trackedUrlId`"), and it is the row's own field — no id is composed here and none is shown.
 *
 * NO `outcome` IS SENT to `list_captures`. The read answers the page's rows in timestamp order and the row a
 * sheet wants is the one whose `capture` matches; an `outcome=` would narrow a list the sheet does not show,
 * and an empty one is a malformed parameter the route answers 400 to.
 *
 * WHAT THIS HOLDS IS WHICH SHEET IS OPEN, AND NOTHING ELSE. A level that is shut contributes no tab, so its
 * body is not mounted and its read does not happen — which is §27 :871's "opened only on demand" expressed as
 * a fact about the tree rather than as a flag.
 */
export function useExtraction(): ExtractionSlot {
  const t = useTranslations('research.extraction');
  const openPane = useOpenRecord();
  const [capture, setCapture] = useState<CaptureEntry | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ruleId, setRuleId] = useState<string | null>(null);

  const tabs: PaneTab[] = [];
  if (capture !== null) {
    const id = extractionIdOf(capture);
    const trackedUrlId = capture.page.trackedUrlId;
    tabs.push({
      id,
      label: t('open'),
      content: (
        <div data-extraction-sheet className="flex flex-col gap-3 p-3">
          <ExtractionBody entry={capture} />
          <button
            type="button"
            data-open-rules
            onClick={() => {
              setRulesOpen(true);
              openPane(`${id}:rules`);
            }}
            className="self-start text-xs text-ink-muted underline"
          >
            {t('rulesInForce')}
          </button>
        </div>
      ),
    });

    if (rulesOpen) {
      tabs.push({
        id: `${id}:rules`,
        label: t('rulesInForce'),
        content: (
          <div data-rules-sheet className="flex flex-col gap-3 p-3">
            <RulesBody
              trackedUrlId={trackedUrlId}
              capture={capture.capture}
              onOpenHistory={(next) => {
                setRuleId(next);
                openPane(`${id}:history`);
              }}
            />
          </div>
        ),
      });
    }

    if (ruleId !== null) {
      tabs.push({
        id: `${id}:history`,
        label: t('ruleHistory'),
        // KEYED BY THE RULE: a different rule is a different sheet, never the same one re-pointed, so no rule
        // ever draws the previous one's matches while its own read is in flight (the `CaptureSheet` lesson).
        content: <HistoryBody key={ruleId} trackedUrlId={trackedUrlId} ruleId={ruleId} />,
      });
    }
  }

  return {
    tabs,
    control: (entry: CaptureEntry) => (
      <button
        type="button"
        data-open-extraction={extractionIdOf(entry)}
        onClick={() => {
          // A NEW CAPTURE CLOSES THE TWO LEVELS BELOW IT. The rules of one capture's date are not the rules of
          // another's, and a history left open would sit under a sheet that no longer lists its rule.
          setCapture(entry);
          setRulesOpen(false);
          setRuleId(null);
          openPane(extractionIdOf(entry));
        }}
        className="text-xs text-ink-muted underline"
      >
        {t('open')}
      </button>
    ),
  };
}
