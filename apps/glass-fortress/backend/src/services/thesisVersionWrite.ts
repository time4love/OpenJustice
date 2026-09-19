import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { parseCitations } from '../lib/citationTokens';
import { contentHash } from '../lib/thesisIdentity';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { pairName, resolveRecordByName, resolveUnacquiredByName } from './corpusReads';
import { argued, currentVersionOf } from './evidencePredicates';
import { gapList, unargued, type CitedMention } from './thesisPredicates';
import { resolveTrajectoryCitations } from './trajectoryCitation';
import { refusal, type Refusal } from '../mcp/tools/thesisRefusals';

// ---------------------------------------------------------------------------
// THE VERSION WRITE — docs/gf-thesis-flows.md T2 :398–:436, A2 :1270–:1293, A4 :1461–:1474.
//
// "A version is one transaction, and the citation is inside the text." ONE tool act writes ONE version:
// the text, its hash, the mentions extracted from it, each mention's pin computed at that moment, and the
// head pointer moved — all or nothing. THIS MODULE IS THE ONLY WRITER OF A VERSION AND OF ITS MENTIONS
// (`versions-immutable`, the evidence writer map), and it never updates either: a version is immutable
// after the write, and a mention's one later write is `promote_from_debate`'s.
//
// TWO HALVES, BECAUSE THE TOOLS CHECK OTHER THINGS BETWEEN THEM. `resolveCitations` decides every refusal
// the corpus can decide — before any transaction opens, since the name pass is linear in the corpus and a
// transaction's window is not a place to spend it (memory: the 5 s window). `writeThesisVersion` is the
// transaction, and decides the three refusals only the transaction can: a framing attached by a race, a
// head that moved, and `affirmed` moved by a REAFFIRM between its two reads.
//
// THE PIN IS COMPUTED, NEVER SUPPLIED (T2 :429). Where an Evidence row exists the pin is its
// `affirmedContentVersionHash` — the only value allowed (evidence A2 :1006) — and otherwise the record's
// CURRENT hash, what the author read. Nothing in either input can carry one.
//
// STALE_PIN IS THE RACE REFUSAL — the researcher's Q1 (memory: step-17 rulings). `affirmed` is read inside
// the transaction and read AGAIN as its last statement; a REAFFIRM that committed between the two refuses
// STALE_PIN and the transaction rolls back. The next write reads the new `affirmed`, re-pins, and reports
// that the argument did not carry. RE-READ, NOT A LOCK (R47 §6-R7): under READ COMMITTED a REAFFIRM that
// commits after the second read and before COMMIT is not seen — a window the length of the commit itself.
//
// A REFUSAL INSIDE THE TRANSACTION IS A THROWN `Lost`, caught at the one call site. A callback that RETURNS
// commits; only a rejection rolls back — in Prisma and in the suite's double alike.
// ---------------------------------------------------------------------------

/** A citation the corpus holds, with what the write needs of it. */
export type ResolvedCitation =
  | { kind: 'EVIDENCE'; name: string; current: string }
  | { kind: 'TRAJECTORY'; name: string };

/** Where the version goes: onto an existing thesis's head, or as the first version of a new thesis. */
export type VersionTarget =
  | { kind: 'EXISTING'; thesisId: string; expectedHeadVersionId: string }
  | { kind: 'NEW'; provision: string | null; framingId: string | null };

export interface VersionWriteInput {
  researcherId: string;
  /** VERBATIM — the bytes the researcher approved, hashed and stored as given. */
  text: string;
  /** VERBATIM — CLAIM_FRAMED compares it character for character (T2 :451–:453). */
  claim: string;
  citations: readonly ResolvedCitation[];
  target: VersionTarget;
}

export interface MentionAnswer {
  kind: 'EVIDENCE' | 'TRAJECTORY';
  name: string;
  /** The content version pinned; null on a TRAJECTORY mention, which pins nothing (A2 :1284). */
  pin: string | null;
  /** ARGUED(m) — false on a TRAJECTORY mention, which has no argument (R47 §6-R16). */
  argued: boolean;
}

/** The UNION of T2 :422 and A4 :1471 — the R42 follow-up's ruling. */
export interface VersionWritten {
  thesisId: string;
  versionId: string;
  contentHash: string;
  mentions: MentionAnswer[];
  unargued: string[];
  gapsNowOpen: string[];
}

type WriteRefusal = Refusal<'STALE_HEAD' | 'STALE_PIN' | 'FRAMING_ATTACHED'>;
type CitationRefusal = Refusal<'NOT_A_RECORD' | 'NOT_ACQUIRED' | 'AWAITING_DERIVATION' | 'UNKNOWN_TRAJECTORY_ID'>;

