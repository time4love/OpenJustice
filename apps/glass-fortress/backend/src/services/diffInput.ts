import { parseDiffItems, parseRawChunks } from '../lib/diffItems';
import { DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { resolveModelId } from '../factories/LLMFactory';
import { computeDiffCoverage, type UncoveredChunk } from '../lib/diffCoverage';
import { type DiffItem } from './ForensicAgent';
import { resolveDiff, type DiffLookupInput } from './diffLookup';
import { diffSurvivalView, type DiffSurvivalView } from './auditDiffSurvival';
import {
  classificationInputView,
  type ClassificationInputView,
} from '../lib/classificationProvenance';

// ---------------------------------------------------------------------------
// What the classifier was GIVEN, beside what it produced.
//
// Every research tool showed classifier OUTPUT. get_forensic_timeline returns
// deletedText/addedText — the items. Nothing exposed rawDeletedText/
// rawAddedText, the actual page text the model was handed, even though both
// columns have been persisted at scan time since the beginning.
//
// The raw chunks were reachable over REST (forensicsRoutes, evidenceRoutes) and
// through no MCP tool at all, so an investigation into why a diff looked thin
// could not be run by the person doing the research. It took a curl loop against
// one environment's public endpoint — and the other environment's equivalent is
// behind the staging access gate, so the comparison was not reproducible there
// at any price.
//
// No LLM, no archive fetch, no write. Two stored columns and a set comparison.
// ---------------------------------------------------------------------------

export interface DiffInputResult {
  status: 'OK';
  diff: {
    diffId: string;
    url: string;
    beforeDate: string;
    afterDate: string;
  };
  /** The classifier's INPUT, verbatim, exactly as persisted at scan time. */
  raw: {
    deletedChunks: string[];
    addedChunks: string[];
  };
  /** The classifier's OUTPUT for the same diff. */
  items: {
    deleted: DiffItem[];
    added: DiffItem[];
  };
  counts: {
    rawChunkCount: number;
    itemCount: number;
  };
  /**
   * How much of the input this row's items describe. DERIVED on every read from
   * the two stored column pairs, so it answers for rows written long before the
   * check existed and can never be stale.
   */
  coverage: {
    coveredChunks: number;
    chunkCount: number;
    chunkPercent: number;
    charPercent: number;
    complete: boolean;
    /** Text detected as changed that no item describes. */
    uncoveredChunks: UncoveredChunk[];
  };
  provenance: {
    classifierVersion: string | null;
    classifierPromptHash: string | null;
    summaryVersion: string | null;
    /** `provider:model` that judged this row; null predates model provenance. */
    classifierModel: string | null;
    currentClassifierModel: string;
    /** null means a single draw stored as though it were a measurement. */
    classifierDraws: number | null;
    /** null = computed under the truncating rule; raw chunks are understated. */
    diffInputVersion: string | null;
    currentDiffInputVersion: string;
    /** True when this row's chunks predate the uncapped rule and need a re-diff. */
    rawChunksMayBeTruncated: boolean;
    /** Whether the stored classification describes the chunks the row now holds. */
    classificationInput: ClassificationInputView;
  };
  stored: {
    isLegallySignificant: boolean;
    investigativeCategories: string[];
    aiSignificance: string;
    survival: DiffSurvivalView;
  };
  explanation: string;
}

export type GetDiffInputResult =
  | DiffInputResult
  | { status: 'NOT_FOUND'; explanation: string }
  | {
      status: 'AMBIGUOUS';
      explanation: string;
      candidates: { diffId: string; beforeDate: string; afterDate: string }[];
    };

export async function getDiffInput(input: DiffLookupInput): Promise<GetDiffInputResult> {
  const found = await resolveDiff(input);
  if (found.status !== 'FOUND') return found;
  const diff = found.diff;

  const deletedChunks = parseRawChunks(diff.rawDeletedText);
  const addedChunks = parseRawChunks(diff.rawAddedText);
  const deletedItems = parseDiffItems(diff.deletedText);
  const addedItems = parseDiffItems(diff.addedText);

  const cov = computeDiffCoverage({
    rawDeletedChunks: deletedChunks,
    rawAddedChunks: addedChunks,
    deletedItems,
    addedItems,
  });

  return {
    status: 'OK',
    diff: {
      diffId: diff.id,
      url: diff.trackedUrl.url,
      beforeDate: diff.beforeDate,
      afterDate: diff.afterDate,
    },
    raw: { deletedChunks, addedChunks },
    items: { deleted: deletedItems, added: addedItems },
    counts: {
      rawChunkCount: deletedChunks.length + addedChunks.length,
      itemCount: deletedItems.length + addedItems.length,
    },
    coverage: {
      coveredChunks: cov.coveredChunks,
      chunkCount: cov.chunkCount,
      chunkPercent: Math.round(cov.chunkRatio * 100),
      charPercent: Math.round(cov.charRatio * 100),
      complete: cov.complete,
      uncoveredChunks: cov.uncoveredChunks,
    },
    provenance: {
      classifierVersion: diff.classifierVersion,
      classifierPromptHash: diff.classifierPromptHash,
      summaryVersion: diff.summaryVersion,
      classifierModel: diff.classifierModel,
      currentClassifierModel: resolveModelId('FORENSIC'),
      classifierDraws: diff.classifierDraws,
      diffInputVersion: diff.diffInputVersion,
      currentDiffInputVersion: DIFF_INPUT_VERSION,
      rawChunksMayBeTruncated: diff.diffInputVersion !== DIFF_INPUT_VERSION,
      // WHICH CHUNKS THE CLASSIFIER ACTUALLY READ. `diffInputVersion` above is
      // about the row; this is about the classification, and they move
      // independently — which is the whole finding. `raw` on this tool is the
      // text as it stands NOW, so without this a reader compares the stored
      // items against chunks the classifier never saw and reads the difference
      // as a coverage gap.
      classificationInput: classificationInputView(diff),
    },
    stored: {
      isLegallySignificant: diff.isLegallySignificant,
      investigativeCategories: diff.investigativeCategories,
      aiSignificance: diff.aiSignificance,
      // LEVEL 5, ON THE TOOL THAT SHOWS THE CHUNKS THE CHECK READS. `raw` above
      // is exactly the text the survival check evaluates, so this is the one
      // surface where a reader can see the verdict AND the evidence for it
      // together — and the timeline's own CONTRADICTED warning sends them here.
      survival: diffSurvivalView(diff),
    },
    explanation:
      '`raw` is the page text this diff detected as changed; `items` is what the classifier wrote ' +
      'about it. Nothing else exposes `raw` — get_forensic_timeline returns items only, so a change ' +
      'that was detected and never described is invisible there. Compare the two counts: they should ' +
      '`coverage` is measured by TEXT CONTAINMENT, not by counting items: the classifier MERGES ' +
      'consecutive chunks into single passages, so far fewer items than chunks is normal and not a ' +
      'loss. `coverage.uncoveredChunks` is the real gap — text detected as changed that no item ' +
      'describes. `provenance.classifierDraws` is null for rows written before best-of-N, i.e. a ' +
      'single draw of a non-deterministic process stored as though it were a measurement. ' +
      '`provenance.diffInputVersion` says which input rule produced this row; rows below the ' +
      'current version were computed under a chunk cap that discarded 55% of detected changes at ' +
      'write time and are understated until the diff is recomputed from its snapshots.',
  };
}
