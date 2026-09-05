import { prisma } from '../lib/prisma';
import { CLASSIFIER_VERSION, classifierPromptHash } from '../lib/classifierVersion';
import type { ForensicAgent } from './ForensicAgent';
import { classifierDiffOf, gate5, type Classify, type ClassifierDiff } from '../walk/gates';

// ---------------------------------------------------------------------------
// GATE 5'S MEASUREMENT INSTRUMENT — refactor step 4, part 1 of the measurement
// doc (docs/gf-refactor-plan.md §6 item 4; ruled 2026-09-05). The premise the
// walk rests on is that a NOT-EDITORIAL verdict is the symptom of furniture
// entering `text`; this measures the classifier's editorial answer against a
// human's, on twenty stored diffs, as a confusion table. No rate, no threshold:
// four counts, two of them named for what they cost.
//
// TWO MODES, so the spend follows the labels. `--sample` reads the corpus and
// prints, for each of the twenty, what Gate 5 hands the classifier and NOTHING
// else — not the stored verdict, not the categories, not whether a researcher
// promoted it: a promotion flag beside the chunks says "a human already found
// this significant" and pulls the label. `--measure` re-draws the same sample
// from the seed, refuses unless the labels name exactly those ids, and runs
// THE GATE — `gate5` with `classify` built as the walk builds it — over each.
//
// THE SAMPLE: every diff a researcher promoted to evidence, plus the rest of
// twenty drawn by a seeded Fisher–Yates over the remaining ids SORTED first, so
// the database's row order cannot move it. The seed is recorded in the doc.
//
// READS UrlVersionDiff, its Evidence link and the two snapshots' `text` — reused
// state, no retired table (R-A). WRITES NOTHING. `measureEraDetectors` is the
// ancestor and is retired once the doc exists.
// ---------------------------------------------------------------------------

export const SAMPLE_SIZE = 20;

export interface SampleCandidate {
  diffId: string;
  promoted: boolean;
}

/** mulberry32 — a small seeded generator, enough to make a draw reproducible from one integer. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The twenty: every promoted diff, then the remainder drawn at random from the
 * rest — over ids sorted first, by a generator seeded with `seed`. Throws under
 * twenty candidates, and when the promoted diffs alone exceed twenty: either is
 * a different measurement from the one the doc describes.
 */
export function drawSample(candidates: readonly SampleCandidate[], seed: number): SampleCandidate[] {
  if (candidates.length < SAMPLE_SIZE) {
    throw new Error(`The corpus holds ${String(candidates.length)} diffs; this measurement needs ${String(SAMPLE_SIZE)}.`);
  }
  const promoted = [...candidates].filter((c) => c.promoted).sort((a, b) => a.diffId.localeCompare(b.diffId));
  if (promoted.length > SAMPLE_SIZE) {
    throw new Error(`${String(promoted.length)} promoted diffs exceed the sample of ${String(SAMPLE_SIZE)}; the instrument was designed for fewer.`);
  }
  const rest = [...candidates].filter((c) => !c.promoted).sort((a, b) => a.diffId.localeCompare(b.diffId));
  const random = seeded(seed);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = rest.at(i);
    const b = rest.at(j);
    if (a !== undefined && b !== undefined) {
      rest[i] = b;
      rest[j] = a;
    }
  }
  return [...promoted, ...rest.slice(0, SAMPLE_SIZE - promoted.length)];
}

/** `<diffId>=y,<diffId>=n,…` → the human's editorial label per id; exactly `ids`, nothing more or less. */
export function parseLabels(labels: string, ids: readonly string[]): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const pair of labels.split(',').map((p) => p.trim()).filter((p) => p.length > 0)) {
    const parts = pair.split('=');
    const id = parts.at(0);
    const value = parts.at(1);
    if (parts.length !== 2 || id === undefined || value === undefined || !['y', 'n'].includes(value)) {
      throw new Error(`Label "${pair}" is not <diffId>=y or <diffId>=n.`);
    }
    if (!ids.includes(id)) throw new Error(`Label names ${id}, which is not in the sample.`);
    out.set(id, value === 'y');
  }
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length > 0) throw new Error(`No label for ${missing.join(', ')}.`);
  return out;
}

export interface Judged {
  diffId: string;
  /** The researcher's answer: is this diff editorial? */
  human: boolean;
  /** The classifier's answer, through Gate 5. */
  classifier: boolean;
}

/** The four cells. `falseStop` is the premise's cost — a stop on a real edit; `missed` is furniture Gate 5 did not see. */
export interface Confusion {
  agreedEditorial: number;
  falseStop: number;
  missed: number;
  agreedNotEditorial: number;
}

