import { prisma } from '../lib/prisma';
import { ScanRelevanceAgent } from './ScanRelevanceAgent';
import { recordUrlAssessment } from './recordUrlAssessment';
import { SCAN_RELEVANCE_PROMPT_HASH, SCAN_RELEVANCE_VERSION } from '../lib/mission';
import { resolveModelId } from '../factories/LLMFactory';

/**
 * THE ONE WAY A URL ENTERS THE CORPUS.
 *
 * WHY THIS EXISTS. The mission gate was built on `POST /api/forensics/scan` and
 * nowhere else, while FOUR code paths could create a `TrackedUrl`:
 *
 *   forensicsRoutes POST /scan            gated
 *   forensicsRoutes GET  /wayback         NOT gated  (via analyzePageHistory)
 *   MCP start_forensic_scan               NOT gated
 *   MCP enrich_evidence_with_history      NOT gated
 *
 * So the admission check existed on the path THE WEBSITE uses and not on the
 * paths THE RESEARCHER uses. One rule, four implementations, of which one
 * implemented it — the gate was the exception rather than the rule, and the
 * ungated majority is the interface the investigation is actually conducted
 * through.
 *
 * That is `gf-investigation-tools-must-be-mcp` inverted: a control present in
 * REST and absent from MCP is as broken as a capability present in REST and
 * absent from MCP, and harder to notice, because nothing fails.
 *
 * ENFORCED BY A SOURCE SCAN, not by this comment: `trackedUrl.upsert` and
 * `trackedUrl.create` may appear in this file and nowhere else, so a fifth
 * admission path cannot be added without either routing through here or failing
 * a test. See test/urlAdmission.test.ts.
 */

let _agent: ScanRelevanceAgent | null = null;
function agent(): ScanRelevanceAgent {
  _agent ??= new ScanRelevanceAgent();
  return _agent;
}

export type Admission =
  | {
      admitted: true;
      trackedUrlId: string;
      /** True when the URL was already tracked and no new assessment was made. */
      alreadyTracked: boolean;
    }
  | { admitted: false; verdict: 'OFF_MISSION' | 'UNCLEAR'; reason: string }
  | { admitted: false; verdict: 'UNREADABLE'; reason: string };

/**
 * Admit a URL to the corpus, or refuse it — recording the verdict either way.
 *
 * ALREADY-TRACKED URLS ARE NOT RE-ASSESSED, which preserves the behaviour the
 * HTTP route already had (`if (!existing)`). Re-gating an admitted URL would let
 * a later model draw a different conclusion and strand a corpus that has already
 * been built on it; changing an admission is a deliberate act, which is what the
 * HUMAN author on `UrlAssessment` is for.
 *
 * `fetchContent` is injected rather than imported so the caller supplies its own
 * retrieval — the HTTP route falls back from the live page to the earliest
 * archived snapshot, and that logic stays where it is instead of being duplicated
 * here.
 */
export async function admitUrl(input: {
  url: string;
  fetchContent: (url: string) => Promise<string | null>;
  submitterId?: string | undefined;
}): Promise<Admission> {
  const existing = await prisma.trackedUrl.findUnique({
    where: { url: input.url },
    select: { id: true },
  });
  if (existing) {
    return { admitted: true, trackedUrlId: existing.id, alreadyTracked: true };
  }

  const content = await input.fetchContent(input.url);
  if (content === null) {
    const reason =
      'Could not retrieve any content for this URL — neither the live page nor any ' +
      'archived snapshot. Nothing was assessed.';
    // RECORDED, NOT LEFT AS AN ABSENCE — corrected from a first version that
    // returned without writing anything.
    //
    // UNREADABLE is a verdict about the CHECK rather than about the URL, and §3
    // stores exactly that rather than omitting it: without a row, "did we try to
    // admit this URL?" is unanswerable, which is the
    // never-looked-versus-nothing-there family at the front door of the corpus.
    //
    // It stays out of OFF_MISSION because collapsing them would make an
    // unavailable check indistinguishable from a refusal — the same rule that
    // keeps UNAVAILABLE from counting as VERIFIED.
    //
    // No model provenance: no model ran. The HUMAN branch is not right either —
    // nobody judged — so this is a MODEL-authored row recording that the
    // procedure reached the point of having nothing to judge.
    await recordUrlAssessment({
      author: 'MODEL',
      url: input.url,
      verdict: 'UNREADABLE',
      reason,
      assessedAt: new Date(),
      model: resolveModelId('SCAN_RELEVANCE'),
      agentVersion: SCAN_RELEVANCE_VERSION,
      promptHash: SCAN_RELEVANCE_PROMPT_HASH,
      contentChars: 0,
      contentTruncated: false,
      ...(input.submitterId === undefined ? {} : { submitterId: input.submitterId }),
    });
    return { admitted: false, verdict: 'UNREADABLE', reason };
  }

  const relevance = await agent().checkRelevance(content, input.url);

  // RECORDED BEFORE IT IS ACTED ON, AND IN BOTH DIRECTIONS. Recording only
  // rejections makes the rejection RATE incomputable, so a filter turning away 1%
  // is indistinguishable from one turning away 90%.
  await recordUrlAssessment({
    author: 'MODEL',
    url: input.url,
    verdict: relevance.isRelevant ? 'ON_MISSION' : 'OFF_MISSION',
    reason: relevance.reason,
    assessedAt: new Date(),
    model: resolveModelId('SCAN_RELEVANCE'),
    agentVersion: SCAN_RELEVANCE_VERSION,
    promptHash: SCAN_RELEVANCE_PROMPT_HASH,
    contentChars: relevance.contentChars,
    contentTruncated: relevance.contentTruncated,
    ...(input.submitterId === undefined ? {} : { submitterId: input.submitterId }),
  });

  if (!relevance.isRelevant) {
    return { admitted: false, verdict: 'OFF_MISSION', reason: relevance.reason };
  }

  const trackedUrl = await prisma.trackedUrl.upsert({
    where: { url: input.url },
    update: { status: 'SCANNING' },
    create: { url: input.url, status: 'SCANNING' },
  });
  return { admitted: true, trackedUrlId: trackedUrl.id, alreadyTracked: false };
}
