import { prisma } from '../lib/prisma';
import { flagged, type Conjunct, type ConjunctId, type ConjunctReason, type ExaminedMention, type FlagReason } from './evidencePredicates';
import { evaluatePublication } from './publicationEvaluation';
import { trajectoryCurrent } from './thesisPredicates';
import type { TrajectoryCurrency } from './trajectoryCitation';

// ---------------------------------------------------------------------------
// DOES EVERY PUBLISHED CITATION STAND? — `thesis-cites-verified`, Level 9.
//
// docs/gf-thesis-flows.md A7 :1621–:1628 and docs/gf-evidence-flows.md A7: "For every version that is PUBLISHED(t):
// PUBLISHABLE(v) — the six evidence predicates per EVIDENCE mention, TRAJECTORY_CURRENT per trajectory, CLAIM_FRAMED — and
// FLAGGED per mention." All of it, since thesis step 24 (the R50 sketch §d): the evidence half evidence step 15 built, the
// trajectories and the framed claim joined to it.
//
// IT WALKS PUBLISHED VERSIONS, AND THE PIN DECIDES — the current pin only (the researcher's ruling R-iv; A3 :1364).
// `Thesis.publishedVersionId` is `@unique` with `isPublished` as its back-relation, so the subject set is the published
// versions themselves and not a status anyone could set beside one. A draft's head is never examined.
//
// ONE EVALUATION PER VERSION (A7 :1646; A6 :1586). `evaluatePublication(versionId, null)` is the ONE load of PUBLISHABLE(v),
// every conjunct CALLED there; this pass reads `report` (the evidence half), `claimFramed`, `currencies` and
// `missingTrajectoryIds` from it and asks `trajectoryCurrent` of each currency, plus `flagged` per EVIDENCE mention. No
// chain read of its own, no model, NO WRITE, and it REFUSES NOTHING: an empty subject set is a pass that prints its zero.
// A malformed load inside the evaluation — a citation no corpus record resolves — THROWS, and the throw is not caught:
// `runOperationalScript` exits 1 on it, so the answer is never "the gate held".
//
// A7 AUDITS THREE FAMILIES AND NO MORE. CURRENT_ANALYSIS, GAPS_DECIDED, the public-interest statement and the publication
// assessment are facts of the moment of publication, or move legitimately after it; the report names them NOT EXAMINED.
// A version citing a DOCUMENT is audited when documents are citable — document refactor plan :396 (step 34); until then a
// DOCUMENT citation cannot be resolved by the corpus and its version THROWS with the rest of the malformed loads.
//
// THE EXITS, KEYED ON THE FAILURE'S REASON — never on the conjunct's id:
//
//   exit 0   every published version publishable and unflagged — including none
//   exit 2   an EXPECTED state, listed: an evidence failure whose REASON the flag names (WITHDRAWN · NOT_CITATION_CURRENT ·
//            AWAITING_DERIVATION), or a trajectory the newest pass does not stand behind (STALE_TRAJECTORY)
//   exit 1   the gate did not hold: an evidence failure whose REASON no flag names, a trajectory no stored pass holds, a
//            claim no framing chose
//
// Thesis A7 :1627: "exit 1: a published version that is not PUBLISHABLE by any conjunct the flag does not cover". Document
// A6 :1531 gives ONE conjunct TWO causes, and a rule keyed on the id cannot express that; keyed on the reason,
// `RECORD_PROMOTED` exits 2 when the row is WITHDRAWN and 1 when there is no row. EXIT 1 OUTRANKS EXIT 2.
// ---------------------------------------------------------------------------

/** One failed conjunct of one published citation. */
export interface CitationFailure {
  thesisId: string;
  versionId: string;
  mentionId: string;
  fileHash: string;
  conjunct: ConjunctId;
  /** The failure's KEY, exactly as `publishable` rendered it — never re-derived here. */
  reason: ConjunctReason;
  detail: string;
}

/** One trajectory citation of a published version that is stale (exit 2) or that no stored pass holds (exit 1). */
export interface TrajectoryFailure {
  thesisId: string;
  versionId: string;
  trajectoryId: string;
  state: TrajectoryCurrency['state'] | 'MISSING';
}

/** One published version: what it cited, each citation's six verdicts and its flag, its trajectories, its framing. */
export interface VersionBlock {
  thesisId: string;
  versionId: string;
  mentions: { examined: ExaminedMention; conjuncts: Conjunct[]; flag: FlagReason[] }[];
  trajectories: { id: string; state: TrajectoryCurrency['state'] | 'MISSING' }[];
  claimFramed: boolean;
}

