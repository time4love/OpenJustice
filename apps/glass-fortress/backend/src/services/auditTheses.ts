import { prisma } from '../lib/prisma';
import {
  flagged,
  publishableEvidence,
  type Conjunct,
  type ConjunctId,
  type ConjunctReason,
  type ExaminedMention,
  type FlagReason,
} from './evidencePredicates';

// ---------------------------------------------------------------------------
// DOES EVERY PUBLISHED CITATION STAND? — `thesis-cites-verified`, Level 9.
//
// docs/gf-evidence-flows.md A7 and docs/gf-thesis-flows.md A7: "For every
// version that is PUBLISHED(t): PUBLISHABLE(v) … and FLAGGED per mention." This
// is the EVIDENCE HALF — the six evidence predicates per EVIDENCE mention;
// TRAJECTORY_CURRENT and CLAIM_FRAMED are thesis step 23's, and the report NAMES
// them as not examined rather than passing over them.
//
// IT WALKS PUBLISHED VERSIONS, AND THE PIN DECIDES. `Thesis.publishedVersionId`
// is `@unique` with `isPublished` as its back-relation, so the subject set is
// the published versions themselves and not a status anyone could set beside
// one. A draft's head is never examined: an unpublishable citation on a head is
// the ordinary state of a draft, and an instrument that counted it would have
// the wrong subject.
//
// IT CALLS TWO FUNCTIONS AND NOTHING ELSE. `publishableEvidence` per version and
// `flagged` per mention — no chain read of its own (`verified` reads the stored
// verdict), no model, and NO WRITE. It REFUSES NOTHING either: an empty subject
// set is a pass that prints its zero (below), and there is no input to refuse.
//
// THE EXITS, KEYED ON THE FAILURE'S REASON — never on the conjunct's id:
//
//   exit 0   every published citation is PUBLISHABLE and unflagged
//   exit 2   a failure whose REASON the flag names — an EXPECTED state, listed
//            with its flag: WITHDRAWN · NOT_CITATION_CURRENT · AWAITING_DERIVATION
//   exit 1   a failure whose REASON no flag names — the gate did not hold — or a
//            version the gate cannot answer for, printed under its own heading
//
// Thesis A7 :1627: "exit 1: a published version that is not PUBLISHABLE by any
// conjunct the flag does not cover". Document A6 :1531 gives ONE conjunct TWO
// causes, and a rule keyed on the id cannot express that; keyed on the reason,
// `RECORD_PROMOTED` exits 2 when the row is WITHDRAWN and 1 when there is no
// row, and `INPUT_SOUND` exits 2 on AWAITING_DERIVATION and 1 on CONTRADICTED.
// EXIT 1 OUTRANKS EXIT 2: a version whose gate failed is not described by the
// word for an expected state.
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

/** A citation the gate could not grade — printed under NOT ANSWERABLE, never among the failures. */
export interface NotAnswerable {
  thesisId: string;
  versionId: string;
  mentionId: string;
  fileHash: string;
  reason: 'DOCUMENT_CLASS_NOT_BUILT';
}

/** One published version: what it cited, each citation's six verdicts, and its flag. */
export interface VersionBlock {
  thesisId: string;
  versionId: string;
  mentions: { examined: ExaminedMention; conjuncts: Conjunct[]; flag: FlagReason[] }[];
}

export interface ThesisAuditReport {
  /** Published versions examined — the FIRST line of the report. */
  versions: number;
  /** EVIDENCE citations examined across them — the SECOND. */
  citations: number;
  blocks: VersionBlock[];
  /** Failures no flag names: exit 1, the gate did not hold. */
  unpublishable: CitationFailure[];
  /** Failures the flag names: exit 2, an expected state. */
  flagged: CitationFailure[];
  /** Citations the gate could not grade: exit 1, under its own heading. */
  notAnswerable: NotAnswerable[];
}

