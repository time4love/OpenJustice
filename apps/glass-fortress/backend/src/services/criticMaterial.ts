import type { ThesisGapDecision } from '@prisma/client';
import { changeSpans } from './claimTrajectory';
import { pairName, recordsByName, type ResolvedRecord } from './corpusReads';
import { passagesCiting } from './debatePassage';
import type { ContentVersionProvenance, RecordContent } from './evidencePredicates';
import { currentContentOf } from './framingRounds';
import { CRITIC_PROMPT_VERSION, fingerprint, gapList, type GapEntry } from './thesisPredicates';
import type { CriticRecord, CriticTrajectory, CritiqueInput } from './thesisCritic';
import type { DraftInput, DraftRecord } from './foiaDrafter';
import { loadThesisRows, mentionsOf, versionOf, type ThesisRows } from './thesisRows';
import { resolveTrajectoryCitations, TRAJECTORY_EXTRACTION_CAVEAT } from './trajectoryCitation';

// ---------------------------------------------------------------------------
// WHAT AN ANALYSIS IS ABOUT, AND WHAT THE CRITIC IS HANDED — docs/gf-thesis-flows.md T4 :586–:590, A3 :1376–:1383.
//
// ONE LOADER OF HEAD'S FINGERPRINT. `run_analysis` refuses ANALYSIS_CURRENT on it and `get_thesis_context` reports
// CURRENT / STALE / NONE on it: two loaders would be two fingerprints free to disagree about the same version, and the
// refusal and the read would then tell a researcher different things (R48 sketch §a).
//
// NOT `services/thesisAnalysis` — that path is RETIRED (`test/walk/retiredNames.test.ts` RETIRED_THESIS_MODULES).
// IT NO LONGER HOLDS A CLIENT AT ALL, and the line that said it did is corrected rather than left standing: every
// read this module made moved into `services/thesisRows` (the plan's :779 clause), so `headFrom` and `fingerprintOf`
// are pure and `headFingerprint` is the one caller that awaits. The critic (`services/thesisCritic.ts`) still holds a
// model and no client.
// ---------------------------------------------------------------------------

/** The head version and what FINGERPRINT(head) is computed over — loaded once. */
export interface LoadedHead {
  thesisId: string;
  version: { id: string; text: string; claim: string; contentHash: string };
  /** Every EVIDENCE citation, resolved to the record the corpus holds for its name. */
  records: { name: string; record: ResolvedRecord }[];
  trajectoryIds: string[];
  decisions: ThesisGapDecision[];
  list: GapEntry[];
}

export type HeadFingerprint =
  | { defined: true; head: LoadedHead; fingerprint: string }
  | { defined: false; head: LoadedHead; name: string; named: string };

/** A resolved record as CURRENT reads it — a capture's text version, or a pair and its versions. */
function contentOf(record: ResolvedRecord): RecordContent<ContentVersionProvenance> {
  if (record.capture !== null) return { kind: 'CAPTURE', capture: record.capture };
  if (record.diff === null) {
    throw new Error(`criticMaterial: ${record.fileHash} resolved to neither a capture nor a diff (evidence A1).`);
  }
  return { kind: 'DIFF', before: record.diff.before, after: record.diff.after, versions: record.diff.versions };
}

/**
 * THE HEAD, FROM ROWS ALREADY LOADED — a PURE function, no query of its own.
 *
 * It is `loadHead`'s body with its four reads removed: the version is a lookup in `rows.versions`, the mentions
 * a filter over `rows.mentions`, the decisions `rows.decisions`, and the records come from the citation
 * resolver's own resolution (`publishedThesis.citationsFrom`) rather than a second walk of the corpus. Every
 * loud guard below is the one `loadHead` had, raised on the same name in the same order.
 *
 * WHY THE RECORDS ARRIVE RATHER THAN BEING RESOLVED HERE. `resolveRecordByName(x)` IS `recordsByName([x])`
 * (`corpusReads.ts` :511–:512) and the plural walks the corpus; the gated read resolved the SAME names a few
 * lines earlier for the citations. Resolving them twice was one of the duplicate passes
 * `docs/gf-thesis-read-cost-2026-09-22.md` measured. A `ResolvedRecord` is an OBSERVATION and may be shared
 * (evidence A3 :1060–:1063); every predicate over it is still CALLED (thesis A3 :1413–:1414).
 */