export interface ThesisAuditReport {
  /** Published versions examined — the FIRST line of the report. */
  versions: number;
  /** EVIDENCE citations examined across them — the SECOND. */
  citations: number;
  /** TRAJECTORY citations examined across them — the THIRD. */
  trajectories: number;
  blocks: VersionBlock[];
  /** Evidence failures no flag names: exit 1, the gate did not hold. */
  unpublishable: CitationFailure[];
  /** Evidence failures the flag names: exit 2, an expected state. */
  flagged: CitationFailure[];
  /** Trajectories the newest pass does not stand behind: exit 2, an expected state. */
  stale: TrajectoryFailure[];
  /** Trajectories no stored pass holds: exit 1, the gate did not hold. */
  unresolved: TrajectoryFailure[];
  /** Published versions whose claim no framing chose: exit 1, the gate did not hold. */
  unframed: { thesisId: string; versionId: string }[];
}

/**
 * The conjuncts FLAGGED is BOUND to cover. A failure of one of these that the flag does not name is a contradiction
 * between two functions reading the same rows — and the fold THROWS naming the mention rather than silently choosing an
 * exit: the walk-defect shape `chunksOf` and Gate 2 already use.
 */
const FLAG_MUST_COVER: readonly ConjunctId[] = ['DERIVED', 'CITATION_CURRENT'];

/** Every published version, graded — reads only; writes nothing. */
export async function auditTheses(): Promise<ThesisAuditReport> {
  const theses = await prisma.thesis.findMany({
    where: { publishedVersionId: { not: null } },
    select: { id: true, publishedVersionId: true },
    orderBy: { id: 'asc' },
  });

  const report: ThesisAuditReport = {
    versions: 0,
    citations: 0,
    trajectories: 0,
    blocks: [],
    unpublishable: [],
    flagged: [],
    stale: [],
    unresolved: [],
    unframed: [],
  };

  for (const thesis of theses) {
    const versionId = thesis.publishedVersionId;
    if (versionId === null) continue; // the `where` already says so; the compiler does not know it
    report.versions += 1;

    const evaluation = await evaluatePublication(versionId, null);
    const evidence = evaluation.report;
    report.citations += evidence.mentionsExamined;
    const block: VersionBlock = { thesisId: thesis.id, versionId, mentions: [], trajectories: [], claimFramed: evaluation.claimFramed };

    for (const mention of evidence.mentions) {
      const flag = (await flagged(mention.examined.mentionId)).reasons;
      block.mentions.push({ examined: mention.examined, conjuncts: mention.conjuncts, flag });
      if (!mention.evaluable) {
        // UNREACHABLE (the R50 sketch §6-D18): the only not-evaluable citation is a DOCUMENT's, and `evaluatePublication`
        // cannot resolve one — it threw before this line. A LOUD GUARD, never a silent pass over a citation nobody graded.
        throw new Error(
          `auditTheses: mention ${mention.examined.mentionId} of version ${versionId} could not be graded (${mention.reason}) ` +
            'and the evaluation did not throw — a DOCUMENT citation is audited from document refactor plan step 34.',
        );
      }
      const where = { thesisId: thesis.id, versionId, mentionId: mention.examined.mentionId, fileHash: mention.examined.fileHash };

      for (const conjunct of mention.conjuncts.filter((c) => c.verdict === 'FAIL')) {
        // THE REASON IS READ, NEVER RE-DERIVED. `publishable` renders it at the one place the failure is decided, so the
        // exit rule and the predicate cannot disagree about why a citation failed. A FAIL without one is a defect in the
        // predicate, and it is named rather than guessed.
        const reason = conjunct.reason;
        if (reason === null) {
          throw new Error(
            `auditTheses: mention ${mention.examined.mentionId} FAILS ${conjunct.id} and PUBLISHABLE ` +
              'rendered no reason for it. Every FAIL carries its key; the exit is keyed on it.',
          );
        }
        const covered = (flag as readonly string[]).includes(reason);
        if (!covered && FLAG_MUST_COVER.includes(conjunct.id)) {
          throw new Error(
            `auditTheses: mention ${mention.examined.mentionId} FAILS ${conjunct.id} (${reason}) and ` +
              'FLAGGED does not name it. The two read the same rows, so they cannot disagree unless ' +
              'one of them is wrong; this names the mention rather than choosing an exit for it.',
          );
        }
        const failure: CitationFailure = { ...where, conjunct: conjunct.id, reason, detail: conjunct.detail ?? '' };
        (covered ? report.flagged : report.unpublishable).push(failure);
      }
    }

    // TRAJECTORY_CURRENT per cited trajectory — CALLED on each currency the ONE resolver computed inside the evaluation.
    report.trajectories += evaluation.trajectoryIds.length;
    for (const { id, currency } of evaluation.currencies) {
      block.trajectories.push({ id, state: currency.state });
      if (!trajectoryCurrent(currency)) report.stale.push({ thesisId: thesis.id, versionId, trajectoryId: id, state: currency.state });
    }
    for (const id of evaluation.missingTrajectoryIds) {
      block.trajectories.push({ id, state: 'MISSING' });
      report.unresolved.push({ thesisId: thesis.id, versionId, trajectoryId: id, state: 'MISSING' });
    }

    // CLAIM_FRAMED, as the evaluation asked it of `claimFramed`.
    if (!evaluation.claimFramed) report.unframed.push({ thesisId: thesis.id, versionId });

    report.blocks.push(block);
  }
  return report;
}