/** A refusal decided inside the transaction — thrown so the transaction rolls back, and caught at its call site. */
class Lost extends Error {
  constructor(readonly refused: WriteRefusal) {
    super(refused.error);
  }
}

// ---------------------------------------------------------------------------
// THE CITATIONS — every refusal the corpus decides, in A4's order.
// ---------------------------------------------------------------------------

/**
 * Every citation of `text`, resolved against the corpus — or the first refusal.
 *
 * THE ORDER, AND WHY IT IS DEPENDENT (`framingRounds.ts` `loadRecords`' rule): a token that cannot be read
 * is NOT_A_RECORD before anything is looked up; then each record, in text order, through its own chain —
 * a name the corpus does not hold cannot be asked whether it was acquired, and one not acquired has no
 * content version to be awaiting — and the first refusal is returned; every trajectory after every record.
 */
export async function resolveCitations(text: string): Promise<ResolvedCitation[] | CitationRefusal> {
  const parsed = parseCitations(text);
  if (!parsed.parsed) {
    return parsed.reason === 'DOCUMENT_NOT_BUILT'
      ? refusal(
          'NOT_A_RECORD',
          `${parsed.token} cites a DOCUMENT, and documents are not citable yet — the document class lands at ` +
            'document plan step 33, which adds the #doc_ kind to this write. Cite a corpus record (#ev_) or a ' +
            'trajectory (#tr_), or leave the document out of this version.',
        )
      : refusal(
          'NOT_A_RECORD',
          `${parsed.token} is not a citation this platform can read. A record is cited as #ev_ followed by its ` +
            'name — 0x and 64 lowercase hex, exactly as list_findings returns it — and a trajectory as #tr_ ' +
            'followed by the id get_claim_trajectories returned.',
        );
  }

  const currentOf = new Map<string, string>();
  for (const citation of parsed.citations) {
    if (citation.kind !== 'EVIDENCE') continue;
    const current = await currentOfRecord(citation.name);
    if (typeof current !== 'string') return current;
    currentOf.set(citation.name, current);
  }

  const trajectoryIds = parsed.citations.filter((c) => c.kind === 'TRAJECTORY').map((c) => c.name);
  if (trajectoryIds.length > 0) {
    const { missing } = await resolveTrajectoryCitations(trajectoryIds);
    if (missing.length > 0) {
      return refusal(
        'UNKNOWN_TRAJECTORY_ID',
        `No detection pass stored ${missing.join(', ')}. A trajectory is cited by the id ` +
          'get_claim_trajectories returned, never by a claim hash.',
      );
    }
  }

  // Text order, records and trajectories interleaved as the text has them.
  return parsed.citations.map((c): ResolvedCitation => {
    if (c.kind === 'TRAJECTORY') return { kind: 'TRAJECTORY', name: c.name };
    const current = currentOf.get(c.name);
    if (current === undefined) {
      throw new Error(`thesisVersionWrite: #ev_${c.name} was parsed and never resolved — the resolution loop is defective.`);
    }
    return { kind: 'EVIDENCE', name: c.name, current };
  });
}

/** One `#ev_` name, through the corpus: NOT_A_RECORD · NOT_ACQUIRED · AWAITING_DERIVATION, or its CURRENT hash. */
async function currentOfRecord(name: string): Promise<string | CitationRefusal> {
  const record = await resolveRecordByName(name);

  if (record === null) {
    const unkept = await resolveUnacquiredByName(name);
    if (unkept === null) {
      return refusal(
        'NOT_A_RECORD',
        `#ev_${name} names nothing the corpus holds. A record's name is composed from the page's URL, the ` +
          "capture's archive timestamp and the SHA-256 of the bytes as served; list_findings returns the " +
          'name of every record on a page.',
      );
    }
    const { before, after } = unkept.neighbours;
    return refusal(
      'NOT_ACQUIRED',
      `#ev_${name} is over ${unkept.capture} of ${unkept.page.url}, whose work-list outcome is ${unkept.outcome}: ` +
        'the corpus holds no text for it, so there is no content version to pin. The acquired capture before it ' +
        `is ${before ?? 'none'}, the one after it is ${after ?? 'none'}` +
        (before !== null && after !== null ? `, and the diff ${before} → ${after} spans it` : '') +
        '. Cite those records instead (list_findings names them).',
    );
  }

  if (record.capture !== null) {
    const current = currentVersionOf({ kind: 'CAPTURE', capture: record.capture });
    if (!current.defined) {
      throw new Error(`thesisVersionWrite: CURRENT of the capture #ev_${name} is undefined — a capture always has one.`);
    }
    return current.contentVersionHash;
  }

  const diff = record.diff;
  if (diff === null) {
    throw new Error(`thesisVersionWrite: #ev_${name} resolved to neither a capture nor a diff (evidence A1).`);
  }
  const current = currentVersionOf({ kind: 'DIFF', before: diff.before, after: diff.after, versions: diff.versions });
  if (!current.defined) {
    // NAMES THE DIFF (A4 :1422–:1423) — by its page and its two timestamps, and by its name.
    return refusal(
      'AWAITING_DERIVATION',
      `The diff ${record.page.url} ${pairName(diff)} (#ev_${name}) has no current content version: its ` +
        "endpoints' text has moved and the walk owes a re-derivation, so no pin can be computed. Run " +
        'scan_captures on this page, then write the version again.',
    );
  }
  return current.contentVersionHash;
}

