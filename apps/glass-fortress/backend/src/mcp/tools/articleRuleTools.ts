import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { routing } from '../../lib/publicRoutes';
import { getResearcherId } from '../../context/researcherContext';
import { admitUrl } from '../../services/admitUrl';
import { fetchContentForRelevanceCheck } from '../../services/fetchContentForRelevanceCheck';
import { describeCalibrationRun, openCalibrationRun } from '../../services/calibrationRun';
import { renderApprovalEffect } from '../../services/approvalEffect';

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
  return JSON.stringify({
    runId: state.runId,
    status: state.status,
    version: state.version,
    selectors: state.selectors,
    rulesetId: state.rulesetId,
    capturesShown: state.capturesShown,
    corrections: state.corrections,
    // NULL IS NOT ZERO. A rate of 0 from an empty denominator would read as a
    // ruleset tested and never found wanting, which is the opposite of the
    // truth, so the null is passed through and named.
    correctionRate: state.correctionRate,
    consecutiveCleanCaptures: state.consecutiveCleanCaptures,
    stoppingIndicator:
      state.correctionRate === null
        ? 'No capture has been marked yet — this says nothing about the rules.'
        : `${String(state.consecutiveCleanCaptures)} capture(s) in a row needed no correction. ` +
          'Informative only if those captures were chosen to disagree — similar pages produce no ' +
          'corrections and test nothing.',
    staleSelectors: detail.staleSelectors,
    storedCaptures: detail.storedCaptures,
    effect: renderApprovalEffect(detail.effect),
    markingUrl: routing.articleRulesUrl(state.runId),
  });
}
