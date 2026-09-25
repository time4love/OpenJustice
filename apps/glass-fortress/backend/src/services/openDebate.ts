import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/uniqueViolation';
import { recordId, type Record as CorpusRecord, type RecordId } from '../lib/evidenceIdentity';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import {
  chunksOf,
  loadDiffByPair,
  loadCaptures,
  loadPage,
  lookupCapture,
  pairName,
  type Page,
  type StoredChunk,
  type TimelineDiff,
} from './corpusReads';
import { currentVersionOf, intervening, type Current } from './evidencePredicates';
import type { AssessedContent, DocumentReading } from './promotionAssessor';
import { passagesCiting, type CitingVersion } from './debatePassage';
import { documentsByCommitment, evidenceCurrentOf, type CitedDocument } from './documentCitation';
import { readObject } from './documentBucket';
import type { NamedRecord } from './evidenceReviews';
import { DESCRIBE_TOO_LARGE_BYTES, familyOf, modelReadingOf } from '../lib/acceptedDocumentTypes';
import { modelFileOf } from '../lib/documentModelPart';
import {
  notACapture,
  refusal,
  shared,
  type RecordCode,
  type Refusal,
} from '../mcp/tools/evidenceRefusals';

// ---------------------------------------------------------------------------
// THE DEBATE, OPENED — docs/gf-evidence-flows.md §4 and A4, thesis T3.
//
// THIS MODULE OWNS TWO THINGS AND A SOURCE SCAN HOLDS EACH.
//
//   `openKey` — its whole lifecycle. test/evidence/scans.test.ts allows the
//   column to be assigned in THIS FILE and nowhere else, so the module that
//   COMPOSES the key is the module that RELEASES it: `closeDebate` below is what
//   `promote_from_debate` calls, and that file never spells the column. A2's
//   rule is "one OPEN debate per (thesis, record)" as a nullable column under an
//   ordinary unique index — PostgreSQL does not collide NULLs, so any number of
//   CLOSED sessions coexist for one pair, and the index can only enforce "at most
//   one non-null". ONE WRITER is what enforces that non-null means OPEN.
//
//   `recordChecks` — the seven checks A4 gives `open_debate`, produced ONCE.
//   A4 says promotion re-checks "every refusal of open_debate … at this moment",
//   and two implementations of "every refusal" is precisely the drift that
//   sentence is written against. `promotionBlockers` calls this same function.
//   A DOCUMENT has its own five, in the same function (document §6 :701–:704).
//
// EVERY CHECK GOES THROUGH THE STEP-12 PREDICATES AND NONE IS RE-DERIVED:
// `currentVersionOf` answers AWAITING_DERIVATION and NOTHING_TO_PROMOTE,
// `intervening` answers NARROWED and supplies its material, `lookupCapture` and
// `loadDiffByPair` answer the four that are about the corpus holding the record.
// ---------------------------------------------------------------------------

/** `${thesisId}:${recordFileHash}` — composed here, and only here. */
export function openKeyFor(thesisId: string, recordFileHash: string): string {
  return `${thesisId}:${recordFileHash}`;
}

/** The narrow client `closeDebate` needs — testable with a hand-built `tx`. */
export interface DebateTx {
  debateSession: {
    // Typed over the GENERATED input, as `pageLog.PageDecisionData` is: a column
    // renamed in the schema fails to compile here rather than drifting. The
    // UNCHECKED variant, because this writes the foreign key as a SCALAR —
    // `evidenceId`, the row the argument created or joined — and the checked one
    // accepts only the relation form.
    update(args: {
      where: { id: string };
      data: Prisma.DebateSessionUncheckedUpdateInput;
    }): Promise<unknown>;
  };
}

