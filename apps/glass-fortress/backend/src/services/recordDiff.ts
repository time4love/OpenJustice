import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
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
 */
export interface DiffWrite extends DiffClassification {
  trackedUrlId: string;
  beforeSnapshotId: string;
  afterSnapshotId: string;
  before: DiffText;
  after: DiffText;
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

/** The columns the writer reads off each stored capture of the pair. */
const PAIR_SELECT = {
  id: true,
  text: true,
  textHash: true,
  textExtractionVersion: true,
  snapshotDate: true,
  snapshotUrl: true,
} as const;

interface StoredSide {
  id: string;
  text: string;
  textHash: string;
  textExtractionVersion: string;
  snapshotDate: string;
  snapshotUrl: string;
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
  const survivalOf = (side: ContentChunk['side'], text: string): SurvivalVerdict =>
    checkDiffSurvival({
      rawDeletedText: side === 'REMOVED' ? JSON.stringify([text]) : '[]',
      rawAddedText: side === 'ADDED' ? JSON.stringify([text]) : '[]',
      beforeText: before.text,
      afterText: after.text,
      beforeVersion: before.textExtractionVersion,
      afterVersion: after.textExtractionVersion,
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
          classification: asJsonColumn(classification),
          survivalVersion: SURVIVAL_CHECK_VERSION,
        },
      ],
      skipDuplicates: true,
    });
    return { id: pair.id, contentVersionHash: hash, created: version.count === 1 };
  };
  return tx === undefined ? prisma.$transaction(writeIn, WRITE_TRANSACTION) : writeIn(tx);
}
