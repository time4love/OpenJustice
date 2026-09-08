import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { captureHtml, deriveTextFromHtml, TEXT_EXTRACTION_VERSION } from '../lib/captureDocument';
import { diffChunkPair } from '../lib/diffChunking';
import { checkDiffSurvival, SURVIVAL_CHECK_VERSION, type SurvivalVerdict } from '../lib/diffSurvival';
import { DIFF_VERSION } from '../lib/diffVersion';
import { asJsonColumn } from '../lib/jsonColumn';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import type { ForensicOutput } from './ForensicAgent';

// ---------------------------------------------------------------------------
// THE ONE WAY A DIFF IS WRITTEN — in its target shape (docs/gf-evidence-flows.md
// §3, A1, A2; refactor plan §3 step 5, rewritten outright at the switch).
//
// A DIFF IS THE PAIR IT SPANS, AND ITS CONTENT IS A VERSION. `UrlVersionDiff`
// is the two snapshot ids — its unique key, and now its whole identity; it is
// created once per pair and never rewritten. What the walk derives from the two
// texts — the chunks, each chunk's survival against the documents, and the
// classifier's opinion — is a `DiffContentVersion`, one row per DISTINCT
// content, named by what it contains: `contentVersionHash` is A1's sha256 over
// the chunks alone, with no survival, no opinion and no version label in it.
// So a re-derivation that yields the same chunks writes nothing, and a changed
// opinion never moves a citation.
//
// WHY THIS REPLACES AN UPSERT THAT OVERWROTE. The old writer upserted every
// column by pair, so a re-derivation replaced the chunks and the verdict a
// thesis had cited — finding 27, `rediffFromSnapshots` moving verdicts under
// promoted records. Versions are append-only; the pair's legacy content columns
// stay unwritten here (their defaults) until evidence step 11 drops them.
//
// TWO REGISTERS, ONE PINNED (Level 8). `chunks` are COMPUTED from the texts and
// the documents; `classification` is a model's draw about them, stored whole
// with its provenance — version, model, prompt hash, draws — and labelled as
// opinion by the column it lives in.
//
// SURVIVAL PER CHUNK, THROUGH THE ONE CHECKER. `checkDiffSurvival` is Level 5's
// single implementation of "does a reported change survive the documents"; it
// is asked once per chunk here, against the texts the two snapshots HOLD — read
// from the database, never taken from the caller — so the verdict is
// re-derivable from stored state. The caller's texts are what the chunks are cut
// from, and a loud guard holds that they are the stored ones: a diff computed
// over text the corpus does not hold would be a claim about nothing.
//
// ENFORCED BY SOURCE SCANS, not by this comment: `urlVersionDiff.create` and
// `urlVersionDiff.upsert` may appear in this file and nowhere else
// (test/diffSingleWriter.test.ts), and the walk reaches this function from
// exactly one site (test/walk/diffOneSite.test.ts).
// ---------------------------------------------------------------------------

/** One side of the pair as the walk compared it: the capture and the text it derived. */
export interface DiffText {
  waybackTimestamp: string;
  text: string;
  textHash: string;
}

/**
 * Where the classifier's output came from — the OPINION register's provenance,
 * stored beside the output so a row judged by one model under one prompt can
 * be told from a row judged by another (A2).
 */
export interface ClassifierProvenance {
  classifierVersion: string;
  /** The input rule the model READ — the chunks it was handed were cut under it (test/classificationProvenance.test.ts). */
  classifiedInputVersion: string;
  classifierModel: string;
  classifierPromptHash: string;
  summaryVersion: string;
}

/** The classifier's whole answer for this content, with its provenance: what `classification` holds. */
export type DiffClassification = ForensicOutput & ClassifierProvenance;