/**
 * Closes the debate as PROMOTED, INSIDE the caller's transaction: the evidence
 * row it created or joined, the objection it was promoted over, the moment, and
 * the key released — ONE `debateSession.update`.
 *
 * It is one act, so it is one write: a release beside a separate status update
 * is two writes to one row where the second's failure leaves the first's meaning
 * wrong. And it is inside the caller's transaction, so a rollback keeps the key
 * and the debate stays OPEN — the key is never released for a promotion that did
 * not happen.
 */
export async function closeDebate(
  tx: DebateTx,
  sessionId: string,
  outcome: { evidenceId: string; promotedOverObjection: boolean },
): Promise<void> {
  await tx.debateSession.update({
    where: { id: sessionId },
    data: {
      status: 'PROMOTED',
      evidenceId: outcome.evidenceId,
      promotedOverObjection: outcome.promotedOverObjection,
      closedAt: new Date(),
      // Released HERE, by the module that composed it. `openKey` is a String, so
      // a cleared value is a plain null — `Prisma.DbNull` is for a cleared Json
      // and would be the wrong emptiness.
      openKey: null,
    },
  });
}

// ---------------------------------------------------------------------------
// THE RECORD, AS A TOOL NAMES IT (A1) — never a row id, never a date pair.
// ---------------------------------------------------------------------------

/** A capture or a pair, by page and timestamps. */
type CorpusRecordInput =
  | { url: string; capture: string }
  | { url: string; before: string; after: string };

/**
 * The record `open_debate` is HANDED — a capture, a pair, or a DOCUMENT by its commitment, `{ document: commitment }`
 * (document A4 :1455, plan :247, §6 :701).
 *
 * THE INPUT, NOT THE ANSWER. A read answers a document as `{ commitment, title }` (evidence A4 :1123, :1144 as ruled,
 * R81 QB — `evidenceReviews.NamedRecord`); the tool takes `{ document }`. Two types, never one: `debateInputOf` below is
 * the one conversion, so an answer is never pasted back as an input the tool's own schema refuses.
 */
export type RecordInput = CorpusRecordInput | { document: string };

const isPair = (r: CorpusRecordInput): r is { url: string; before: string; after: string } =>
  'before' in r;

/**
 * THE RECORD AS `open_debate` TAKES IT, from the record as a read ANSWERS it — they differ for a document only. MOVED
 * HERE at document step 33 (R82 Entry 2, S5) from `thesisPredicates.ts`, where it built REVIEWS' command, because
 * `promotionBlockers` now needs it too and this module owns the input type.
 */
export function debateInputOf(record: NamedRecord): RecordInput {
  return 'commitment' in record ? { document: record.commitment } : record;
}

/** The head version's mention of the record, and its pin. */
interface CitingMention {
  id: string;
  versionId: string;
  contentVersionHash: string | null;
}

/** What every caller needs once the checks pass, whatever the record — so neither re-loads it. */
interface CheckedBase {
  fileHash: RecordId;
  /** The record's key on the debate and on the Evidence row — one, matching kind; null for a document's. */
  snapshotId: string | null;
  diffId: string | null;
  /** CURRENT(record) — defined, because AWAITING_DERIVATION already refused. */
  contentVersionHash: string;
  /**
   * The SAME `Current` this function evaluated, so a caller asking
   * `citationCurrent` hands it the real value rather than synthesizing one with a
   * `kind` the record does not have.
   */
  current: CurrentVersion;
  mention: CitingMention;
}

/** A capture or a pair that passed the seven checks. */
export interface CorpusRecordChecked extends CheckedBase {
  kind: 'CAPTURE' | 'DIFF';
  page: Page;
  chunks: StoredChunk[];
  captureName: string | null;
  pair: { before: string; after: string } | null;
}

/**
 * A DOCUMENT that passed its five checks. `fileHash` IS the commitment (document A2 :1341; §6 :669) — the public name,
 * never the DOC_ID — and `document` is the one loader's row, from which the assessor's material is read.
 */