export function headFrom(rows: ThesisRows, headVersionId: string, records: ReadonlyMap<string, ResolvedRecord>): LoadedHead {
  const found = versionOf(rows, headVersionId);
  if (found === null) {
    throw new Error(`criticMaterial: thesis ${rows.thesis.id} points at head ${headVersionId}, which does not exist.`);
  }
  const version = { id: found.id, text: found.text, claim: found.claim, contentHash: found.contentHash };
  const mentions = mentionsOf(rows, headVersionId);

  const evidenceNames = mentions.filter((mention) => mention.kind === 'EVIDENCE').map((mention) => mention.name);
  const resolvedRecords: LoadedHead['records'] = evidenceNames.map((name) => {
    const record = records.get(name) ?? null;
    // A LOUD GUARD (R48 D2), UNCHANGED: the version write resolved this name when it pinned it, and nothing is
    // deleted after the rebuild — a citation whose record the corpus no longer holds is a malformed state, not
    // an answer.
    if (record === null) {
      throw new Error(`criticMaterial: head ${headVersionId} cites #ev_${name}, which no record of the corpus resolves.`);
    }
    return { name, record };
  });

  return {
    thesisId: rows.thesis.id,
    version,
    records: resolvedRecords,
    trajectoryIds: mentions.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name),
    decisions: rows.decisions,
    list: gapList(rows.decisions, rows.thesis.id, mentions.map((m) => m.name)),
  };
}

/** FINGERPRINT(HEAD) over a head already built — PURE, so the read and the refusal compute it the same way. */
export function fingerprintOf(head: LoadedHead): HeadFingerprint {
  const f = fingerprint({
    contentHash: head.version.contentHash,
    evidence: head.records.map(({ name, record }) => ({ name, record: contentOf(record) })),
    trajectoryIds: head.trajectoryIds,
    gaps: head.list.map((entry) => ({ gapId: entry.gapId, decision: entry.readsAs })),
    promptVersion: CRITIC_PROMPT_VERSION,
  });
  if (f.defined) return { defined: true, head, fingerprint: f.fingerprint };

  const diff = head.records.find((r) => r.name === f.name)?.record;
  const named =
    diff !== undefined && diff.diff !== null
      ? `the diff ${diff.page.url} ${pairName(diff.diff)} (#ev_${f.name})`
      : `#ev_${f.name}`;
  return { defined: false, head, name: f.name, named };
}

/**
 * FINGERPRINT(HEAD) — CALLED, over the head's citations and the gap list at what each gap READS AS (R48 §c1).
 * Undefined names the diff BOTH ways, as A4 :1423 asks: its record name, and its page with the pair.
 *
 * IT KEEPS ITS SIGNATURE AND ITS FOUR CALLERS, and that is the point rather than a convenience.
 * `criticMaterial.ts` :16–:18 makes this the ONE loader `run_analysis` refuses ANALYSIS_CURRENT on and
 * `get_thesis_context` reports CURRENT / STALE / NONE on — two loaders would be two fingerprints free to
 * disagree about the same version. The rebuild satisfies that clause LITERALLY: the read and the refusal run
 * THIS function, over the same rows, through the same two pure steps. A slimmer loader for the writers plus a
 * parity test was considered and REJECTED — a second loader is exactly what the clause forbids.
 *
 * THE THREE WRITERS PAY MORE READS, AND IT IS THE RIGHT TRADE. `runAnalysis.ts` :72,
 * `draftFoiaRequest.ts` :70 and `publicationEvaluation.ts` :113 now load every row of the thesis (fourteen
 * reads in three waves) where they loaded four — against a paid LLM call, which is what each of them is
 * about to make.
 */
export async function headFingerprint(thesisId: string, headVersionId: string): Promise<HeadFingerprint> {
  return fingerprintOf(await loadHead(thesisId, headVersionId));
}

/**
 * The head, built from the thesis's rows — the two functions above with the ONE load in front of them.
 *
 * It keeps `loadHead`'s name and signature (its callers are `headFingerprint` and the publication assessor's
 * acceptance case), and it is not a second loader: `loadThesisRows` is the one query and `headFrom` the one
 * composition, which is what `criticMaterial.ts` :16–:18 requires of the read and the refusal alike.
 */
export async function loadHead(thesisId: string, headVersionId: string): Promise<LoadedHead> {
  const rows = await loadThesisRows(thesisId);
  if (rows === null) {
    throw new Error(`criticMaterial: no thesis ${thesisId}.`);
  }
  return headFrom(rows, headVersionId, await recordsForHead(rows, headVersionId));
}

