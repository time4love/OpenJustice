import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { diffSurvivalView } from './auditDiffSurvival';
import type { DiffSurvivalView } from './auditDiffSurvival';
import { ForensicAgent, type DiffItem, type RelatedEvidenceContext } from './ForensicAgent';
import { WaybackScraper } from './WaybackScraper';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../lib/classifierVersion';
import {
  classificationInputView,
  type ClassificationInputView,
} from '../lib/classificationProvenance';
import { parseRawChunks } from '../lib/diffItems';
import { classifierInputChunks } from '../lib/diffChunking';
import { type InvestigativeCategory } from '../lib/investigativeCategories';

// ---------------------------------------------------------------------------
// Running the classifier over a stored diff WITHOUT writing anything.
//
// `forensics:reclassify` already re-runs the classifier, but it is an UPDATE:
// it overwrites the stored verdict, and overwriting destroys the only copy of
// the previous one. That makes it unusable for the question "what would the
// classifier say about this diff today?" — asking cost you the answer you had.
//
// It also cannot run against production at all (docs/gf-researcher-playbook.md,
// FINDING 100: scripts/ is outside tsconfig's include and ts-node is not
// resolvable in a deploy container), so the one environment whose stored
// classifications nobody can inspect is also the one nobody can re-run.
//
// This reads the same inputs reclassify reads, calls the same agent, and
// returns the result instead of persisting it. Nothing here writes.
//
// WHY IT REPORTS ITS OWN INPUTS
//
// Four of the classifier's five inputs are columns on the diff, fixed at scan
// time. The fifth — correlated evidence within ±60 days — is a LIVE query, so
// it differs between environments holding different vaults and changes as
// evidence is added. Two environments can therefore give the model genuinely
// different prompts for the same diff, with neither being stale or wrong.
//
// A preview that returned only a verdict would make that invisible, and a
// difference between two environments would be uninterpretable: judged the same
// prompt differently, or judged a different prompt? So the correlated set is
// part of the result, not a hidden implementation detail.
//
// WHY IT CAN SAMPLE MORE THAN ONCE
//
// The classifier is non-deterministic at temperature 0 — reclassifyDiffs.ts
// records the same page yielding 10 findings on one run and 5 on another. A
// single preview is therefore ONE SAMPLE, and one sample cannot distinguish
// "this environment classifies this diff differently" from "this classifier is
// noisy". `runs` draws repeatedly so the spread is visible rather than assumed.
// ---------------------------------------------------------------------------

/** Upper bound on `runs`. Each run is a full LLM call billed to the caller. */
export const MAX_PREVIEW_RUNS = 5;

export interface PreviewRun {
  /** 1-based. Runs are drawn sequentially, not concurrently. */
  run: number;
  deletedItems: DiffItem[];
  addedItems: DiffItem[];
  investigativeCategories: InvestigativeCategory[];
  isLegallySignificant: boolean;
  legalSignificance: string;
}

export interface PreviewStoredClassification {
  isLegallySignificant: boolean;
  investigativeCategories: InvestigativeCategory[];
  aiSignificance: string;
  deletedItemCount: number;
  addedItemCount: number;
  classifierVersion: string | null;
  /** Whether the STORED classification describes the chunks the preview re-read. */
  classificationInput: ClassificationInputView;
  classifierPromptHash: string | null;
  summaryVersion: string | null;
  /**
   * LEVEL 5, on the stored side of the comparison.
   *
   * A preview asks whether a NEWER CLASSIFIER would read this change
   * differently. If the documents refute the change itself, no classifier can
   * fix that — the fault is upstream of classification, and reclassifying a
   * CONTRADICTED diff produces a better-worded account of something that did not
   * happen.
   */
  survival: DiffSurvivalView;
}

export interface PreviewAgreement {
  /** How many of the drawn runs returned isLegallySignificant: true. */
  runsSignificant: number;
  /** True when every run agreed with every other run on significance. */
  unanimousOnSignificance: boolean;
  /** True when every run also agreed with the value currently stored. */
  agreesWithStored: boolean;
  minItems: number;
  maxItems: number;
}