export interface DocumentRecordChecked extends CheckedBase {
  kind: 'DOCUMENT';
  commitment: string;
  title: string | null;
  document: CitedDocument;
}

export type RecordChecked = CorpusRecordChecked | DocumentRecordChecked;

/** What `currentVersionOf` returns over a stored content version. */
export type CurrentVersion = Current<{
  contentVersionHash: string;
  beforeTextHash: string;
  afterTextHash: string;
  diffVersion: string;
  chunks: Prisma.JsonValue;
}>;

export interface RecordCheckInput {
  record: RecordInput;
  thesisId: string;
  headVersionId: string | null;
}

/** The head version's mention of `(kind, name)` — the queryable half of "the head cites it". */
async function citingMention(
  input: RecordCheckInput,
  kind: 'EVIDENCE' | 'DOCUMENT',
  name: string,
): Promise<CitingMention | null> {
  if (input.headVersionId === null) return null;
  return prisma.thesisMention.findFirst({
    where: { versionId: input.headVersionId, kind, name },
    select: { id: true, versionId: true, contentVersionHash: true },
  });
}

/**
 * NOT_CITED — "the citation comes first, and the argument is made on it" (§4). ONE wording for both kinds of record,
 * naming the token the text must carry: `#ev_…` for a capture or a pair, `#doc_…` for a document (thesis T2; F3).
 */
function notCited(input: RecordCheckInput, token: string, name: string): Refusal<'NOT_CITED'> {
  return refusal(
    'NOT_CITED',
    input.headVersionId === null
      ? `Thesis ${input.thesisId} has no version yet, so its head cites nothing. Write the version ` +
          `that cites ${token}, then argue for it: the citation comes first and the argument ` +
          'is made on it.'
      : `The thesis's head version does not mention ${name}. Cite the record in the text first ` +
          `(${token}) and argue on that citation — there is no promotion of a record no text ` +
          'cites.',
  );
}

/**
 * The seven checks, in the contract's order, cheapest and most local first.
 *
 * Returns the FIRST refusal rather than all of them, and that is a property of
 * the checks rather than a shortcut: they are ordered and DEPENDENT — CONTRADICTED
 * and NOTHING_TO_PROMOTE cannot be asked of a version that is AWAITING_DERIVATION,
 * and none of them can be asked of a record the corpus does not hold. "All seven"
 * is not a well-defined set.
 */
