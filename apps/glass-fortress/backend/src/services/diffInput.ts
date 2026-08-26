import { parseDiffItems, parseRawChunks } from '../lib/diffItems';
import { DIFF_INPUT_VERSION } from '../lib/diffChunking';
import { type DiffItem } from './ForensicAgent';
import { resolveDiff, type DiffLookupInput } from './diffLookup';

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
  provenance: {
    classifierVersion: string | null;
    classifierPromptHash: string | null;
    summaryVersion: string | null;
    /** null = computed under the truncating rule; raw chunks are understated. */
    diffInputVersion: string | null;
    currentDiffInputVersion: string;
    /** True when this row's chunks predate the uncapped rule and need a re-diff. */
    rawChunksMayBeTruncated: boolean;
  };
  stored: {
    isLegallySignificant: boolean;
    investigativeCategories: string[];
    aiSignificance: string;
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
    provenance: {
      classifierVersion: diff.classifierVersion,
      classifierPromptHash: diff.classifierPromptHash,
      summaryVersion: diff.summaryVersion,
      diffInputVersion: diff.diffInputVersion,
      currentDiffInputVersion: DIFF_INPUT_VERSION,
      rawChunksMayBeTruncated: diff.diffInputVersion !== DIFF_INPUT_VERSION,
    },
    stored: {
      isLegallySignificant: diff.isLegallySignificant,
      investigativeCategories: diff.investigativeCategories,
      aiSignificance: diff.aiSignificance,
    },
    explanation:
      '`raw` is the page text this diff detected as changed; `items` is what the classifier wrote ' +
      'about it. Nothing else exposes `raw` — get_forensic_timeline returns items only, so a change ' +
      'that was detected and never described is invisible there. Compare the two counts: they should ' +
      'match. `provenance.diffInputVersion` says which input rule produced this row; rows below the ' +
      'current version were computed under a chunk cap that discarded 55% of detected changes at ' +
      'write time and are understated until the diff is recomputed from its snapshots.',
  };
}