export type PreviewDiffClassificationResult =
  | {
      status: 'NOT_FOUND';
      explanation: string;
    }
  | {
      status: 'AMBIGUOUS';
      explanation: string;
      candidates: { diffId: string; beforeDate: string; afterDate: string }[];
    }
  | {
      status: 'OK';
      diff: {
        diffId: string;
        url: string;
        beforeDate: string;
        afterDate: string;
      };
      input: {
        rawDeletedChunks: number;
        rawAddedChunks: number;
        /** Exactly what was supplied as CORRELATED INTERNAL EVIDENCE, in order. */
        correlatedEvidence: RelatedEvidenceContext[];
      };
      stored: PreviewStoredClassification;
      classifier: {
        version: string;
        promptHash: string;
        /**
         * Whether the stored row was produced by the prompt running now. False
         * or null means the stored verdict and the fresh one are not comparable
         * as two draws from the same distribution — they are different questions.
         */
        storedMatchesCurrentPrompt: boolean | null;
      };
      runs: PreviewRun[];
      agreement: PreviewAgreement;
      explanation: string;
    };

export interface PreviewDiffClassificationOptions {
  diffId?: string;
  url?: string;
  afterDate?: string;
  runs?: number;
}

/**
 * Re-run the forensic classifier over one stored diff and return what it says.
 *
 * Writes nothing: no diff update, no scan finding, no evidence row, and no
 * Internet Archive fetch — the raw page text was persisted at scan time.
 */
export async function previewDiffClassification(
  opts: PreviewDiffClassificationOptions,
): Promise<PreviewDiffClassificationResult> {
  const runs = Math.min(Math.max(opts.runs ?? 1, 1), MAX_PREVIEW_RUNS);

  const diff = opts.diffId
    ? await prisma.urlVersionDiff.findUnique({
        where: { id: opts.diffId },
        include: DIFF_WITH_CONTEXT,
      })
    : await resolveByUrlAndDate(opts.url, opts.afterDate);

  if (diff === null) {
    return {
      status: 'NOT_FOUND',
      explanation: opts.diffId
        ? `No diff with id ${opts.diffId}. Diff ids are per-environment: the same page change has a ` +
          'different id in each database, so an id copied from another environment will not resolve ' +
          'here. Identify the diff by url + afterDate instead.'
        : 'No diff on that url with that afterDate. get_forensic_timeline lists every diff with its ' +
          'beforeDate and afterDate.',
    };
  }

  if (Array.isArray(diff)) {
    return {
      status: 'AMBIGUOUS',
      explanation:
        `That url has ${String(diff.length)} diffs with afterDate ${opts.afterDate ?? 'unspecified'}. ` +
        'Pass diffId to choose ' +
        'one — the candidates are listed below.',
      candidates: diff.map((d) => ({
        diffId: d.id,
        beforeDate: d.beforeDate,
        afterDate: d.afterDate,
      })),
    };
  }

  // The same live query the scan and reclassify both make. Supplied rather than
  // withheld because withholding it would stop the preview predicting what the
  // real system does — see reclassifyDiffs.ts for why that trade was already
  // made and rejected there.
  const scraper = new WaybackScraper();
  const correlatedEvidence = await scraper.fetchCorrelatedEvidence(
    diff.afterDate,
    diff.trackedUrlId,
  );

  // Through the SAME selection step the scan and reclassify use. A preview that
  // selected its own input would predict a classification the real system never
  // performs, which is worse than no preview.
  const deletions = classifierInputChunks(parseRawChunks(diff.rawDeletedText));
  const additions = classifierInputChunks(parseRawChunks(diff.rawAddedText));

  const agent = new ForensicAgent();
  const results: PreviewRun[] = [];

  for (let i = 0; i < runs; i++) {
    const analysis = await agent.analyzeChange(
      deletions,
      additions,
      diff.trackedUrl.url,
      diff.afterDate,
      correlatedEvidence,
    );
    results.push({
      run: i + 1,
      deletedItems: analysis.deletedItems,
      addedItems: analysis.addedItems,
      investigativeCategories: [...analysis.investigativeCategories],
      isLegallySignificant: analysis.isLegallySignificant,
      legalSignificance: analysis.legalSignificance,
    });
  }

  const currentHash = classifierPromptHash();
  const itemCounts = results.map((r) => r.deletedItems.length + r.addedItems.length);
  const runsSignificant = results.filter((r) => r.isLegallySignificant).length;

  return {
    status: 'OK',
    diff: {
      diffId: diff.id,
      url: diff.trackedUrl.url,
      beforeDate: diff.beforeDate,
      afterDate: diff.afterDate,
    },
    input: {
      rawDeletedChunks: deletions.length,
      rawAddedChunks: additions.length,
      correlatedEvidence,
    },
    stored: {
      isLegallySignificant: diff.isLegallySignificant,
      investigativeCategories: diff.investigativeCategories as InvestigativeCategory[],
      aiSignificance: diff.aiSignificance,
      deletedItemCount: countItems(diff.deletedText),
      addedItemCount: countItems(diff.addedText),
      classifierVersion: diff.classifierVersion,
      classifierPromptHash: diff.classifierPromptHash,
      summaryVersion: diff.summaryVersion,
      survival: diffSurvivalView(diff),
      // The preview re-runs the classifier over the chunks the row holds NOW. If
      // the stored classification was made from different chunks, every
      // disagreement below is between two different questions, and reading it as
      // model variance would be reading a provenance gap as noise.
      classificationInput: classificationInputView(diff),
    },
    classifier: {
      version: CLASSIFIER_VERSION,
      promptHash: currentHash,
      storedMatchesCurrentPrompt:
        diff.classifierPromptHash === null ? null : diff.classifierPromptHash === currentHash,
    },
    runs: results,
    agreement: {
      runsSignificant,
      unanimousOnSignificance: runsSignificant === 0 || runsSignificant === results.length,
      agreesWithStored: results.every(
        (r) => r.isLegallySignificant === diff.isLegallySignificant,
      ),
      minItems: Math.min(...itemCounts),
      maxItems: Math.max(...itemCounts),
    },
    explanation:
      'Nothing was written: the stored classification on this diff is unchanged. `runs` are ' +
      'independent samples — the classifier is non-deterministic at temperature 0, so runs ' +
      'disagreeing with each other is the classifier being itself, not a fault. ' +
      '`input.correlatedEvidence` is the ONLY input not fixed at scan time; it is queried live ' +
      'from this environment’s vault, so two environments comparing this diff must compare their ' +
      'correlated sets before concluding the classifier disagreed. ' +
      '`classifier.storedMatchesCurrentPrompt: false` means the stored verdict came from a ' +
      'different prompt and is not a comparable draw; `null` means the row predates prompt ' +
      'provenance entirely.',
  };
}