export async function recordChecks(
  input: RecordCheckInput,
): Promise<Refusal<RecordCode> | RecordChecked> {
  const { record } = input;
  // A DOCUMENT NEVER REACHES THE CORPUS CHECKS BELOW: NOT_ACQUIRED, CONTRADICTED and NARROWED are refusals about
  // captures and pairs, "a document has none of those states, and the tools never raise them for one" (§6 :723–:725).
  if ('document' in record) return documentChecks(record.document, input);

  const page = await loadPage(record.url);
  if (page === null) return shared.notSurveyed(record.url);

  // Every named timestamp, through ONE lookup — the same one `get_diff_input`
  // asks. NOT_A_CAPTURE for a name that is not a capture of this page at all;
  // NOT_ACQUIRED for a row the walk decided otherwise about, naming which, because
  // "a SKIPPED capture does not speak, an UNSERVABLE one holds nothing".
  const named: { role: string; value: string }[] = isPair(record)
    ? [
        { role: 'before', value: record.before },
        { role: 'after', value: record.after },
      ]
    : [{ role: 'capture', value: record.capture }];

  const resolved = [];
  for (const { role, value } of named) {
    const lookup = await lookupCapture(page, value);
    if (lookup.state === 'MALFORMED' || lookup.state === 'UNKNOWN') {
      return notACapture(page, role, value, lookup);
    }
    if (lookup.state === 'NOT_ACQUIRED') {
      return refusal(
        'NOT_ACQUIRED',
        `${role}=${value} is on this page's work-list with outcome ${lookup.outcome}, so the corpus ` +
          'holds no bytes and no text for it. A record is promoted from what the corpus holds: a ' +
          'SKIPPED capture does not speak and an UNSERVABLE one holds nothing.',
      );
    }
    resolved.push(lookup.capture);
  }

  const first = resolved.at(0);
  const second = resolved.at(1);
  if (first === undefined) {
    throw new Error('recordChecks: a named record resolved to no capture; the lookup is defective.');
  }

  const corpusRecord: CorpusRecord =
    second === undefined
      ? {
          kind: 'CAPTURE',
          url: page.url,
          capture: { waybackTimestamp: first.capture, documentHash: first.documentHash },
        }
      : {
          kind: 'DIFF',
          url: page.url,
          before: { waybackTimestamp: first.capture, documentHash: first.documentHash },
          after: { waybackTimestamp: second.capture, documentHash: second.documentHash },
        };
  const fileHash = recordId(corpusRecord);

  let diff: TimelineDiff | null = null;
  if (second !== undefined) {
    diff = await loadDiffByPair(page.id, first.capture, second.capture);
    if (diff === null) {
      return refusal(
        'NO_SUCH_DIFF',
        `${first.capture} → ${second.capture} is not a pair the walk wrote. Both captures are in the ` +
          'corpus, but a diff spans two CONSECUTIVE acquired captures; list_findings shows every ' +
          'pair this page holds.',
      );
    }
  }

  // NOT_CITED — "the citation comes first, and the argument is made on it" (§4).
  // Decided from the head version's MENTION, which is the queryable half; the
  // passage is read from the body afterwards, and a body that disagrees with the
  // mention is a malformed version rather than a refusal (services/debatePassage).
  const mention = await citingMention(input, 'EVIDENCE', fileHash);
  if (mention === null) return notCited(input, `#ev_${fileHash}`, fileHash);

  const current: CurrentVersion =
    diff === null
      ? currentVersionOf({ kind: 'CAPTURE', capture: first })
      : currentVersionOf({ kind: 'DIFF', before: diff.before, after: diff.after, versions: diff.versions });

  if (!current.defined) {
    return refusal(
      'AWAITING_DERIVATION',
      diff === null
        ? `The capture ${first.capture} has no current text version.`
        : `The diff ${pairName(diff)} has no current content version: its endpoints' text has moved ` +
            'and the walk owes a re-derivation. This is not a finding about the change — nothing has ' +
            'been derived to argue about yet. Run scan_captures on this page and open the debate again.',
    );
  }

  const chunks =
    current.kind === 'DIFF' && diff !== null ? chunksOf(current.version.chunks, pairName(diff)) : [];

  // Narrowed on `diff` rather than on `current.kind`, so the pair is in scope
  // without a non-null assertion: the two say the same thing, and only one of
  // them says it to the compiler.
  if (diff !== null) {
    const contradicted = chunks.filter((c) => c.survival === 'CONTRADICTED');
    if (contradicted.length > 0) {
      return refusal(
        'CONTRADICTED',
        `The archived documents this diff spans refute ${String(contradicted.length)} of ` +
          `${String(chunks.length)} reported chunks, so the record is evidence of a pipeline defect ` +
          `rather than of a change. What disagrees: ${contradicted
            .map((c) => `[${c.side}] ${c.text}`)
            .join(' · ')}`,
      );
    }
    if (chunks.length === 0) {
      return refusal(
        'NOTHING_TO_PROMOTE',
        `The current version of ${pairName(diff)} has no chunk on either side: the page did not ` +
          'move between these two captures under the rules in force. A diff with no change is ' +
          'evidence of nothing.',
      );
    }

    const acquired = (await loadCaptures(page.id)).map((c) => c.capture);
    const between = intervening({ before: diff.before.capture, after: diff.after.capture }, acquired);
    if (between.length > 0) {
      return refusal(
        'NARROWED',
        `The corpus now holds ${String(between.length)} capture(s) between this pair — ` +
          `${between.join(', ')} — so it is no longer the finest record of this change. A new ` +
          'citation takes what the corpus holds at its finest: cite the narrower diffs instead.',
      );
    }
  }

  return {
    fileHash,
    kind: diff === null ? 'CAPTURE' : 'DIFF',
    page,
    snapshotId: diff === null ? first.id : null,
    diffId: diff === null ? null : diff.id,
    contentVersionHash: current.contentVersionHash,
    current,
    chunks,
    mention: {
      id: mention.id,
      versionId: mention.versionId,
      contentVersionHash: mention.contentVersionHash,
    },
    captureName: diff === null ? first.capture : null,
    pair: diff === null ? null : { before: diff.before.capture, after: diff.after.capture },
  };
}

