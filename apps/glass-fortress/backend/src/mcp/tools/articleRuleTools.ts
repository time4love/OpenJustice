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

export const checkRulesetSurvivalSchema = {
  runId: z.string().min(1).describe('The calibration run to re-check its accepted captures against'),
};

export const resetArticleCalibrationSchema = {
  url: z.url().describe('The page whose calibration is to be superseded'),
  reason: z
    .string()
    .min(1)
    .describe(
      'REQUIRED. A reset ends the authority of real work, and why is not optional — the same rule ' +
        'that makes a skipped capture carry its reason.',
    ),
};

export const resolveEraBoundarySchema = {
  runId: z.string().min(1).describe('The calibration run this resolution belongs to'),
  snapshotId: z
    .string()
    .min(1)
    .describe('The capture the rules stopped matching on — the one the detector stopped at'),
  resolution: z
    .enum(['REDESIGN', 'BAD_CAPTURE'])
    .describe(
      'REDESIGN: the page was rebuilt, so the era ENDS at this capture and the next opens here. ' +
        'BAD_CAPTURE: this capture is unusable — truncated, an error page, a paywall redirect — and ' +
        'the pass continues IN THE SAME ERA, however many consecutive bad captures occur.',
    ),
  reason: z
    .string()
    .min(1)
    .optional()
    .describe('Required for BAD_CAPTURE. A silent hole in the record is not permitted.'),
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

/**
 * Put the marked rules in force for this URL.
 *
 * IT DOES NOT RE-DERIVE ANYTHING, and it used to say that it did. Until
 * 2026-09-01 this returned `capturesRederived: <storedCaptures>` and described
 * itself as re-deriving every stored capture. Nothing applies a chrome ruleset
 * to a stored capture: `deriveTextUnderRuleset` has three callers, all of them
 * the marking page or a check, and `TrackedUrl.activeArticleRulesetId` is
 * written and never read.
 *
 * NOBODY CAUGHT IT BECAUSE NO RUN HAS EVER BEEN COMMITTED — three marking walks,
 * each ending before the act that would have exposed it. A success arm that has
 * never fired is unproven, and this one was reporting a fabricated number at the
 * exact moment a researcher approves a research act.
 *
 * Build-order step 2 makes the claim true. Until then this says what it does.
 */
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
        // A FACT ABOUT THE URL, NOT A CLAIM ABOUT THIS CALL. It says how many
        // captures the ruleset will govern once something applies it — never
        // how many were changed here, which is none.
        storedCaptures: before.storedCaptures,
        capturesRederived: 0,
        note:
          'The ruleset is saved and set active for this URL. NO STORED CAPTURE CHANGED: nothing ' +
          'applies a chrome ruleset to a capture yet, so committing versions the rules and ' +
          'derives nothing. Build-order step 2 in the plan is what makes it act.',
        // WHAT WAS APPROVED, restated from the declaration the researcher saw.
        applied: renderApprovalEffect(before.effect),
        reversible:
          'Reversible: mark again and commit. The documents are stored whole, so any extraction ' +
          'can be re-derived from bytes already held and no snapshot anchor is affected — an ' +
          'anchor commits to the raw bytes, not to the derived text.',
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
    // THE ID TRAVELS WITH THE DATE. `open_article_capture` names a capture by
    // snapshotId — correctly, since a date is not unique in this corpus — but
    // coverage reported dates alone, so there was no way to open any capture
    // except the one the policy happened to pick. A table you can read and
    // cannot act on is half a table.
    captures: coverage.rows.map((r) => ({
      date: r.date,
      snapshotId: r.snapshotId,
      verdict: r.verdict,
    })),
  };
}

/**
 * Re-derive every ACCEPTED capture under the ruleset in force now.
 *
 * THE UNION RULESET'S ONE RISK, MADE CHECKABLE — and the researcher's ruling on
 * what a difference means: ANY text a capture no longer keeps is lost text and
 * is alerted, whether or not it was furniture. On a capture whose extraction was
 * APPROVED that is worse still, since an approval whose text has since changed
 * no longer describes anything.
 *
 * Marking only ever looks forward: the researcher reads the removed text of the
 * capture in front of them. A selector added for a 2022 page that damages a 2020
 * page lands where nobody is looking. This is the pass that looks back — over
 * EVERY stored capture, because `commit_article_rules` re-derives every one of
 * them and an unjudged capture is damaged just as silently, it simply breaks no
 * approval on the way in.
 *
 * THE PARSER ARRIVES BY DYNAMIC IMPORT, as it does for `judge_article_capture`:
 * re-deriving text needs jsdom, and a static import here would pull it into
 * every unit suite that loads this module.
 */
