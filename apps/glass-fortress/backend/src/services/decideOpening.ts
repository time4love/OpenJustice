import type { DocumentOpening } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/uniqueViolation';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { documentShedNotBuilt, documentsByCommitment } from './documentCitation';
import { openingsOf } from './documentOpenings';
import { openingRank } from './documentPredicates';
import { documentRefusal, NO_RESEARCHER, type DocumentRefusal } from './documentRefusals';

// ---------------------------------------------------------------------------
// decide_opening({ thesisId, commitment, opening, expectedSequence }) — WRITE. docs/gf-document-flows.md A4 :1443–:1446,
// §7 :772–:809, A2 :1307–:1311; document plan step 34 :266–:268.
//
// "Appends DocumentOpeningDecision; in force from the next publish_thesis of a version that cites it" (A4 :1444 as
// CONFORMED 2026-09-26, the researcher's Q14). What publication opens of a document is the
// researcher's decision, per document, having read it (§7 :756–:760); this act RECORDS it, attributed, and opens nothing
// now — the publication does (thesis T5). The refusals, in the order they are decided:
//
//   NO_RESEARCHER    no identity
//   NOT_AUTHOR       the thesis is not the caller's — or there is no such thesis: A4 :1445's set names no NO_THESIS,
//                    and "no thesis of yours" is the same answer to the caller (DECIDE_OPENING_REFUSALS, six)
//   NOT_CITED        the HEAD does not mention the document — an opening decides nothing about an uncited one
//   NOT_HELD         BYTES on a SEALED document, which has no bytes anywhere (§7 :787)
//   CANNOT_NARROW    below OPENED(d) — opening only widens (§7 :797–:801); OPENED(d) is `documentOpenings`', CALLED
//   STALE_SEQUENCE   the thesis's decision log for this document moved since the caller read it
//
// DERIVED OUTSIDE, WRITTEN INSIDE: every read above is made before the transaction opens, so the 5 s window holds only
// the compare-and-set and the one insert (memory: the window). `last + 1` is computed from the read inside, never from
// `expectedSequence`, and a unique violation on (thesisId, commitment, sequence) is the race the compare-and-set lost —
// the same shape as `review_evidence`'s (reviewEvidence.ts, `commit`).
// ---------------------------------------------------------------------------

export type DecideOpeningCode = 'NO_RESEARCHER' | 'NOT_AUTHOR' | 'NOT_CITED' | 'NOT_HELD' | 'CANNOT_NARROW' | 'STALE_SEQUENCE';

export interface DecideOpeningInput {
  thesisId: string;
  commitment: string;
  opening: DocumentOpening;
  expectedSequence: number;
}

export interface OpeningDecided {
  thesisId: string;
  commitment: string;
  opening: DocumentOpening;
  sequence: number;
  /** A4 :1444 — recorded now, in force at the next `publish_thesis` of a version that cites the document, never before. */
  inForceFrom: 'publish_thesis';
}

class StaleSequence extends Error {
  constructor(
    readonly expected: number,
    readonly found: number | null,
  ) {
    super('stale sequence');
  }
}

const refuse = (code: DecideOpeningCode, error: string): DocumentRefusal<DecideOpeningCode> => documentRefusal(code, error);

export async function decideOpening(
  input: DecideOpeningInput,
  researcherId: string | null,
): Promise<OpeningDecided | DocumentRefusal<DecideOpeningCode>> {
  if (researcherId === null) return NO_RESEARCHER();

  const thesis = await prisma.thesis.findUnique({ where: { id: input.thesisId }, select: { createdById: true, headVersionId: true } });
  if (thesis?.createdById !== researcherId) {
    return refuse('NOT_AUTHOR', `No thesis ${input.thesisId} of yours. What publication opens of a document is decided by the thesis's author.`);
  }
  const head = thesis.headVersionId;
  if (head === null) {
    throw new Error(`decideOpening: thesis ${input.thesisId} has no head version — a malformed thesis, not a refusal.`);
  }

  const mentioned = await prisma.thesisMention.findMany({
    where: { versionId: head, kind: 'DOCUMENT', name: input.commitment },
    select: { name: true },
  });
  if (mentioned.length === 0) {
    return refuse(
      'NOT_CITED',
      `The head version of thesis ${input.thesisId} does not cite #doc_${input.commitment}. An opening decides what publication opens of a document the thesis cites; cite it first.`,
    );
  }

  const cited = (await documentsByCommitment([input.commitment])).get(input.commitment);
  if (cited === undefined) {
    // The version write resolves every #doc_ token through the same loader, so a head citing no document is malformed.
    throw new Error(`decideOpening: the head of ${input.thesisId} cites ${input.commitment}, which no document holds — a malformed version.`);
  }
  if (cited.custody === 'NONE') throw documentShedNotBuilt(input.commitment);
  if (input.opening === 'BYTES' && cited.custody === 'SEALED') {
    return refuse(
      'NOT_HELD',
      `#doc_${input.commitment} is SEALED: the platform holds no bytes of it anywhere, so BYTES cannot be opened. PASSAGE or CONTENT can.`,
    );
  }

  const inForce = (await openingsOf([input.commitment])).get(input.commitment)?.opened ?? null;
  if (inForce !== null && openingRank(input.opening) < openingRank(inForce)) {
    return refuse(
      'CANNOT_NARROW',
      `#doc_${input.commitment} is already opened to ${inForce} by a publication, and opening only widens: what the public has read, it has read. ${input.opening} is narrower.`,
    );
  }

  try {
    const sequence = await prisma.$transaction(async (tx) => {
      const log = await tx.documentOpeningDecision.findMany({
        where: { thesisId: input.thesisId, commitment: input.commitment },
        select: { sequence: true },
      });
      const last = log.reduce((max, d) => Math.max(max, d.sequence), 0);
      if (last !== input.expectedSequence) throw new StaleSequence(input.expectedSequence, last);
      try {
        await tx.documentOpeningDecision.create({
          data: { thesisId: input.thesisId, commitment: input.commitment, sequence: last + 1, opening: input.opening, researcherId },
        });
      } catch (err) {
        // A P2002 on the (thesisId, commitment, sequence) key AND NOTHING ELSE — the ONE spelling (thesis step 22, R18).
        if (!isUniqueViolation(err, ['thesisId', 'commitment', 'sequence'])) throw err;
        throw new StaleSequence(input.expectedSequence, null);
      }
      return last + 1;
    }, WRITE_TRANSACTION);
    return { thesisId: input.thesisId, commitment: input.commitment, opening: input.opening, sequence, inForceFrom: 'publish_thesis' };
  } catch (err) {
    if (!(err instanceof StaleSequence)) throw err;
    return refuse(
      'STALE_SEQUENCE',
      `The openings of #doc_${input.commitment} on thesis ${input.thesisId} moved: you sent expectedSequence ${String(err.expected)}` +
        (err.found === null ? ', and another decision was written at the same moment.' : `, and the log is at ${String(err.found)}.`) +
        ' Nothing was written; read the thesis again.',
    );
  }
}