/**
 * THE DOCUMENT'S FIVE CHECKS, in order — document §6 :701–:704, A4 :1455–:1457 (the sketch's (c), graded).
 *
 *   NOT_A_DOCUMENT      no document of that commitment (A4 :1398 — the word of the tools HANDED one, R81 Q1)
 *   NOT_CITED           the head does not mention (DOCUMENT, commitment) — naming `#doc_…`
 *   SHED                its content was taken back, naming cause and date (A4 :1400)
 *   AWAITING_DERIVATION HELD, and no version under the current extractor (A3 :1368–:1371)
 *   NOTHING_TO_PROMOTE  SEALED, and CURRENT(d).text is null — nothing a reader can check (A4 :1456, §3)
 *
 * CUSTODY(d) and CURRENT(d) are `documentCitation`'s, the ONE loader the version write pins through, so the debate and
 * the citation cannot disagree about which version is current. It loads NO OPINION: a `DocumentOpinion` is never
 * material for the assessor (§6 :706–:708), and the loader includes versions and the shed alone.
 */
async function documentChecks(
  commitment: string,
  input: RecordCheckInput,
): Promise<Refusal<RecordCode> | DocumentRecordChecked> {
  const cited = (await documentsByCommitment([commitment])).get(commitment);
  if (cited === undefined) {
    return refusal(
      'NOT_A_DOCUMENT',
      `No document is named ${commitment}. A document is argued for by its commitment; list_documents names every ` +
        'document with its commitment.',
    );
  }

  const mention = await citingMention(input, 'DOCUMENT', commitment);
  if (mention === null) return notCited(input, `#doc_${commitment}`, commitment);

  const { current, shed } = cited;
  if ('shed' in current) {
    // A LOUD GUARD for an unreachable world, as the version write's and verify_claim_text's: CURRENT(d) reads SHED
    // only when a Shed row exists (`currentVersion`), so a shed CURRENT without one is a defective load.
    if (shed === null) throw new Error(`openDebate: CURRENT of ${commitment} reads SHED and the document has no Shed row.`);
    return refusal(
      'SHED',
      `The content of ${commitment} was taken back (${shed.cause}, ${shed.at.toISOString().slice(0, 10)}): there is ` +
        'nothing left to argue from, and nothing to promote.',
    );
  }
  if ('awaiting' in current) {
    return refusal(
      'AWAITING_DERIVATION',
      `${commitment} has no content version under the current extractor: the derivation pass owes it one, and an ` +
        'argument is made against a version. Open the debate again once it is derived.',
    );
  }
  if (cited.custody === 'SEALED' && current.text === null) {
    return refusal(
      'NOTHING_TO_PROMOTE',
      `${commitment} is sealed and its content is its bytes: no text was computed at receipt, and the platform no ` +
        'longer holds the file, so there is nothing a reader can check an argument against. Ask the sender for a ' +
        'held copy.',
    );
  }

  return {
    kind: 'DOCUMENT',
    fileHash: commitment,
    commitment,
    title: cited.document.title,
    document: cited,
    snapshotId: null,
    diffId: null,
    contentVersionHash: current.contentVersionHash,
    current: evidenceCurrentOf(current),
    mention,
  };
}