export async function checkRulesetSurvivalHandler(input: { runId: string }): Promise<string> {
  const { checkRulesetSurvival } = await import('../../services/rulesetSurvival');
  const report = await checkRulesetSurvival(input.runId);
  return JSON.stringify({
    ...report,
    next:
      report.notTested === report.capturesChecked
        ? 'NOTHING WAS TESTED: every capture had already been checked against every selector in ' +
          'force, so no comparison was made. This is not a pass.'
        : report.alerts === 0
          ? `No stored capture loses text under a rule that was never checked against it. ` +
            `${String(report.notTested)} capture(s) had nothing to test and are not counted as passing.`
          : 'Each alerted capture must be re-judged under the current rules, or the suspect ' +
          'selector undone. `brokenApprovals` is the worse half: those captures had their ' +
          'extraction APPROVED, and an approval whose text has since changed no longer ' +
          'describes anything.',
  });
}

/**
 * DRAW A LINE UNDER A URL'S CALIBRATION — nothing recorded before it governs.
 *
 * SUPERSEDES, NEVER DELETES. Every decision stays in the log with its authority
 * ended, so the record of what was tried survives. Level 10 rules the same way for
 * the corpus; this is that rule applied to a calibration.
 *
 * WHY IT EXISTS. A ruleset can become entangled past repair: the news page met a
 * redesign at `2021-06-12` while `resolve_era_boundary` did not yet exist, so the
 * only available action was to correct and accept, and ten selectors belonging to
 * a new era landed inside the old one. THE LOG IS APPEND-ONLY, so a boundary
 * recorded afterwards gives the DATE and never the rule split — both eras would
 * carry the same union. The researcher's diagnosis: an entangled history is a
 * SYMPTOM, and the cure is a fresh start rather than a repair.
 *
 * IT IS AN EVENT ON THE URL, NOT A DECISION IN A RUN, and the difference is
 * load-bearing rather than tidy. A run is a WORKING SESSION whose decisions inherit
 * its lifecycle; a reset has no work attached and no lifecycle. Modelling it inside
 * a run forced the question "does abandoning that run un-reset the URL" — and a
 * question with no good answer is how a wrong model announces itself.
 *
 * NOTHING SURVIVES IT, ERA BOUNDARIES INCLUDED. A boundary survives an ABANDONED
 * RUN because a session is not a page; that is a rule about runs and does not
 * transfer. A reset is often reached for BECAUSE the era structure is wrong — a
 * redesign answered where there was none — so one that spared boundaries would
 * preserve exactly the corruption it was called for. Re-recording a known boundary
 * costs one tool call, not a marking pass.
 *
 * IT OPENS NOTHING AND MARKS NOTHING. Calibrating after it is the ordinary flow.
 */
export async function resetArticleCalibrationHandler(input: {
  url: string;
  reason: string;
}): Promise<string> {
  const researcherId = getResearcherId();
  if (!researcherId) {
    return JSON.stringify({ error: 'A reset is attributed to a researcher. No researcher in context.' });
  }
  if (input.reason.trim() === '') {
    return JSON.stringify({
      error:
        'A reset ends the authority of real work and carries its reason. A silent hole in the ' +
        'record is the one outcome this corpus does not permit.',
      url: input.url,
    });
  }

  const trackedUrl = await prisma.trackedUrl.findUnique({
    where: { url: input.url },
    select: { id: true },
  });
  if (!trackedUrl) {
    return JSON.stringify({ error: 'This URL is not in the corpus.', url: input.url });
  }

  const superseded = await prisma.calibrationDecision.count({
    where: { calibrationRun: { trackedUrlId: trackedUrl.id } },
  });

  const reset = await prisma.calibrationReset.create({
    data: { trackedUrlId: trackedUrl.id, researcherId, reason: input.reason.trim() },
    select: { id: true, createdAt: true },
  });

  return JSON.stringify({
    url: input.url,
    resetId: reset.id,
    at: reset.createdAt.toISOString(),
    reason: input.reason.trim(),
    // COUNTED, NOT ESTIMATED. A researcher is told how much work just lost its
    // authority, in the same breath as being told it still exists.
    decisionsSuperseded: superseded,
    kept:
      'Nothing was deleted. Every decision stays in the log; only its authority over this URL ' +
      'ended, so what was tried is still readable.',
    next:
      'Calibrate from here as usual. ERA BOUNDARIES DID NOT SURVIVE — a reset is often reached for ' +
      'because the era structure is wrong, so re-record any boundary you still believe with ' +
      'resolve_era_boundary, which costs one call per boundary and no marking.',
  });
}