// ---------------------------------------------------------------------------
// THE TRANSACTION.
// ---------------------------------------------------------------------------

/** The mention rows the write reads of the parent: what carries an argument forward. */
interface ParentMention {
  kind: string;
  name: string;
  contentVersionHash: string | null;
  debateSessionId: string | null;
  debateSession: { status: string; recordFileHash: string; thesisId: string } | null;
}

/**
 * T2's transaction: the thesis when new, the framing's attachment, the version, its mentions in ONE call,
 * the head's compare-and-set, and STALE_PIN decided last.
 */
export async function writeThesisVersion(input: VersionWriteInput): Promise<VersionWritten | WriteRefusal> {
  const hash = contentHash(input.text);
  const evidenceNames = input.citations.filter((c) => c.kind === 'EVIDENCE').map((c) => c.name);

  let written: { thesisId: string; versionId: string; mentions: CarriedMention[] };
  try {
    written = await prisma.$transaction(async (tx) => {
      const { thesisId, expectedHead } = await thesisOf(tx, input);

      // READ 1 of `affirmed` — the pin is computed from it, inside the transaction.
      const affirmedAtRead = await affirmedOf(tx, evidenceNames);
      const parent = expectedHead === null ? [] : await parentMentions(tx, expectedHead);

      const mentions = input.citations.map((citation): CarriedMention => {
        if (citation.kind === 'TRAJECTORY') {
          return { kind: 'TRAJECTORY', name: citation.name, pin: null, debateSessionId: null, debate: null };
        }
        const pin = affirmedAtRead.get(citation.name) ?? citation.current;
        // THE ARGUMENT CARRIES only while (name, pin) is unchanged (T2 :415–:418).
        const carried = parent.find(
          (m) => m.kind === 'EVIDENCE' && m.name === citation.name && m.contentVersionHash === pin && m.debateSessionId !== null,
        );
        return {
          kind: 'EVIDENCE',
          name: citation.name,
          pin,
          debateSessionId: carried?.debateSessionId ?? null,
          debate: carried?.debateSession ?? null,
        };
      });

      const version = await tx.thesisVersion.create({
        data: {
          thesisId,
          parentVersionId: expectedHead,
          text: input.text,
          contentHash: hash,
          claim: input.claim,
          createdById: input.researcherId,
        },
        select: { id: true },
      });

      // ONE CALL for every mention — the transaction window (memory: rows that come in a batch are one call).
      // TYPED, because `prismaPayloadFields` cannot read an ARRAY payload's columns (its header's blind spot).
      // THE RETURN TYPE ON THE CALLBACK, not only on `rows`: an excess key is checked against the literal's OWN
      // contextual type, and a type on the array alone infers the element from the literal and checks nothing.
      const rows = mentions.map((m): Prisma.ThesisMentionCreateManyInput => ({
        versionId: version.id,
        kind: m.kind,
        name: m.name,
        contentVersionHash: m.pin,
        debateSessionId: m.debateSessionId,
      }));
      if (rows.length > 0) await tx.thesisMention.createMany({ data: rows });

      // THE COMPARE-AND-SET — the head moves only from the head this write was made against.
      const headMoved = await tx.thesis.updateMany({
        where: { id: thesisId, headVersionId: expectedHead },
        data: { headVersionId: version.id },
      });
      if (headMoved.count === 0) {
        const now = await tx.thesis.findUnique({ where: { id: thesisId }, select: { headVersionId: true } });
        const winner = now?.headVersionId ?? 'none';
        throw new Lost(
          refusal(
            'STALE_HEAD',
            `Thesis ${thesisId}'s head is now ${winner}, not ${expectedHead ?? 'none'}: another write landed first. ` +
              'Read it with get_thesis_context and write again against that head.',
          ),
        );
      }

      // READ 2 of `affirmed` — the LAST statement. A REAFFIRM that committed since read 1 refuses.
      const affirmedNow = await affirmedOf(tx, evidenceNames);
      const reaffirmed = mentions.filter((m) => {
        const now = affirmedNow.get(m.name);
        return m.kind === 'EVIDENCE' && now !== undefined && now !== m.pin;
      });
      if (reaffirmed.length > 0) {
        throw new Lost(
          refusal(
            'STALE_PIN',
            `The content version a researcher stands behind for ${reaffirmed.map((m) => `#ev_${m.name}`).join(', ')} ` +
              'moved while this version was being written (a review re-affirmed it). Nothing was written. Write ' +
              'the version again: it will pin the re-affirmed version, and the argument made against the old one ' +
              'will not carry.',
          ),
        );
      }

      return { thesisId, versionId: version.id, mentions };
    }, WRITE_TRANSACTION);
  } catch (err) {
    if (err instanceof Lost) return err.refused;
    throw err;
  }

  return answerOf(written, hash);
}