/**
 * What the assessor is handed about the record — the COMPUTED register only.
 *
 * Built here rather than inside `recordChecks` because `promote_from_debate`
 * re-runs the checks and calls no model: loading a capture's text for it would be
 * work nobody reads.
 */
export async function assessedContent(checked: RecordChecked): Promise<AssessedContent> {
  if (checked.kind === 'DOCUMENT') {
    return { kind: 'DOCUMENT', title: checked.title, reading: await documentReading(checked.document) };
  }
  if (checked.kind === 'DIFF' && checked.pair !== null) {
    return {
      kind: 'DIFF',
      before: checked.pair.before,
      after: checked.pair.after,
      // side and text ONLY: survival is the CHECK's verdict about a chunk, not
      // part of what the chunk says, and A1 keeps it out of the version's hash
      // for the same reason.
      chunks: checked.chunks.map((c) => ({ side: c.side, text: c.text })),
    };
  }
  const snapshot =
    checked.snapshotId === null
      ? null
      : await prisma.urlSnapshot.findUnique({
          where: { id: checked.snapshotId },
          select: { text: true },
        });
  if (snapshot === null) {
    throw new Error(
      `openDebate: capture ${checked.captureName ?? '(unnamed)'} passed every check but its snapshot ` +
        'could not be loaded. The corpus cannot hold a record and not hold it.',
    );
  }
  return { kind: 'CAPTURE', capture: checked.captureName ?? '', text: snapshot.text };
}

/**
 * A DOCUMENT'S CONTENT, AS THE ASSESSOR IS HANDED IT — document §6 :705–:708 and :739 (RULED 2026-09-25, R81 Q-3):
 *
 *   CURRENT(d)'s TEXT, where one derives — HELD or SEALED alike;
 *   a HELD image or PDF with no text AS ITS FILE, the part `describe_document` hands, within the bound that part was
 *     measured for (`DESCRIBE_TOO_LARGE_BYTES`, CALLED; A4 :1440);
 *   and otherwise NOTHING BUT ITS TITLE — audio and video, which no model reads; a spreadsheet with no computed text; a
 *     file above the describer's bound, which no model the platform measured reads either. The message says so in
 *     one sentence and every assertion over it is UNCHECKED. NO NEW REFUSAL (§6 :739).
 *
 * A SEALED document with no text never reaches here: NOTHING_TO_PROMOTE refused it, and the platform holds no bytes.
 */
async function documentReading(cited: CitedDocument): Promise<DocumentReading> {
  const { current, document } = cited;
  if ('awaiting' in current || 'shed' in current) {
    throw new Error(`openDebate: ${document.commitment} passed every check but has no CURRENT version.`);
  }
  if (current.text !== null) return { form: 'TEXT', text: current.text };

  const family = familyOf(document.mimeType);
  if (family === null) {
    throw new Error(`openDebate: ${document.commitment} carries a type the door never accepts (${document.mimeType}).`);
  }
  if (modelReadingOf(family) !== 'FILE' || document.byteLength > DESCRIBE_TOO_LARGE_BYTES) return { form: 'UNREAD' };

  // HELD by construction — a sealed document with null text was refused — so its bytes are in the bucket.
  const bytes = document.bytes === null ? null : await readObject(document.bytes);
  if (bytes === null) {
    throw new Error(
      `openDebate: ${document.commitment} is HELD and its bucket object is gone — a malformed row that ` +
        'document-recomputable lists.',
    );
  }
  return { form: 'FILE', file: modelFileOf(document.mimeType, bytes) };
}

/**
 * WHAT ONE ROUND HANDS THE ASSESSOR, for either tool that runs one — the page (none for a document), the record's
 * content and the passages of the head version that carry its token (`#ev_…` or `#doc_…`, matched byte for byte).
 */