/**
 * WHERE A DETECTION BECOMES A DECISION.
 *
 * The detectors notice that the rules stopped matching. Nothing in the system can
 * say what that MEANS — a redesign and a truncated archive page look identical to
 * a match rate — so the pass stops and puts one binary question to the researcher.
 * This is where their answer enters the record.
 *
 * IT IS THE ONLY WAY AN ERA COMES INTO EXISTENCE. The plan: a boundary is always a
 * DECISION and never an inference. That constrains every other tool more than it
 * constrains this one — the detectors must stop and ask rather than conclude, and
 * no other path may write `ERA_BOUNDARY`.
 *
 * THE TWO ANSWERS ARE DELIBERATELY ASYMMETRIC. Only `REDESIGN` creates anything.
 * `BAD_CAPTURE` skips and continues in the SAME era however many consecutive ones
 * occur — an archive outage or a stretch of paywall redirects is a real pattern,
 * and no number of them adds up to a structural claim. An earlier draft required a
 * failure to persist over k captures before declaring a boundary; `k` was a number
 * with nothing measured behind it, and asking on the FIRST detection deletes it.
 *
 * A BOUNDARY CARRIES THE PREVIOUS ERA'S RULES FORWARD UNCHANGED, and this tool
 * DERIVES NOTHING. An earlier design seeded the new era with the selectors that
 * still matched — but that is a ruleset no human approved, sitting in the log
 * looking exactly like one that had. After a boundary the rules genuinely have not
 * changed; the PAGE has. The researcher's marking is what sets the new era's
 * rules, and until then the era is UNCONFIRMED, so nothing acts on it.
 *
 * That behaviour needs no code here: `appendCalibrationDecision` already carries
 * `current.selectors` forward for every decision that is not a correction.
 *
 * WHAT IT DOES NOT DO: it does not detect (it takes no thresholds and computes no
 * signals), it does not judge whether the rules are RIGHT (that is
 * `approve`/`judge`), it does not mark, it re-derives nothing, and it does not
 * advance the pass. It records one answer about one capture.
 */
