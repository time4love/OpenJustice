import { z } from 'zod';
import {
  captureName,
  diffName,
  loadCaptures,
  loadDiffs,
  loadEvidenceLinkage,
  loadPage,
  opinionOf,
  pairName,
  type EvidenceLinkage,
  type Opinion,
} from '../../services/corpusReads';
import {
  currentVersionOf,
  narrowed,
  storedAttributionFor,
} from '../../services/evidencePredicates';
import { answer, openPage, shared, type Refusal } from './evidenceRefusals';

// ---------------------------------------------------------------------------
// list_findings({ url }) — PUBLIC — docs/gf-evidence-flows.md A4.
//
// THE PAGE'S TIMELINE, AND IT IS THE SAME LIST FOR EVERYONE. §4: "The triage
// list IS the page's public timeline. `list_findings` is `get_forensic_timeline`
// repaired — the pair by timestamps, the current version, the opinion labelled,
// linkage to published citations — and a researcher reads the same list an
// outsider does, with no parameter and no identity. What a researcher adds is a
// thesis in view, and that lives on the thesis side, not on the read."
//
// ORDERED BY DATE, ALWAYS. "Significance is a model's opinion and may be a
// FILTER the researcher applies by name … never the default order and never a
// hidden threshold. A list that sorts by an opinion presents the opinion as the
// ranking, which is the sentence Level 8 forbids."
//
// TWO REGISTERS, NEVER MIXED. `current.chunks` is computed from the two texts;
// `opinion` is a model's draw about them, in its own object, null when nothing
// classified this derivation. `test/opinionsNotFacts.test.ts` holds the shape as
// a property over the keys, so a field added to the opinion tomorrow cannot
// arrive at the top level of an entry.
//
// WHAT THIS READ REPLACED, AND WHY IT MATTERS THAT IT REFUSES BY NAME. Its
// predecessor read the legacy diff columns the walk had stopped writing and
// answered "nothing has been looked at" in the shape of a real negative, with no
// code and no way for the reader to tell (docs/gf-walk-corrective-pass-2026-09-08.md).
// Here every absence is named: `current: null` with `awaitingDerivation: true`,
// `opinion: null`, `evidence: null`, `attributed: null`.
// ---------------------------------------------------------------------------

export const listFindingsSchema = {
  url: z.url().describe('The page — exact URL, as it was surveyed'),
};

interface AnchorReport {
  documentHash: string;
  /**
   * THREE VALUES, THREE FACTS. true — the registry holds this capture's
   * `documentHash` and our registrar submitted it. false — it does not, or
   * someone else did. null — no verdict was ever stored under the current rule,
   * which is neither of those and must never be read as "no".
   */
  attributed: boolean | null;
}

interface CaptureEntry {
  capture: string;
  snapshotDate: string;
  fileHash: string;
  textHash: string;
  textExtractionVersion: string;
  anchor: AnchorReport;
  evidence: EvidenceLinkage | null;
}

interface DiffEntry {
  before: string;
  after: string;
  fileHash: string;
  current: { contentVersionHash: string; chunks: unknown } | null;
  awaitingDerivation: boolean;
  opinion: Opinion | null;
  narrowed: boolean;
  evidence: EvidenceLinkage | null;
}

interface Findings {
  page: { url: string; public: boolean };
  captures: CaptureEntry[];
  diffs: DiffEntry[];
}

export async function listFindingsHandler(input: { url: string }): Promise<string> {
  return answer(async (): Promise<Findings | Refusal> => {
    const page = await loadPage(input.url);
    if (page === null) return shared.notSurveyed(input.url);

    const access = await openPage(page);
    if (access.refused !== null) return access.refused;

    const captures = await loadCaptures(page.id);
    const diffs = await loadDiffs(page.id);

    // ONE query for every capture's stored anchor verdict, and NO chain call:
    // a public timeline that asked the chain once per capture would be
    // unbounded work for an anonymous caller. `check_on_chain_status` is where
    // the chain is asked, bounded by one record.
    const attribution = await storedAttributionFor(captures.map((c) => c.id));

    const names = [
      ...captures.map((c) => captureName(page, c)),
      ...diffs.map((d) => diffName(page, d)),
    ];
    const linkage = await loadEvidenceLinkage(names);

    // The ACQUIRED captures are what NARROWED reads: a capture between two
    // endpoints narrows the pair only if the corpus holds its text (§7).
    const acquired = captures.map((c) => c.capture);

    return {
      page: { url: page.url, public: access.public },
      captures: captures.map((capture) => {
        const fileHash = captureName(page, capture);
        return {
          capture: capture.capture,
          snapshotDate: capture.snapshotDate,
          fileHash,
          textHash: capture.textHash,
          textExtractionVersion: capture.textExtractionVersion,
          anchor: {
            documentHash: capture.documentHash,
            attributed: attribution.get(capture.id)?.attributed ?? null,
          },
          evidence: linkage.get(fileHash) ?? null,
        };
      }),
      diffs: diffs.map((diff) => {
        const fileHash = diffName(page, diff);
        const current = currentVersionOf({
          kind: 'DIFF',
          before: diff.before,
          after: diff.after,
          versions: diff.versions,
        });
        return {
          before: diff.before.capture,
          after: diff.after.capture,
          fileHash,
          current: current.defined
            ? {
                contentVersionHash: current.contentVersionHash,
                chunks: current.kind === 'DIFF' ? current.version.chunks : null,
              }
            : null,
          awaitingDerivation: !current.defined,
          opinion:
            current.defined && current.kind === 'DIFF'
              ? opinionOf(current.version.classification, pairName(diff))
              : null,
          narrowed: narrowed({ before: diff.before.capture, after: diff.after.capture }, acquired),
          evidence: linkage.get(fileHash) ?? null,
        };
      }),
    };
  });
}