export async function roundMaterial(
  checked: RecordChecked,
  version: CitingVersion,
): Promise<{ url: string | null; content: AssessedContent; passages: string[] }> {
  return {
    url: checked.kind === 'DOCUMENT' ? null : checked.page.url,
    content: await assessedContent(checked),
    passages:
      checked.kind === 'DOCUMENT'
        ? passagesCiting(version, checked.commitment, 'DOCUMENT')
        : passagesCiting(version, checked.fileHash, 'EVIDENCE'),
  };
}

/** The open transaction's result: the session, and whether it already existed. */
export interface OpenedDebate {
  sessionId: string;
  existed: boolean;
}

/**
 * The session for (thesis, record), opening it or recording a REVISION on the
 * OPEN one — A4's "one OPEN debate per (thesis, record); reopening returns it",
 * read as the SESSION being returned rather than the absence of a write.
 *
 * A second call with a new rationale records it: `RATIONALE_SUBMITTED` is "the
 * opening one OR A REVISION" in the event type's own words, and a rationale a
 * researcher wrote and the platform dropped is the one thing this table exists
 * not to do.
 */
export async function openOrRevise(
  input: { thesisId: string; checked: RecordChecked; rationale: string; researcherId: string },
): Promise<OpenedDebate> {
  const key = openKeyFor(input.thesisId, input.checked.fileHash);

  const existing = await prisma.debateSession.findUnique({
    where: { openKey: key },
    select: { id: true },
  });
  if (existing !== null) return reviseOn(existing.id, input.rationale);

  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.debateSession.create({
        data: {
          thesisId: input.thesisId,
          researcherId: input.researcherId,
          recordFileHash: input.checked.fileHash,
          recordSnapshotId: input.checked.snapshotId,
          recordDiffId: input.checked.diffId,
          // THE THIRD KEY (document A2 :1339–:1341): set for a document and only for one — the CHECK in step 28's
          // migration holds exactly one of the three.
          recordCommitment: input.checked.kind === 'DOCUMENT' ? input.checked.commitment : null,
          openKey: key,
          status: 'OPEN',
          hasSubstance: false,
        },
        select: { id: true },
      });
      await tx.debateEvent.createMany({
        data: [
          { sessionId: session.id, type: 'DEBATE_OPENED', content: `Opened for record ${input.checked.fileHash}` },
          { sessionId: session.id, type: 'RATIONALE_SUBMITTED', content: input.rationale },
        ],
      });
      return { sessionId: session.id, existed: false };
    }, WRITE_TRANSACTION);
  } catch (err) {
    // TWO CONCURRENT OPENS ON ONE (thesis, record). `openKey`'s uniqueness is what
    // decides the race and the loser learns of it here. Caught OUTSIDE the
    // transaction, not inside: PostgreSQL aborts a transaction at its first failed
    // statement, so a catch within the callback could only roll back.
    //
    // AND IT READS `meta.target`, NEVER THE CODE ALONE: P2002 is *a* unique
    // violation, not *this* one, and the same code from another constraint
    // swallowed into "someone else opened this debate" would be a wrong answer
    // built out of a right catch.
    // `isUniqueViolation` is the ONE spelling of that reading (thesis step 22, R48 Q2).
    if (!isUniqueViolation(err, ['openKey'])) throw err;
    const raced = await prisma.debateSession.findUnique({
      where: { openKey: key },
      select: { id: true },
    });
    if (raced === null) throw err;
    return reviseOn(raced.id, input.rationale);
  }
}

/** A further rationale on a session that is already OPEN — one event, no second row. */
async function reviseOn(sessionId: string, rationale: string): Promise<OpenedDebate> {
  await prisma.debateEvent.create({
    data: { sessionId, type: 'RATIONALE_SUBMITTED', content: rationale },
  });
  return { sessionId, existed: true };
}