export function foldConfusion(judged: readonly Judged[]): Confusion {
  const table: Confusion = { agreedEditorial: 0, falseStop: 0, missed: 0, agreedNotEditorial: 0 };
  for (const j of judged) {
    if (j.human && j.classifier) table.agreedEditorial += 1;
    else if (j.human && !j.classifier) table.falseStop += 1;
    else if (!j.human && j.classifier) table.missed += 1;
    else table.agreedNotEditorial += 1;
  }
  return table;
}

/** One sampled diff with what Gate 5 hands the classifier for it. */
export interface SampledDiff extends SampleCandidate {
  url: string;
  beforeDate: string;
  afterDate: string;
  beforeText: string;
  afterText: string;
  /** `classifierDiffOf(beforeText, afterText)` — printed for labelling; the gate recomputes the same from the texts. */
  input: ClassifierDiff;
}

/** Every diff in the corpus as a candidate: promoted when an Evidence row names it. */
export async function loadCandidates(): Promise<SampleCandidate[]> {
  const diffs = await prisma.urlVersionDiff.findMany({ select: { id: true, evidence: { select: { id: true } } } });
  return diffs.map((d) => ({ diffId: d.id, promoted: d.evidence.length > 0 }));
}

/** The sampled diffs with Gate 5's input recomputed from the two snapshots' text — what the walk would hand the model. */
export async function loadSample(sample: readonly SampleCandidate[]): Promise<SampledDiff[]> {
  const rows = await prisma.urlVersionDiff.findMany({
    where: { id: { in: sample.map((s) => s.diffId) } },
    select: {
      id: true,
      beforeDate: true,
      afterDate: true,
      trackedUrl: { select: { url: true } },
      beforeSnapshot: { select: { text: true } },
      afterSnapshot: { select: { text: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return sample.map((s) => {
    const row = byId.get(s.diffId);
    if (row === undefined) throw new Error(`Diff ${s.diffId} was sampled and is no longer in the corpus.`);
    return {
      ...s,
      url: row.trackedUrl.url,
      beforeDate: row.beforeDate,
      afterDate: row.afterDate,
      beforeText: row.beforeSnapshot.text,
      afterText: row.afterSnapshot.text,
      input: classifierDiffOf(row.beforeSnapshot.text, row.afterSnapshot.text),
    };
  });
}

export interface Verdict extends Judged {
  reason: string;
}

export interface Measurement {
  verdicts: Verdict[];
  table: Confusion;
  /** What judged the sample. Keyed `classifier`/`prompt`/`model`, NOT by the column names: the provenance scan (test/classificationProvenance) reads a line assigning the version constant under the column's name as a WRITER of a classification, and this is a printout. */
  stamp: { classifier: string; prompt: string; model: string };
}

/**
 * THE GATE, run over each sampled diff with the classifier the walk builds:
 * `analyzeChange`'s editorial answer, no correlated evidence. One paid call per
 * diff (1–3 draws each). `onVerdict` lets the script print as it goes, so a
 * run that dies midway leaves its answers on the screen. The agent is the
 * caller's: constructed once, its model named before the spend.
 */
/** The two members of the reused classifier the measurement uses — injected, so the script names the model BEFORE the first paid call and a test can run the loop with a fake. */
export type ClassifyingAgent = Pick<ForensicAgent, 'analyzeChange' | 'modelId'>;

export async function measureGate5(
  sample: readonly SampledDiff[],
  labels: ReadonlyMap<string, boolean>,
  agent: ClassifyingAgent,
  onVerdict: (verdict: Verdict) => void = () => undefined,
): Promise<Measurement> {
  const verdicts: Verdict[] = [];
  for (const diff of sample) {
    const human = labels.get(diff.diffId);
    if (human === undefined) throw new Error(`No label for ${diff.diffId}.`);
    // The classifier exactly as the walk builds it (scanCaptures.ts), with the
    // reason kept aside: a quiet gate is an editorial verdict and carries no
    // material, and the doc wants the model's one sentence either way.
    let reason = '';
    const classify: Classify = async (input) => {
      const out = await agent.analyzeChange(input.removed, input.added, diff.url, diff.afterDate, []);
      reason = out.editorialReason;
      return { editorial: out.editorial, reason: out.editorialReason };
    };
    const fired = await gate5(diff.beforeText, diff.afterText, classify);
    const verdict: Verdict = { diffId: diff.diffId, human, classifier: fired === null, reason };
    verdicts.push(verdict);
    onVerdict(verdict);
  }
  return {
    verdicts,
    table: foldConfusion(verdicts),
    stamp: { classifier: CLASSIFIER_VERSION, prompt: classifierPromptHash(), model: agent.modelId },
  };
}
