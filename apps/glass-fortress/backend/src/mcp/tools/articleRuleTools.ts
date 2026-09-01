import { z } from 'zod';
import { CalibrationDecisionType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { routing } from '../../lib/publicRoutes';
import { getResearcherId } from '../../context/researcherContext';
import { admitUrl } from '../../services/admitUrl';
import { fetchContentForRelevanceCheck } from '../../services/fetchContentForRelevanceCheck';
import {
  abandonCalibrationRun,
  commitCalibrationRuleset,
  describeCalibrationRun,
  openCalibrationRun,
  readCalibrationDraft,
  discardCalibrationDraft,
} from '../../services/calibrationRun';
import { renderApprovalEffect } from '../../services/approvalEffect';
import { describeRunCoverage } from '../../services/runCoverage';

// ---------------------------------------------------------------------------
// LEVEL 4 — the three tools, over one service.
//
// HOW MCP DRIVES A UI, and the constraint everything follows from: an MCP call
// is request/response and CANNOT WAIT FOR A HUMAN. There is no protocol
// primitive for a server driving a client's UI, and a client times out long
// before a researcher finishes marking twenty pages.
//
//     chat    -> start tool          creates a run, returns a URL, RETURNS NOW
//     browser -> /article-rules/:id  the human works; reads and writes ONLY
//                                    that run's rows
//     chat    -> get_article_rules   reads the outcome when the human says
//                                    they are done
//
// THE CONTRACT IS A ROW, NOT A CALLBACK. The tool and the browser never talk to
// each other. Resumption is then free — close the tab, reopen the URL — and
// nothing anywhere is blocked.
//
// THREE TOOLS RATHER THAN ONE WITH A `mode` ENUM, because the preconditions
// genuinely differ and a tool DESCRIPTION is how the model decides what to call:
// A WRONG ENUM VALUE IS REPRESENTABLE, A WRONG TOOL IS NOT. The schema carries
// no mode field for the same reason — the modes differ in their preconditions,
// which live here, not in the run.
//
// `scan_with_approval` IS DELIBERATELY ABSENT. It returns a `ScanRun`, which is
// step 2b and does not exist. A stub describing a capability it does not have
// would be worse than its absence: the description is what the model acts on.
// ---------------------------------------------------------------------------

export const calibrateArticleRulesSchema = {
  // `z.url()`, not `z.string().url()` — the latter is deprecated in zod 4 and
  // the ratchet counts it. Same validation, same emitted JSON schema.
  url: z.url().describe('The page whose furniture — navigation, advertising, footers — is to be marked'),
};

export const correctArticleRulesSchema = {
  url: z.url().describe('A URL already in the corpus, whose stored captures will be re-marked'),
};

export const getArticleRulesSchema = {
  runId: z.string().min(1).describe('The calibration run id returned by a start tool'),
};

export const nextArticleCaptureSchema = {
  runId: z.string().min(1).describe('The calibration run to choose the next capture for'),
};

export const openArticleCaptureSchema = {
  runId: z.string().min(1).describe('The calibration run whose capture is to be opened'),
  snapshotId: z
    .string()
    .min(1)
    .describe('The capture to open — the snapshotId next_article_capture returned'),
};

export const judgeArticleCaptureSchema = {
  runId: z.string().min(1).describe('The calibration run this verdict belongs to'),
  snapshotId: z
    .string()
    .min(1)
    .describe('The capture being judged — the snapshotId next_article_capture returned'),
  verdict: z
    .enum(['ACCEPTED', 'REJECTED', 'SKIPPED'])
    .describe(
      'ACCEPTED: the rules are right on this capture. REJECTED: the RULES are wrong here — never ' +
        'that the capture is bad; it routes back to marking. SKIPPED: the capture genuinely ' +
        'cannot be used, and a reason is REQUIRED.',
    ),
  reason: z
    .string()
    .min(1)
    .optional()
    .describe('Required for SKIPPED. A silent hole in the record is not permitted.'),
};

export const commitArticleRulesSchema = {
  runId: z.string().min(1).describe('The calibration run whose rules are to be put in force'),
};

export const abandonArticleRulesSchema = {
  runId: z.string().min(1).describe('The calibration run to close without applying its rules'),
};

/**
 * Approving and abandoning belong HERE, not on a web page.
 *
 * COMMITTING A RULESET IS A RESEARCH ACT — a researcher deciding that this filter
 * becomes what the corpus reads for this page, saving a versioned ruleset and
 * re-deriving every stored capture under it. Every other research act in this
 * platform (`promote_evidence`, `publish_thesis`, `promote_scan_findings`) is
 * authorised through a tool that declares its effect. Until now `commit` and
 * `abandon` existed only as HTTP routes, which made this the one consequential
 * act approved from a browser rather than from the researcher's own surface.
 *
 * The routes remain, so the interactive and headless paths stay the same path.
 */
async function closeRun(
  runId: string,
  close: (runId: string, expectedVersion: number) => Promise<unknown>,
  describe: (result: unknown, before: Awaited<ReturnType<typeof describeCalibrationRun>>) => object,
): Promise<string> {
  let before;
  try {
    before = await describeCalibrationRun(runId);
  } catch {
    return JSON.stringify({
      error: 'No calibration run with that id. It may have been created against another environment.',
      runId,
    });
  }

  if (before.state.status !== 'OPEN') {
    return JSON.stringify({
      error: `This run is ${before.state.status} and accepts no further decisions.`,
      runId,
      status: before.state.status,
    });
  }

  try {
    // THE VERSION IS READ HERE, NOT SUPPLIED BY THE CALLER. A researcher
    // approving in chat is approving "commit this run", not "commit at version
    // N" — a number they have no way to hold. If another writer moves the run
    // between the read and the write the service refuses, and that refusal is
    // reported rather than forced: a stale version means somebody else changed
    // the rules, which is exactly when a silent overwrite would be wrong.
    const result = await close(runId, before.state.version);
    return JSON.stringify(describe(result, before));
  } catch (err) {
    return JSON.stringify({
      runId,
      error: err instanceof Error ? err.message : 'The run could not be closed.',
      hint: 'Re-read the run with get_article_rules and try again.',
    });
  }
}

/** Put the marked rules in force, and re-derive every stored capture under them. */
export async function commitArticleRulesHandler(input: { runId: string }): Promise<string> {
  return closeRun(
    input.runId,
    commitCalibrationRuleset,
    (result, before) => {
      const committed = result as { rulesetId: string; articleRulesetId: string };
      return {
        runId: input.runId,
        status: 'COMMITTED',
        rulesetId: committed.rulesetId,
        selectors: before.state.selectors,
        capturesRederived: before.storedCaptures,
        // WHAT WAS APPROVED, restated from the declaration the researcher saw.
        applied: renderApprovalEffect(before.effect),
        reversible:
          'Reversible: mark again and commit. The documents are stored whole and are re-derived ' +
          'from bytes already held, so no snapshot anchor is affected — an anchor commits to the ' +
          'raw bytes, not to the derived text.',
      };
    },
  );
}

/** Close the run without applying anything. The marking record is kept. */
export async function abandonArticleRulesHandler(input: { runId: string }): Promise<string> {
  return closeRun(
    input.runId,
    abandonCalibrationRun,
    (_result, before) => ({
      runId: input.runId,
      status: 'ABANDONED',
      // NOT "nothing was saved". The decision log is kept — what is NOT saved is
      // the RULESET. Calling those the same thing is the confusion the marking
      // page's own "close without saving" label caused.
      keptRecord: `${String(before.state.capturesJudged)} judged capture(s) and their decisions remain in the log.`,
      applied: 'No ruleset was saved. No capture was re-derived.',
    }),
  );
}

/** The one place a start tool's answer is composed, so the two cannot diverge. */
async function startedRun(runId: string): Promise<string> {
  const detail = await describeCalibrationRun(runId);
  return JSON.stringify({
    runId,
    markingUrl: routing.articleRulesUrl(runId),
    selectors: detail.state.selectors,
    storedCaptures: detail.storedCaptures,
    // RENDERED FROM THE DECLARATION, never authored beside it. The chat shows
    // what approving will do before the browser is even opened.
    effect: renderApprovalEffect(detail.effect),
    effectDeclaration: detail.effect,
    message:
      'Open the marking URL and mark the page furniture there. Marking is visual and cannot be ' +
      'done through a chat tool. Call get_article_rules WHEN YOU SAY YOU ARE DONE — it is not ' +
      'to be polled on a timer.',
  });
}

/**
 * Mode 1 — calibrate a page, fetching captures that are not persisted.
 *
 * ADMISSION RUNS HERE, exactly as it does in `start_forensic_scan` and for the
 * same reason: this tool can bring a URL into the corpus, and a mission gate
 * that exists on the website's path but not the researcher's is a gate on the
 * interface where its absence is least defensible.
 */
export async function calibrateArticleRulesHandler(input: { url: string }): Promise<string> {
  const researcherId = getResearcherId();
  if (!researcherId) {
    return JSON.stringify({ error: 'A calibration is attributed to a researcher. No researcher in context.' });
  }

  const admission = await admitUrl({ url: input.url, fetchContent: fetchContentForRelevanceCheck });
  if (!admission.admitted) {
    return JSON.stringify({
      error:
        admission.verdict === 'UNREADABLE'
          ? 'Could not retrieve this URL to assess it.'
          : 'URL not relevant to this investigation.',
      verdict: admission.verdict,
      reason: admission.reason,
      url: input.url,
    });
  }

  const state = await openCalibrationRun({
    trackedUrlId: admission.trackedUrlId,
    researcherId,
  });
  return startedRun(state.runId);
}

/**
 * Mode 3 — correct the rules for a page already scanned. No network at all.
 *
 * ADMISSION DOES NOT RUN. The URL is already in the corpus, admitted once with a
 * recorded verdict; re-admitting would spend a fetch and a model call to write a
 * second verdict about a page whose admission was never in question. The
 * precondition here is different in kind — it is about what we HOLD, not about
 * whether the page belongs.
 *
 * THIS IS THE MODE TO BUILD AGAINST FIRST. It needs no fetch, no scan, no
 * classifier spend and no chain, and it is also the missing measurement: whether
 * human-marked filtering is safe at all, answered on data already held.
 */
export async function correctArticleRulesHandler(input: { url: string }): Promise<string> {
  const researcherId = getResearcherId();
  if (!researcherId) {
    return JSON.stringify({ error: 'A calibration is attributed to a researcher. No researcher in context.' });
  }

  const trackedUrl = await prisma.trackedUrl.findUnique({
    where: { url: input.url },
    select: { id: true, _count: { select: { snapshots: true } } },
  });

  if (!trackedUrl) {
    return JSON.stringify({
      error: 'This URL is not in the corpus. Use calibrate_article_rules to mark a page for the first time.',
      url: input.url,
    });
  }
  if (trackedUrl._count.snapshots === 0) {
    // The precondition, stated as the reason rather than as a refusal: with no
    // stored capture there is nothing to render, and correcting rules against
    // nothing is the vacuity this level demotes everywhere else.
    return JSON.stringify({
      error:
        'This URL is tracked but holds no captures, so there is nothing to mark against. ' +
        'Scan it first, or use calibrate_article_rules to mark against freshly fetched pages.',
      url: input.url,
      storedCaptures: 0,
    });
  }

  const state = await openCalibrationRun({ trackedUrlId: trackedUrl.id, researcherId });
  return startedRun(state.runId);
}

/**
 * Read the outcome. CHEAP BY CONSTRUCTION — one indexed query, a bounded read of
 * recent observations, and a fold over tens of rows. Nothing is fetched and
 * nothing is derived.
 */
export async function getArticleRulesHandler(input: { runId: string }): Promise<string> {
  let detail;
  try {
    detail = await describeCalibrationRun(input.runId);
  } catch {
    // Gone or never existed. The plan: same treatment as an expired OAuth
    // interaction — an answer, not a 500.
    return JSON.stringify({
      error: 'No calibration run with that id. It may have been created against another environment.',
      runId: input.runId,
    });
  }

  const { state } = detail;
  const coverage = await describeRunCoverage(input.runId);
  return JSON.stringify({
    runId: state.runId,
    status: state.status,
    // COVERAGE LEADS, and it leads with DISTINCT captures. Everything below is
    // about the rules; this is the only part that says how much of the page's
    // history they have actually been tested against.
    coverage: coverageReport(coverage, state),
    version: state.version,
    selectors: state.selectors,
    rulesetId: state.rulesetId,
    capturesShown: state.capturesShown,
    // REPORTED BESIDE `capturesShown` BECAUSE SHOWING IS NOT JUDGING. When the
    // two differ, the gap is captures the researcher looked at and left alone,
    // and every number below is computed from the judged ones only.
    capturesJudged: state.capturesJudged,
    corrections: state.corrections,
    capturesNeedingCorrection: state.capturesNeedingCorrection,
    // NULL IS NOT ZERO. A rate of 0 from an empty denominator would read as a
    // ruleset tested and never found wanting, which is the opposite of the
    // truth, so the null is passed through and named.
    correctionRate: state.correctionRate,
    consecutiveCleanCaptures: state.consecutiveCleanCaptures,
    stoppingIndicator:
      state.correctionRate === null
        ? `No capture has been judged yet${
            state.capturesShown > 0 ? ` (${String(state.capturesShown)} shown)` : ''
          } — this says nothing about the rules.`
        : `${String(state.consecutiveCleanCaptures)} of ${String(state.capturesJudged)} judged ` +
          'capture(s) in a row needed no correction. Informative only if those captures were chosen ' +
          'to disagree — similar pages produce no corrections and test nothing.',
    staleSelectors: detail.staleSelectors,
    storedCaptures: detail.storedCaptures,
    effect: renderApprovalEffect(detail.effect),
    markingUrl: routing.articleRulesUrl(state.runId),
  });
}

/**
 * WHICH CAPTURE TO LOOK AT NEXT, and why — the adaptive half of the policy.
 *
 * Its purpose was settled by measurement rather than design: on 2026-09-01 one
 * unchanged ruleset matched 19 of 21 selectors on a 2020 capture, 16 of 21 nine
 * days later and 3 of 21 after 4.3 years. Decay along the time axis is a
 * BOUNDARY, so the job is to find it — reach for the point furthest from
 * everything judged, then bisect.
 *
 * IT RECOMMENDS; IT DOES NOT SEQUENCE. The researcher can open any capture they
 * like, which is why the reason travels with the pick: a recommendation nobody
 * can disagree with usefully is not a recommendation.
 */
export async function nextArticleCaptureHandler(input: { runId: string }): Promise<string> {
  let detail;
  let coverage;
  try {
    [detail, coverage] = await Promise.all([
      describeCalibrationRun(input.runId),
      describeRunCoverage(input.runId),
    ]);
  } catch {
    return JSON.stringify({
      error: 'No calibration run with that id. It may have been created against another environment.',
      runId: input.runId,
    });
  }

  const { state } = detail;
  const picked = coverage.next;
  const row =
    picked === null ? null : (coverage.rows.find((r) => r.snapshotId === picked.snapshotId) ?? null);

  return JSON.stringify({
    runId: state.runId,
    status: state.status,
    coverage: coverageReport(coverage, state),
    nextCapture:
      picked === null || row === null
        ? null
        : {
            snapshotId: picked.snapshotId,
            date: row.date,
            // THE DEEP LINK, not the run. A tool that names a capture and then
            // sends the researcher to a page listing twelve dates has not
            // finished its sentence.
            captureUrl: routing.articleCaptureUrl(state.runId, picked.snapshotId),
            why: WHY[picked.reason],
            daysFromNearestJudged: picked.daysFromNearestJudged,
          },
    // THE STOPPING RULE IS REPORTED, NEVER ENFORCED. Level 4's rule is "no
    // corrections on the last three versions" — and a streak means nothing
    // unless the captures were chosen to disagree, which is exactly what this
    // tool is now for. Stale selectors are reported beside it because a clean
    // streak on a ruleset that has stopped matching is the emptiest kind of
    // agreement.
    stopping:
      picked === null
        ? 'Every capture in the sample has been judged.'
        : state.consecutiveCleanCaptures >= 3
          ? `${String(state.consecutiveCleanCaptures)} judged captures in a row needed no correction — ` +
            'the stopping rule is satisfied. Informative only if those captures were chosen to disagree.'
          : `${String(state.consecutiveCleanCaptures)} of the last judged captures needed no correction; ` +
            'the stopping rule asks for three.',
    staleSelectors: detail.staleSelectors,
    message:
      picked === null
        ? 'Nothing left to show. Call commit_article_rules to put these rules in force, or ' +
          'abandon_article_rules to close without applying them.'
        : 'Open the capture URL — it shows this one capture and nothing else. Marking is visual ' +
          'and cannot be done through a chat tool. Record the verdict with judge_article_capture.',
  });
}

const WHY: Record<NonNullable<Awaited<ReturnType<typeof describeRunCoverage>>['next']>['reason'], string> = {
  FIRST:
    'Nothing has been judged yet, so this starts in the MIDDLE of the history rather than at the ' +
    'earliest capture — the oldest era may be a template the site has left entirely.',
  FURTHEST_FROM_JUDGED:
    'This capture is the furthest in time from anything already judged, so it is where the ruleset ' +
    'is most likely to have stopped applying.',
  ONLY_REMAINING: 'It is the only capture in the sample not yet judged.',
};

/** Coverage, DISTINCT CAPTURES FIRST — the number that says anything about it. */
function coverageReport(
  coverage: Awaited<ReturnType<typeof describeRunCoverage>>,
  state: { capturesJudged: number; capturesShown: number },
): object {
  return {
    distinctCapturesJudged: coverage.distinctJudged,
    sampleSize: coverage.rows.length,
    storedCaptures: coverage.storedCaptures,
    // Reported after, and separately: a capture judged twice is two episodes and
    // one capture, and presenting them as the same thing is how the page once
    // showed two judgements of one capture as coverage of two.
    judgements: state.capturesJudged,
    capturesShown: state.capturesShown,
    captures: coverage.rows.map((r) => ({ date: r.date, verdict: r.verdict })),
  };
}

/**
 * Record a verdict on one capture, from the researcher's own surface.
 *
 * THE PIECE THAT MADE THE REDESIGN INCONSISTENT UNTIL NOW. Sequencing moved to
 * `next_article_capture` and approval to `commit_article_rules`, while the
 * verdict — the actual judgement — was still written by the browser. The
 * researcher noticed on the first session that used the new flow: "aren't we
 * supposed to be using MCP tools now?" They were right; there was nothing to
 * call.
 *
 * THE PARSER ARRIVES BY DYNAMIC IMPORT. Recording a verdict also records an
 * observation, which derives the capture's text and therefore needs jsdom. A
 * static import would put that chain in front of every `unit` suite that reaches
 * these tools, which is the failure this module hit an hour before this was
 * written.
 */
export async function judgeArticleCaptureHandler(input: {
  runId: string;
  snapshotId: string;
  verdict: 'ACCEPTED' | 'REJECTED' | 'SKIPPED';
  reason?: string;
}): Promise<string> {
  if (input.verdict === 'SKIPPED' && (input.reason === undefined || input.reason.trim() === '')) {
    return JSON.stringify({
      error:
        'A skipped capture is recorded with its reason. A silent hole in the record is the one ' +
        'outcome this corpus does not permit.',
      runId: input.runId,
    });
  }

  let before;
  try {
    before = await describeCalibrationRun(input.runId);
  } catch {
    return JSON.stringify({
      error: 'No calibration run with that id. It may have been created against another environment.',
      runId: input.runId,
    });
  }
  if (before.state.status !== 'OPEN') {
    return JSON.stringify({
      error: `This run is ${before.state.status} and accepts no further decisions.`,
      runId: input.runId,
      status: before.state.status,
    });
  }

  const { appendDecisionWithObservation } = await import('../../services/captureMarking');
  let promotedSelectors: { from: number; to: number; selectors: string[] } | null = null;
  try {
    // THE DRAFT IS PROMOTED FIRST, and only when it was handed back. This is
    // where the page's output becomes a decision: the researcher marked, pressed
    // done, and is now judging what they marked. Promoting an autosave instead
    // would record rules they were still in the middle of changing.
    //
    // It must precede the verdict, because a verdict is ABOUT a ruleset — judging
    // first would attach the judgement to the rules as they were before the
    // corrections it is a judgement of.
    let version = before.state.version;
    const draft = await readCalibrationDraft(input.runId);
    const promoted =
      draft !== null &&
      draft.returnedAt !== null &&
      draft.snapshotId === input.snapshotId &&
      !sameSelectorSet(draft.selectors, before.state.selectors);
    // `if (promoted)` alone: TypeScript narrows `draft` through the aliased
    // condition above, so an extra `&& draft` is a guard the types say can never
    // fail — which the debt ratchet correctly refuses.
    if (promoted) {
      await appendDecisionWithObservation(input.runId, version, {
        type: CalibrationDecisionType.RULESET_CORRECTED,
        selectors: [...draft.selectors],
      });
      version += 1;
      await discardCalibrationDraft(input.runId);
      promotedSelectors = {
        from: before.state.selectors.length,
        to: draft.selectors.length,
        selectors: [...draft.selectors],
      };
    }

    // The version is read here, not supplied: a researcher judging in chat is
    // judging a capture, not a version number they have no way to hold.
    await appendDecisionWithObservation(input.runId, version, {
      type: VERDICT[input.verdict],
      snapshotId: input.snapshotId,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
  } catch (err) {
    return JSON.stringify({
      runId: input.runId,
      error: err instanceof Error ? err.message : 'The verdict could not be recorded.',
      hint: 'Re-read the run with get_article_rules and try again.',
    });
  }

  const after = await describeRunCoverage(input.runId);
  const state = await describeCalibrationRun(input.runId);
  return JSON.stringify({
    runId: input.runId,
    recorded: input.verdict,
    snapshotId: input.snapshotId,
    rulesetChanged: promotedSelectors,
    coverage: coverageReport(after, state.state),
    // A REJECTION DOES NOT ADVANCE. The plan: "reject routes back to
    // calibration, it never skips a capture." The researcher fixes the rules and
    // looks at the same capture again.
    next:
      input.verdict === 'REJECTED'
        ? 'The rules are recorded as wrong here. Correct them in the marking page and judge this ' +
          'capture again — a rejection routes back to calibration, it never skips a capture.'
        : 'Call next_article_capture for the capture where the ruleset is most likely to have ' +
          'stopped applying.',
    staleSelectors: state.staleSelectors,
  });
}

const VERDICT = {
  ACCEPTED: CalibrationDecisionType.CAPTURE_ACCEPTED,
  REJECTED: CalibrationDecisionType.CAPTURE_REJECTED,
  SKIPPED: CalibrationDecisionType.CAPTURE_SKIPPED,
} as const;

/**
 * Open ONE capture for a human to look at.
 *
 * THE TOOL THAT SPAWNS THE UI, which is the whole of the UI's remaining job:
 * "a visual instrument for checking and correcting a ruleset against one
 * capture." It returns a deep link to that capture rather than to the run, so
 * the researcher lands on the page they were sent to instead of hunting for it
 * in a strip of dates.
 *
 * IT TAKES A SNAPSHOT ID, NOT A DATE. A date is what a person holds, but it is
 * not unique — this corpus has days carrying two and three captures — and
 * resolving one would mean either guessing, or an ambiguity branch on every
 * call. `next_article_capture` hands the id over, so the flow always has one.
 *
 * IT REPORTS MATCH COUNTS, AND SAYS WHAT THEY DO NOT MEAN. A removal fraction
 * tells you the selectors still MATCH; it cannot tell you whether what they
 * removed was furniture, and a rule that has swallowed a paragraph reports a
 * healthy-looking percentage. That judgement is why the page exists, and these
 * numbers are context for the visit, never a substitute for it.
 */
export async function openArticleCaptureHandler(input: {
  runId: string;
  snapshotId: string;
}): Promise<string> {
  let detail;
  try {
    detail = await describeCalibrationRun(input.runId);
  } catch {
    return JSON.stringify({
      error: 'No calibration run with that id. It may have been created against another environment.',
      runId: input.runId,
    });
  }

  const capture = await prisma.urlSnapshot.findFirst({
    where: { id: input.snapshotId, trackedUrlId: detail.state.trackedUrlId },
    select: { id: true, snapshotDate: true, waybackTimestamp: true },
  });
  if (!capture) {
    // SCOPED TO THE RUN'S PAGE, deliberately: a snapshot id from another page
    // would otherwise open a capture this ruleset was never about.
    return JSON.stringify({
      error: 'This run\'s page has no such capture.',
      runId: input.runId,
      snapshotId: input.snapshotId,
    });
  }

  const verdict =
    detail.state.judgedCaptures.find((j) => j.snapshotId === capture.id)?.verdict ?? null;
  const { previewUnderSelectors } = await import('../../services/captureMarking');
  const preview = await previewUnderSelectors(capture.id, detail.state.selectors);
  const matched = detail.state.selectors.filter((sel) => (preview.matchCounts[sel] ?? 0) > 0).length;

  // SHOWING IS RECORDED HERE, because this is the thing that shows it. The page
  // used to post `CAPTURE_SHOWN` on load, which made the browser a writer of
  // decisions for the one act it no longer performs — and a re-run of that effect
  // appended a second showing against a moved version.
  //
  // A FAILURE HERE IS NOT FATAL TO THE ANSWER. The researcher still needs the
  // URL; a run whose log is missing one showing is a smaller problem than a tool
  // that refuses to open a capture because it could not write a note about it.
  if (detail.state.status === 'OPEN') {
    const { appendDecisionWithObservation } = await import('../../services/captureMarking');
    await appendDecisionWithObservation(input.runId, detail.state.version, {
      type: CalibrationDecisionType.CAPTURE_SHOWN,
      snapshotId: capture.id,
    }).catch(() => undefined);
  }

  const draft = await readCalibrationDraft(input.runId);
  return JSON.stringify({
    runId: input.runId,
    snapshotId: capture.id,
    date: capture.snapshotDate,
    captureUrl: routing.articleCaptureUrl(input.runId, capture.id),
    alreadyJudged: verdict,
    draft: describeDraft(draft, detail.state.selectors),
    rulesStillMatching: `${String(matched)} of ${String(detail.state.selectors.length)} selectors`,
    removalFraction: Math.round(preview.removalFraction * 100) / 100,
    // THE CAVEAT TRAVELS WITH THE NUMBERS, because they invite exactly one wrong
    // reading and it is the dangerous one.
    whatTheNumbersDoNotSay:
      'These say whether the rules still MATCH this capture. They do NOT say whether what was ' +
      'removed is furniture — a rule that has swallowed a paragraph reports a healthy percentage. ' +
      'Open the capture and read the removed pane; that judgement is why the page exists.',
    message:
      'Open the capture URL, check what the rules remove, correct them if needed, then record the ' +
      'verdict with judge_article_capture.',
  });
}


/**
 * Two rulesets are the same rule, whatever order they were built in.
 *
 * Marking the footer then the nav produces the same filter as the reverse, so
 * comparing positionally would promote a draft that changed nothing — a
 * `RULESET_CORRECTED` recording no correction, which is the vacuity this level
 * demotes everywhere else.
 */
function sameSelectorSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(b);
  return a.every((item) => seen.has(item));
}

/**
 * What the researcher's draft would change, said in chat before they judge it.
 *
 * A VERDICT IS ABOUT A RULESET, so the researcher has to be able to see the one
 * they are about to judge. A tool that promoted a draft silently would ask for a
 * judgement on rules nobody had read since they were edited — which is the
 * approving-what-you-cannot-see failure the effect declaration exists to prevent
 * elsewhere in this platform.
 */
function describeDraft(
  draft: { selectors: readonly string[]; snapshotId: string; returnedAt: Date | null } | null,
  inForce: readonly string[],
): object | null {
  if (draft === null) return null;
  const added = draft.selectors.filter((s) => !inForce.includes(s));
  const removed = inForce.filter((s) => !draft.selectors.includes(s));
  return {
    snapshotId: draft.snapshotId,
    // HANDED BACK, or still being edited. Promoting an autosave would record
    // rules the researcher was in the middle of changing.
    handedBack: draft.returnedAt !== null,
    selectorCount: draft.selectors.length,
    added,
    removed,
    unchanged: added.length === 0 && removed.length === 0,
    note:
      draft.returnedAt === null
        ? 'Still being edited in the marking page. It will not be promoted until it is handed back.'
        : 'Handed back. judge_article_capture will record it as a correction before the verdict.',
  };
}