export async function resolveEraBoundaryHandler(input: {
  runId: string;
  snapshotId: string;
  resolution: 'REDESIGN' | 'BAD_CAPTURE';
  reason?: string;
}): Promise<string> {
  if (input.resolution === 'BAD_CAPTURE' && (input.reason === undefined || input.reason.trim() === '')) {
    return JSON.stringify({
      error:
        'A capture recorded as unusable carries its reason. A silent hole in the record is the one ' +
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

  try {
    // DYNAMIC IMPORT, as `judge_article_capture` does: `captureMarking` reaches
    // `chromeRulesetApply` and through it jsdom, whose dependency chain is
    // ESM-only, so a static import here would pull it into every unit suite that
    // loads this module.
    const { appendDecisionWithObservation } = await import('../../services/captureMarking');
    await appendDecisionWithObservation(input.runId, before.state.version, {
      type:
        input.resolution === 'REDESIGN'
          ? CalibrationDecisionType.ERA_BOUNDARY
          : CalibrationDecisionType.CAPTURE_SKIPPED,
      snapshotId: input.snapshotId,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
  } catch (err) {
    return JSON.stringify({
      runId: input.runId,
      error: err instanceof Error ? err.message : 'The resolution could not be recorded.',
      hint: 'Re-read the run with get_article_rules and try again.',
    });
  }

  const after = await describeCalibrationRun(input.runId);
  return JSON.stringify({
    runId: input.runId,
    snapshotId: input.snapshotId,
    recorded: input.resolution,
    selectors: after.state.selectors.length,
    ...(input.resolution === 'REDESIGN'
      ? {
          eraOpened: true,
          rulesCarriedForward:
            'The new era starts with the previous era\'s rules UNCHANGED. This tool records that the ' +
            'page was rebuilt; it does not guess the new rules, because a ruleset nobody approved ' +
            'must not sit in the log looking like one that was.',
          next:
            'Mark this capture — it is the first of the new era and is never clean, because the rules ' +
            'have not met this page before. The era is UNCONFIRMED until n consecutive captures need ' +
            'no correction, and an unconfirmed era is abandonable.',
        }
      : {
          eraOpened: false,
          next:
            'The capture is recorded as unusable and the pass continues IN THE SAME ERA. Consecutive ' +
            'bad captures never add up to a boundary — only a REDESIGN opens an era. NOTE: a skipped ' +
            'capture must also be excluded from DIFFING, or a truncated page manufactures a false ' +
            '"text removed" diff; that is Level 5 and is NOT yet enforced.',
        }),
  });
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
        // THE CAPTURE THESE SELECTORS WERE CHECKED AGAINST, and the only one they
        // were. The draft has always known it; it used to be discarded one line
        // later, which left every selector in the corpus without a date and made
        // the survival check compare four captures against themselves.
        snapshotId: input.snapshotId,
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
    //
    // AND WHEN THE RULES JUST CHANGED, THE CHECK COMES FIRST. A judgement that
    // promoted a correction added selectors that have never been tried against
    // any EARLIER capture, and that is precisely when a positional selector
    // starts removing text from a page nobody is looking at. Naming the check
    // here is what makes it part of the loop rather than a tool someone has to
    // remember exists.
    next:
      input.verdict === 'REJECTED'
        ? 'The rules are recorded as wrong here. Correct them in the marking page and judge this ' +
          'capture again — a rejection routes back to calibration, it never skips a capture.'
        : promotedSelectors === null
          ? 'Call next_article_capture for the capture where the ruleset is most likely to have ' +
            'stopped applying.'
          : 'The rules changed with this verdict. Call check_ruleset_survival BEFORE moving on: ' +
            'the added selectors have never been tried against any earlier capture, and a ' +
            'positional one can remove text from a page nobody re-renders. Then ' +
            'next_article_capture.',
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
    removedSample: sampleRemoved(preview.removedSegments),
    // THE CAVEAT TRAVELS WITH THE NUMBERS, because they invite exactly one wrong
    // reading and it is the dangerous one.
    whatTheNumbersDoNotSay:
      'These say whether the rules still MATCH this capture. They do NOT say whether what was ' +
      'removed is furniture — a rule that has swallowed a paragraph reports a healthy percentage. ' +
      '`removedSample` is a TRUNCATED sample of each block, enough to spot prose among furniture ' +
      'and not a substitute for looking: open the capture and read the removed pane. That ' +
      'judgement is the researcher\'s and is why the page exists.',
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

/** How much of each removed block travels back to the chat. */
const REMOVED_SAMPLE = 200;

/**
 * A SAMPLE of what each rule removed — deliberately not the whole thing.
 *
 * WITHOUT IT THE EVIDENCE NEVER REACHES THE CONVERSATION. A researcher on
 * claude.ai has an MCP connector and nothing else: no developer tools, no way for
 * the assistant to read the page. The tool reported that 68% was removed and
 * said nothing about WHAT, so the only record of an approval was the word
 * "accepted" with no trace of what had been inspected.
 *
 * TRUNCATED ON PURPOSE, AND THE TRUNCATION IS THE POINT. The news page removes
 * 6,548 characters; returning all of it every call is unreasonable, and a tool
 * that handed over the whole document would invite the assistant to judge it —
 * which is the one thing this level says it does not do. A sample is enough to
 * spot PROSE among furniture and not enough to substitute for looking.
 *
 * `fullLength` travels with each sample so a truncated block cannot be mistaken
 * for a short one — the same reason `truncated` exists on the outline.
 */
function sampleRemoved(
  segments: readonly { selector: string; text: string }[],
): { selector: string; sample: string; fullLength: number }[] {
  return segments.map((seg) => {
    const flat = seg.text.replace(/\s+/g, ' ').trim();
    return {
      selector: seg.selector,
      sample: flat.length > REMOVED_SAMPLE ? `${flat.slice(0, REMOVED_SAMPLE)}…` : flat,
      fullLength: seg.text.length,
    };
  });
}