/**
 * A diff write. The pair, the two texts it was computed over, and the
 * classification — spread at the top level, so `editorial` (Gate 5's answer)
 * sits beside the pair it was given for, which is the shape the acceptance
 * suite fixes for the walk's one call.
 *
 * THE CLASSIFICATION IS OPTIONAL (2026-09-08): a diff with no chunk on either
 * side has nothing to classify, so the walk makes no draw for it and hands none
 * here, and the version is written with `classification` NULL — the state A2
 * already defines as "NULL when nothing classified this derivation" and which
 * nothing produced until now. Evidence A4 refuses NOTHING_TO_PROMOTE for such a
 * diff, so the two halves of the design now agree: an empty diff is evidence of
 * nothing, and nobody pays a model to say so.
 */
export interface DiffWrite extends Partial<DiffClassification> {
  trackedUrlId: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
  before: DiffText;
  after: DiffText;
}

/**
 * Every key of `DiffClassification`, listed once so the check below cannot drift
 * from the type. A key added to the type and forgotten here would let a write
 * missing it pass as whole — so this list is the one place that says what whole
 * means, and `satisfies` holds it to the type at compile time.
 */
const CLASSIFICATION_KEYS = [
  'deletedItems',
  'addedItems',
  'legalSignificance',
  'investigativeCategories',
  'isLegallySignificant',
  'editorial',
  'editorialReason',
  'coverage',
  'draws',
  'classifierVersion',
  'classifiedInputVersion',
  'classifierModel',
  'classifierPromptHash',
  'summaryVersion',
] as const satisfies readonly (keyof DiffClassification)[];

/**
 * THE CLASSIFICATION IS WHOLE OR ABSENT (2026-09-08). Making it optional so an
 * empty diff can be written without one also made a HALF classification
 * expressible, and half is the worst of the three states: a version carrying
 * `editorial` with no `classifierVersion` beside it stores a verdict with no way
 * to say which model under which prompt gave it, which is the provenance A2
 * exists to keep — and the row would be indistinguishable from one properly
 * judged. Absent is a FACT ("nothing classified this derivation"); whole is a
 * judgement with its provenance; between them is nothing the design names.
 *
 * A WALK DEFECT, so it THROWS naming what is missing, as `matchedNodes`,
 * `bytesOf` and Gate 4 do. A refusal would tell the caller the diff was
 * unwritable; the truth is that the caller built something the design has no
 * state for.
 */
function assertWholeOrAbsent(classification: Partial<DiffClassification>): void {
  const present = CLASSIFICATION_KEYS.filter((key) => classification[key] !== undefined);
  if (present.length === 0 || present.length === CLASSIFICATION_KEYS.length) return;
  const missing = CLASSIFICATION_KEYS.filter((key) => classification[key] === undefined);
  throw new Error(
    `Walk defect: recordDiff was given a HALF classification — ${String(present.length)} of ` +
      `${String(CLASSIFICATION_KEYS.length)} keys, missing ${missing.join(', ')}. A classification is whole ` +
      'or absent: absent says nothing classified this derivation, whole carries the provenance that says ' +
      'which model under which prompt judged it.',
  );
}

export interface WrittenDiff {
  /** The pair's id. */
  id: string;
  contentVersionHash: string;
  /** False when this content already existed as a version of the pair: nothing was written for it. */
  created: boolean;
}

/** A chunk of the content, as the differ emitted it and as the version stores it. */
interface ContentChunk {
  side: 'REMOVED' | 'ADDED';
  text: string;
  survival: SurvivalVerdict;
}

/**
 * A1's `contentVersionHash`: sha256 over the UTF-8 of the JSON of
 * `[{ side, text } …]` — the differ's raw segments in the differ's output
 * order, removed then added, the text as the differ emits it. Nothing else:
 * not survival, not opinion, not a version label. Bare lowercase hex, the
 * spelling every hash column of the corpus stores (`textHash`, its sibling
 * content version, included); `0x` is the display form.
 */