interface CarriedMention {
  kind: 'EVIDENCE' | 'TRAJECTORY';
  name: string;
  pin: string | null;
  debateSessionId: string | null;
  debate: CitedMention['debate'];
}

/** The thesis the version is written onto, and the head it must replace — creating and attaching when new. */
async function thesisOf(
  tx: Prisma.TransactionClient,
  input: VersionWriteInput,
): Promise<{ thesisId: string; expectedHead: string | null }> {
  if (input.target.kind === 'EXISTING') {
    return { thesisId: input.target.thesisId, expectedHead: input.target.expectedHeadVersionId };
  }
  const thesis = await tx.thesis.create({
    data: { provision: input.target.provision, createdById: input.researcherId, headVersionId: null },
    select: { id: true },
  });
  const framingId = input.target.framingId;
  if (framingId !== null) {
    // THE ATTACHMENT'S COMPARE-AND-SET: a framing attaches to one thesis, once (A2 :1297).
    const attached = await tx.framing.updateMany({
      where: { id: framingId, thesisId: null },
      data: { thesisId: thesis.id },
    });
    if (attached.count === 0) {
      throw new Lost(
        refusal(
          'FRAMING_ATTACHED',
          `Framing ${framingId} was attached to another thesis while this one was being created. Nothing was ` +
            'written. A framing belongs to one thesis; open a new framing for this claim.',
        ),
      );
    }
  }
  return { thesisId: thesis.id, expectedHead: null };
}

/** `affirmedContentVersionHash` by record name, for the names that have an Evidence row. */
async function affirmedOf(tx: Prisma.TransactionClient, names: readonly string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const rows = await tx.evidence.findMany({
    where: { fileHash: { in: [...names] } },
    select: { fileHash: true, affirmedContentVersionHash: true },
  });
  return new Map(rows.map((row) => [row.fileHash, row.affirmedContentVersionHash]));
}

/** The parent version's mentions, with each argument's debate — what the carry reads. */
async function parentMentions(tx: Prisma.TransactionClient, versionId: string): Promise<ParentMention[]> {
  return tx.thesisMention.findMany({
    where: { versionId },
    select: {
      kind: true,
      name: true,
      contentVersionHash: true,
      debateSessionId: true,
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true } },
    },
  });
}

/** The answer, after the commit: each mention's ARGUED, UNARGUED, and the CITED gaps whose citation left. */
async function answerOf(
  written: { thesisId: string; versionId: string; mentions: CarriedMention[] },
  hash: string,
): Promise<VersionWritten> {
  const { thesisId } = written;
  const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId } });
  const names = written.mentions.map((m) => m.name);

  return {
    thesisId,
    versionId: written.versionId,
    contentHash: hash,
    mentions: written.mentions.map((m) => ({
      kind: m.kind,
      name: m.name,
      pin: m.pin,
      argued: m.kind === 'EVIDENCE' && argued({ name: m.name, thesisId, debate: m.debate }),
    })),
    unargued: unargued({ thesisId }, written.mentions),
    gapsNowOpen: gapList(decisions, thesisId, names)
      .filter((gap) => gap.inForce.decision === 'CITED' && gap.readsAs === 'OPEN')
      .map((gap) => gap.gapId),
  };
}