/** A7's three exits. Exit 1 outranks exit 2. */
export function exitCodeFor(report: ThesisAuditReport): 0 | 1 | 2 {
  if (report.unpublishable.length > 0 || report.unresolved.length > 0 || report.unframed.length > 0) return 1;
  if (report.flagged.length > 0 || report.stale.length > 0) return 2;
  return 0;
}

/** The report as a person reads it — the THREE COUNTS FIRST, then everything else. */
export function formatThesisAudit(report: ThesisAuditReport): string {
  const lines = [
    `Published versions: ${String(report.versions)}`,
    `EVIDENCE citations: ${String(report.citations)}`,
    `TRAJECTORY citations: ${String(report.trajectories)}`,
  ];

  if (report.versions === 0) {
    lines.push('');
    lines.push('No thesis has been published in this environment, so no published citation was examined.');
    lines.push('Nothing is unpublishable because nothing is published — this is a true answer about the');
    lines.push('versions, not a check that was skipped.');
  }

  for (const block of report.blocks) {
    lines.push('');
    lines.push(`version ${block.versionId}  (thesis ${block.thesisId})  CLAIM_FRAMED=${block.claimFramed ? 'PASS' : 'FAIL'}`);
    for (const m of block.mentions) {
      const verdicts = m.conjuncts.map((c) => `${c.id}=${c.verdict}`).join(' ');
      lines.push(`  mention ${m.examined.mentionId}  ${m.examined.fileHash}  ${verdicts}`);
      if (m.flag.length > 0) lines.push(`    FLAGGED: ${m.flag.join(', ')}`);
    }
    for (const t of block.trajectories) lines.push(`  trajectory ${t.id}  ${t.state}`);
  }

  if (report.unpublishable.length > 0 || report.unresolved.length > 0 || report.unframed.length > 0) {
    lines.push('');
    lines.push('THE GATE DID NOT HOLD — a published version fails a conjunct no flag covers:');
    for (const f of report.unpublishable) {
      lines.push(`  version ${f.versionId}  mention ${f.mentionId}  ${f.conjunct} (${f.reason})`);
      lines.push(`    ${f.detail}`);
    }
    for (const t of report.unresolved) {
      lines.push(`  version ${t.versionId}  trajectory ${t.trajectoryId}  TRAJECTORIES_RESOLVE (no stored detection pass holds it)`);
    }
    for (const u of report.unframed) lines.push(`  version ${u.versionId}  CLAIM_FRAMED (no framing chose this claim)`);
  }
  if (report.flagged.length > 0) {
    lines.push('');
    lines.push('FLAGGED — an expected state, shown beside the citation on the public page:');
    for (const f of report.flagged) {
      lines.push(`  version ${f.versionId}  mention ${f.mentionId}  ${f.conjunct} (${f.reason})`);
    }
  }
  if (report.stale.length > 0) {
    lines.push('');
    lines.push("STALE_TRAJECTORY — an expected state, the author's to answer with a new version:");
    for (const t of report.stale) lines.push(`  version ${t.versionId}  trajectory ${t.trajectoryId}  ${t.state}`);
  }

  lines.push('');
  lines.push('NOT EXAMINED, and named rather than passed over: CURRENT_ANALYSIS, GAPS_DECIDED, the public-interest');
  lines.push('statement and the publication assessment — thesis A7 audits none of them (each is a fact of the moment of');
  lines.push("publication, or moves legitimately after it); SHED — document flows A3's third arm, document step 28's.");
  return lines.join('\n');
}
