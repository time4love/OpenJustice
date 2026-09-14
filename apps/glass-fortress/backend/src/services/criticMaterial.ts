import type { ThesisGapDecision } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { changeSpans } from './claimTrajectory';
import { pairName, resolveRecordByName, type ResolvedRecord } from './corpusReads';
import { passagesCiting } from './debatePassage';
import type { ContentVersionProvenance, RecordContent } from './evidencePredicates';
import { currentContentOf } from './framingRounds';
import { CRITIC_PROMPT_VERSION, fingerprint, gapList, type GapEntry } from './thesisPredicates';
import type { CriticRecord, CriticTrajectory, CritiqueInput } from './thesisCritic';
import type { DraftInput, DraftRecord } from './foiaDrafter';
import { resolveTrajectoryCitations, TRAJECTORY_EXTRACTION_CAVEAT } from './trajectoryCitation';

// ---------------------------------------------------------------------------
// WHAT AN ANALYSIS IS ABOUT, AND WHAT THE CRITIC IS HANDED — docs/gf-thesis-flows.md T4 :586–:590, A3 :1376–:1383.
//
// ONE LOADER OF HEAD'S FINGERPRINT. `run_analysis` refuses ANALYSIS_CURRENT on it and `get_thesis_context` reports
// CURRENT / STALE / NONE on it: two loaders would be two fingerprints free to disagree about the same version, and the
// refusal and the read would then tell a researcher different things (R48 sketch §a).
//
// NOT `services/thesisAnalysis` — that path is RETIRED (`test/walk/retiredNames.test.ts` RETIRED_THESIS_MODULES).
// This module holds a client and no model; the critic (`services/thesisCritic.ts`) holds a model and no client.
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

/** The head, its citations resolved, and the gap list against the head's names. */
export async function loadHead(thesisId: string, headVersionId: string): Promise<LoadedHead> {
  const version = await prisma.thesisVersion.findUnique({
    where: { id: headVersionId },
    select: { id: true, text: true, claim: true, contentHash: true },
  });
  if (version === null) {
    throw new Error(`criticMaterial: thesis ${thesisId} points at head ${headVersionId}, which does not exist.`);
  }
  const mentions = await prisma.thesisMention.findMany({ where: { versionId: headVersionId }, select: { kind: true, name: true } });

  const records: LoadedHead['records'] = [];
  for (const mention of mentions) {
    if (mention.kind !== 'EVIDENCE') continue;
    const record = await resolveRecordByName(mention.name);
    // A LOUD GUARD (R48 D2): the version write resolved this name when it pinned it, and nothing is deleted after the
    // rebuild — a citation whose record the corpus no longer holds is a malformed state, not an answer.
    if (record === null) {
      throw new Error(`criticMaterial: head ${headVersionId} cites #ev_${mention.name}, which no record of the corpus resolves.`);
    }
    records.push({ name: mention.name, record });
  }

  const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId } });
  return {
    thesisId,
    version,
    records,
    trajectoryIds: mentions.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name),
    decisions,
    list: gapList(decisions, thesisId, mentions.map((m) => m.name)),
  };
}

/**
 * FINGERPRINT(HEAD) — CALLED, over the head's citations and the gap list at what each gap READS AS (R48 §c1).
 * Undefined names the diff BOTH ways, as A4 :1423 asks: its record name, and its page with the pair.
 */
export async function headFingerprint(thesisId: string, headVersionId: string): Promise<HeadFingerprint> {
  const head = await loadHead(thesisId, headVersionId);
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