export function contentVersionHash(chunks: readonly { side: 'REMOVED' | 'ADDED'; text: string }[]): string {
  const named = chunks.map(({ side, text }) => ({ side, text }));
  return createHash('sha256').update(JSON.stringify(named), 'utf8').digest('hex');
}

/** The columns the writer reads off each stored capture of the pair — its text, and the document the text was cut from. */
const PAIR_SELECT = {
  id: true,
  text: true,
  textHash: true,
  snapshotDate: true,
  snapshotUrl: true,
  document: true,
  documentContentType: true,
  documentContentEncoding: true,
} as const;

interface StoredSide {
  id: string;
  text: string;
  textHash: string;
  snapshotDate: string;
  snapshotUrl: string;
  document: Uint8Array;
  documentContentType: string | null;
  documentContentEncoding: string | null;
}

/**
 * THE DOCUMENT'S OWN TEXT — the page as served, html-to-text with no rule
 * applied (F2, 2026-09-07; evidence flows §3: survival is "against the raw
 * documents"). Survival checked against the other side's rule-cut text called
 * a rule-induced removal SURVIVES; against the document it is CONTRADICTED.
 */
function documentText(side: StoredSide): string {
  return deriveTextFromHtml(
    captureHtml({
      document: Buffer.from(side.document),
      documentContentType: side.documentContentType,
      documentContentEncoding: side.documentContentEncoding,
    }),
  ).text;
}

/**
 * Both captures of the pair, as stored. A side the corpus does not hold, or
 * holds under a different text than the walk compared, is a walk defect: a diff
 * spans two stored texts, and its chunks must be cut from exactly those.
 */
async function storedPair(
  input: DiffWrite,
  client: Prisma.TransactionClient | typeof prisma,
): Promise<{ before: StoredSide; after: StoredSide }> {
  // Read through the caller's transaction when there is one: inside a
  // supersession the snapshot's text has just moved on that client, and the
  // guard below must see the text the version is being cut from.
  const rows = await client.urlSnapshot.findMany({
    where: { id: { in: [input.beforeSnapshotId, input.afterSnapshotId] } },
    select: PAIR_SELECT,
  });
  const sideOf = (snapshotId: string, compared: DiffText): StoredSide => {
    const stored = rows.find((row) => row.id === snapshotId);
    if (stored === undefined) {
      throw new Error(`recordDiff: capture ${compared.waybackTimestamp} names snapshot ${snapshotId}, which is not stored.`);
    }
    if (stored.textHash !== compared.textHash) {
      throw new Error(
        `recordDiff: capture ${compared.waybackTimestamp} was compared as textHash ${compared.textHash}, ` +
          `but snapshot ${snapshotId} holds ${stored.textHash}. A diff is cut from the texts the corpus holds.`,
      );
    }
    return stored;
  };
  return { before: sideOf(input.beforeSnapshotId, input.before), after: sideOf(input.afterSnapshotId, input.after) };
}

/**
 * Every chunk of the content with its own survival verdict, in the differ's
 * order. One call of the one checker per chunk: a chunk claimed REMOVED must be
 * absent from the after document, a chunk claimed ADDED absent from the before
 * one, and two captures extracted under different rules make every chunk
 * UNCHECKABLE — the checker's own rule, unchanged.
 */
function chunksWithSurvival(before: StoredSide, after: StoredSide, input: DiffWrite): ContentChunk[] {
  const cut = diffChunkPair(input.before.text, input.after.text);
  // Both documents' own text, derived once under the current extractor — the
  // same pipeline on both sides, so the checker's extractor comparison is
  // satisfied by construction and every chunk is held to the pages themselves.
  const beforeDocument = documentText(before);
  const afterDocument = documentText(after);
  const survivalOf = (side: ContentChunk['side'], text: string): SurvivalVerdict =>
    checkDiffSurvival({
      rawDeletedText: side === 'REMOVED' ? JSON.stringify([text]) : '[]',
      rawAddedText: side === 'ADDED' ? JSON.stringify([text]) : '[]',
      beforeText: beforeDocument,
      afterText: afterDocument,
      beforeVersion: TEXT_EXTRACTION_VERSION,
      afterVersion: TEXT_EXTRACTION_VERSION,
    }).verdict;
  return [
    ...cut.removed.map((text): ContentChunk => ({ side: 'REMOVED', text, survival: survivalOf('REMOVED', text) })),
    ...cut.added.map((text): ContentChunk => ({ side: 'ADDED', text, survival: survivalOf('ADDED', text) })),
  ];
}