/**
 * The conjuncts FLAGGED is BOUND to cover. A failure of one of these that the
 * flag does not name is a contradiction between two functions reading the same
 * rows — and the fold THROWS naming the mention rather than silently choosing an
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
    blocks: [],
    unpublishable: [],
    flagged: [],
    notAnswerable: [],
  };

  for (const thesis of theses) {
    const versionId = thesis.publishedVersionId;
    if (versionId === null) continue; // the `where` already says so; the compiler does not know it
    report.versions += 1;

    const evaluated = await publishableEvidence(versionId);
    report.citations += evaluated.mentionsExamined;
    const block: VersionBlock = { thesisId: thesis.id, versionId, mentions: [] };

    for (const mention of evaluated.mentions) {
      const flag = (await flagged(mention.examined.mentionId)).reasons;
      block.mentions.push({ examined: mention.examined, conjuncts: mention.conjuncts, flag });
      const where = {
        thesisId: thesis.id,
        versionId,
        mentionId: mention.examined.mentionId,
        fileHash: mention.examined.fileHash,
      };

      if (!mention.evaluable) {
        report.notAnswerable.push({ ...where, reason: mention.reason });
        continue;
      }

      for (const conjunct of mention.conjuncts.filter((c) => c.verdict === 'FAIL')) {
        // THE REASON IS READ, NEVER RE-DERIVED. `publishable` renders it at the one
        // place the failure is decided, so the exit rule and the predicate cannot
        // disagree about why a citation failed. A FAIL without one is a defect in
        // the predicate, and it is named rather than guessed.
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
    report.blocks.push(block);
  }
  return report;
}

/** §4c's three exits. Exit 1 outranks exit 2. */
export function exitCodeFor(report: ThesisAuditReport): 0 | 1 | 2 {
  if (report.unpublishable.length > 0 || report.notAnswerable.length > 0) return 1;
  if (report.flagged.length > 0) return 2;
  return 0;
}

/** The report as a person reads it — the TWO COUNTS FIRST, then everything else. */
export function formatThesisAudit(report: ThesisAuditReport): string {
  const lines = [`Published versions: ${String(report.versions)}`, `EVIDENCE citations: ${String(report.citations)}`];

  if (report.versions === 0) {
    lines.push('');
    lines.push('No thesis has been published in this environment, so no published citation was examined.');
    lines.push('Nothing is unpublishable because nothing is published — this is a true answer about the');
    lines.push('versions, not a check that was skipped.');
  }

  for (const block of report.blocks) {
    lines.push('');
    lines.push(`version ${block.versionId}  (thesis ${block.thesisId})`);
    for (const m of block.mentions) {
      const verdicts = m.conjuncts.map((c) => `${c.id}=${c.verdict}`).join(' ');
      lines.push(`  mention ${m.examined.mentionId}  ${m.examined.fileHash}  ${verdicts}`);
      if (m.flag.length > 0) lines.push(`    FLAGGED: ${m.flag.join(', ')}`);
    }
  }

  if (report.unpublishable.length > 0) {
    lines.push('');
    lines.push('THE GATE DID NOT HOLD — a published citation fails a conjunct no flag covers:');
    for (const f of report.unpublishable) {
      lines.push(`  version ${f.versionId}  mention ${f.mentionId}  ${f.conjunct} (${f.reason})`);
      lines.push(`    ${f.detail}`);
    }
  }
  if (report.flagged.length > 0) {
    lines.push('');
    lines.push('FLAGGED — an expected state, shown beside the citation on the public page:');
    for (const f of report.flagged) {
      lines.push(`  version ${f.versionId}  mention ${f.mentionId}  ${f.conjunct} (${f.reason})`);
    }
  }

  lines.push('');
  lines.push('NOT EXAMINED, and named rather than passed over: TRAJECTORY_CURRENT per cited trajectory');
  lines.push("and CLAIM_FRAMED (thesis A7) — thesis step 23's; SHED (document flows A3's third arm) —");
  lines.push("document step 28's.");
  lines.push('');
  lines.push(`NOT ANSWERABLE: ${String(report.notAnswerable.length)} citations.`);
  if (report.notAnswerable.length > 0) {
    lines.push('The gate could not be run on these citations, and this is not a failure of theirs:');
    for (const n of report.notAnswerable) {
      lines.push(`  version ${n.versionId}  mention ${n.mentionId}  ${n.fileHash} — ${n.reason} (document step 28)`);
    }
  }
  return lines.join('\n');
}