/**
 * THE HEAD'S RECORDS — the ONE read `headFrom` cannot be given for free by a caller that has no citations.
 *
 * THE GATED READ DOES NOT CALL THIS: it hands `citationsFrom`'s own `records`, which resolved the same names a
 * moment earlier. The writers have no citations to share, so they resolve here — the same `recordsByName` over
 * the same names, which is why the two paths cannot produce different fingerprints.
 *
 * IT IS DELIBERATELY NOT `citationsFrom`, and this is a declared departure from the proposal in
 * `handoffs/R70-fable-design-source-2026-09-22.md` §1, which routed `headFingerprint` through it. FINGERPRINT(v)
 * (thesis A3 :1376–:1378) is computed over the contentHash, each record's CURRENT content, the trajectory ids
 * and the gap list — it reads no verdict. `citationsFrom` also computes VERIFIED, FLAGGED and the held texts,
 * which is five reads the fingerprint never looks at and three predicates evaluated for nothing.
 */
async function recordsForHead(rows: ThesisRows, headVersionId: string): Promise<Map<string, ResolvedRecord>> {
  const names = mentionsOf(rows, headVersionId)
    .filter((mention) => mention.kind === 'EVIDENCE')
    .map((mention) => mention.name);
  const resolved = await recordsByName(names);
  const records = new Map<string, ResolvedRecord>();
  for (const [name, record] of resolved) {
    if (record !== null) records.set(name, record);
  }
  return records;
}

/**
 * What the CRITIC is handed (T4 :589–:590): the text VERBATIM · each cited record's CURRENT computed content, labelled
 * `[n]` with its name beside · each trajectory labelled `[T<n>·<first 8 of its id>]` with its presence history as
 * BOUNDED SPANS and the extraction caveat · the gap list with each decision in force. Never a summary.
 */
export async function critiqueMaterial(head: LoadedHead): Promise<CritiqueInput> {
  const records: CriticRecord[] = await labelledRecords(head);

  const { resolved } = await resolveTrajectoryCitations(head.trajectoryIds);
  const trajectories = head.trajectoryIds.map((id, index): CriticTrajectory => {
    const label = `[T${String(index + 1)}·${id.slice(0, 8)}]`;
    const t = resolved.find((r) => r.id === id);
    // A CITED ID NO PASS HOLDS IS SAID, NEVER DROPPED (R48 D3): TRAJECTORIES_RESOLVE is the gate's check, not a refusal
    // of this tool's.
    if (t === undefined) return { label, id, resolves: false };
    return {
      label,
      id,
      resolves: true,
      url: t.url,
      claimText: t.claimText,
      finalState: t.finalState,
      spans: changeSpans(t.observations).map((s) => ({
        date: s.snapshotDate,
        present: s.present,
        captures: s.captures,
        days: s.days,
        openEnded: s.openEnded,
      })),
      caveat: TRAJECTORY_EXTRACTION_CAVEAT,
    };
  });

  return {
    claim: head.version.claim,
    text: head.version.text,
    records,
    trajectories,
    gaps: head.list.map((entry) => ({
      gapId: entry.gapId,
      description: entry.inForce.description,
      readsAs: entry.readsAs,
      reason: entry.inForce.reason,
    })),
  };
}

/** HEAD's cited records, each labelled `[n]` with its name and its CURRENT computed content — the critic's and the drafter's. */
async function labelledRecords(head: LoadedHead): Promise<CriticRecord[]> {
  const records: CriticRecord[] = [];
  for (const [index, { name, record }] of head.records.entries()) {
    const content =
      record.capture !== null
        ? await currentContentOf(record.page, { kind: 'CAPTURE', capture: record.capture })
        : record.diff !== null
          ? await currentContentOf(record.page, { kind: 'DIFF', diff: record.diff })
          : null;
    if (content === null || content === 'AWAITING_DERIVATION') {
      // A LOUD GUARD: the version write resolved and pinned this record; a cited record with no content now is a
      // defective load, never content handed to a model as though it were all of it.
      throw new Error(`criticMaterial: #ev_${name} is cited by the head and has no current computed content.`);
    }
    records.push({ label: `[${String(index + 1)}]`, name, ...content });
  }
  return records;
}

/**
 * What the DRAFTER is handed (T4 :666–:668): the gap · the claim · the provision · every EVIDENCE citation of HEAD,
 * labelled, with its CURRENT computed content and the paragraphs of HEAD's text that carry its token — `passagesCiting`,
 * CALLED — "so the request carries the proof that the change happened". Which citations a gap CONCERNS is not
 * mechanical; the drafter is handed all of them and names what the request rests on by label.
 */
export async function draftMaterial(
  head: LoadedHead,
  provision: string | null,
  gap: { gapId: string; description: string; readsAs: string },
): Promise<DraftInput> {
  const records = (await labelledRecords(head)).map(
    (record): DraftRecord => ({ ...record, passages: passagesCiting({ id: head.version.id, text: head.version.text }, record.name) }),
  );
  return { claim: head.version.claim, provision, gap, records };
}