/**
 * Write a diff: the pair, created once and reused, and its content as a version
 * unless that exact content already exists.
 *
 * A DIFF SPANS TWO CAPTURES. A row whose two sides are the same capture
 * describes a transition that did not happen and is unfalsifiable by
 * construction — a document always contains itself — so it throws rather than
 * being written: anything reaching this line paired a capture with itself by a
 * route nobody anticipated, and swallowing it would let the next such route
 * write silently.
 *
 * One transaction, two writes: the pair's upsert (create, or nothing) and the
 * version's `createMany` with `skipDuplicates` — one statement whose count says
 * whether this content was new, so "a re-derivation whose hash exists writes
 * nothing" is the index's answer, not a read-then-write race.
 */
export async function recordDiff(input: DiffWrite, tx?: Prisma.TransactionClient): Promise<WrittenDiff> {
  if (input.beforeSnapshotId === input.afterSnapshotId) {
    throw new Error(
      `recordDiff: refusing a diff whose two sides are the same capture ` +
        `(${input.beforeSnapshotId}). A diff spans a transition between two captures; ` +
        'a capture compared against itself is not one.',
    );
  }

  const { trackedUrlId, beforeSnapshotId, afterSnapshotId, before, after, ...classification } = input;
  assertWholeOrAbsent(classification);
  const stored = await storedPair(input, tx ?? prisma);
  const chunks = chunksWithSurvival(stored.before, stored.after, input);
  const hash = contentVersionHash(chunks);

  // THE CALLER'S TRANSACTION, WHEN IT HAS ONE (step 7). A supersession
  // re-derives every diff spanning the superseded text in the SAME transaction
  // as the text version and the snapshot's new text (evidence flows §3), so the
  // walk hands its client in and this opens none; the acquisition's diff, with
  // no transaction to join, gets its own under the shared window.
  const writeIn = async (client: Prisma.TransactionClient): Promise<WrittenDiff> => {
    const pair = await client.urlVersionDiff.upsert({
      where: { beforeSnapshotId_afterSnapshotId: { beforeSnapshotId, afterSnapshotId } },
      // The pair, and the three legacy NOT NULL columns filled from the
      // captures; every other legacy column keeps its default — the content is
      // the version's.
      create: {
        trackedUrlId,
        beforeSnapshotId,
        afterSnapshotId,
        beforeDate: stored.before.snapshotDate,
        afterDate: stored.after.snapshotDate,
        snapshotUrl: stored.after.snapshotUrl,
      },
      update: {},
      select: { id: true },
    });
    const version = await client.diffContentVersion.createMany({
      data: [
        {
          diffId: pair.id,
          beforeTextHash: before.textHash,
          afterTextHash: after.textHash,
          diffVersion: DIFF_VERSION,
          chunks: asJsonColumn(chunks),
          contentVersionHash: hash,
          // SQL NULL, not `{}`: an empty object would read as "a classifier
          // answered and said nothing", which is a different fact.
          classification: Object.keys(classification).length === 0 ? Prisma.DbNull : asJsonColumn(classification),
          survivalVersion: SURVIVAL_CHECK_VERSION,
        },
      ],
      skipDuplicates: true,
    });
    return { id: pair.id, contentVersionHash: hash, created: version.count === 1 };
  };
  return tx === undefined ? prisma.$transaction(writeIn, WRITE_TRANSACTION) : writeIn(tx);
}