/** Counts items in a deletedText/addedText column without imposing a shape on it. */
function countItems(json: string): number {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * The relations BOTH resolvers must load.
 *
 * Declared once as the payload type so the two lookups cannot drift: adding a
 * relation the renderer needs to one path and not the other is how a tool comes
 * to work when called one way and fail when called the other.
 */
const DIFF_WITH_CONTEXT = {
  trackedUrl: true,
  beforeSnapshot: { select: { textHash: true, textExtractionVersion: true } },
  afterSnapshot: { select: { textHash: true, textExtractionVersion: true } },
} as const;

type DiffWithUrl = Prisma.UrlVersionDiffGetPayload<{ include: typeof DIFF_WITH_CONTEXT }>;

/**
 * Resolve a diff by the pair that means the same thing in every environment.
 *
 * Diff ids are database-local. A researcher comparing two deployments has one
 * page change and two different uuids for it, so requiring an id would make the
 * cross-environment comparison — the reason this tool exists — start with a
 * manual lookup in each environment.
 *
 * Returns an array when the pair is not unique, so the caller can report the
 * ambiguity rather than silently classifying whichever row sorted first.
 */
async function resolveByUrlAndDate(
  url: string | undefined,
  afterDate: string | undefined,
): Promise<DiffWithUrl | DiffWithUrl[] | null> {
  if (url === undefined || afterDate === undefined) return null;

  const matches = await prisma.urlVersionDiff.findMany({
    where: { trackedUrl: { url }, afterDate },
    include: DIFF_WITH_CONTEXT,
    orderBy: { beforeDate: 'asc' },
  });

  if (matches.length === 0) return null;
  if (matches.length > 1) return matches;
  return matches[0] ?? null;
}
