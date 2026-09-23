import { Prisma, type DocumentContentVersion, type DocumentDerivedFrom } from '@prisma/client';
import { z } from 'zod';
import { contentVersionHashOf } from '../lib/documentIdentity';
import { CURRENT_EXTRACTOR, extract } from '../lib/documentExtractor';

// ---------------------------------------------------------------------------
// `DocumentContentVersion`'s ONE WRITER — plan step 29 :158-:161, A2 :1296-:1305.
//
// CONTENT IS A VERSION, APPEND-ONLY, AND THE NAME NEVER MOVES (§3 :271-:275). Two
// acts write this table and nothing else does: DERIVATION, which appends a version
// of the COMPUTED register, and a model's READING, which appends an OPINION beside
// an existing one. They are separated here because they are separated in the
// design: one is reproducible from the bytes and is what a citation pins, the other
// is a model's and is never pinned, never cited and never published (§3 :291-:296).
//
// DERIVATION HAPPENS OUTSIDE THE TRANSACTION, AND THE SUITE CANNOT SEE THAT.
// Prisma's interactive transaction closes after five seconds by default and a
// workbook's cell walk is not free; the 2026-09-06 failure that made this a rule
// was seventeen round trips inside one window, and no test can observe it because
// the suite mocks Prisma. So `deriveContent` is a PURE function the caller runs
// BEFORE it opens a transaction, and `recordContentVersion` does one write.
//
// A RE-DERIVATION WITH IDENTICAL TEXT IS NOT A NEW ROW (§3 :316-:317, A2 :1304).
// That is held by `@@unique([commitment, contentVersionHash])` in the schema rather
// than by this function remembering to check: the writer asks for the row and takes
// the one that is already there, so two derivations that agree cannot produce two
// versions even if they race.
// ---------------------------------------------------------------------------

/** What a derivation produced, before anything is written. */
export interface DerivedContent {
  /** The COMPUTED text, or null when the content IS the bytes (§3 :284). */
  text: string | null;
  contentVersionHash: string;
  /** Provenance: what read the bytes, and at which version (§3 :296-:297). */
  extractor: string;
  extractorVersion: string;
  /** The reader was SELECTED and THREW (A2 :1300) — not "found no text". */
  readFailed: boolean;
  derivedFrom: DocumentDerivedFrom;
}

/**
 * The extractor's answer, as a version — PURE, and run OUTSIDE the transaction.
 *
 * `docId` is passed because the bytes-only arm's hash IS the document's own name
 * (A1 :1242-:1243): where no text was computed there is nothing to hash but the
 * bytes, and their hash is already known rather than recomputed here.
 *
 * IT ALWAYS PRODUCES A VERSION, AND THAT IS THE RULING OF 2026-09-23. Round 1
 * returned null when `CURRENT_EXTRACTOR` was null — the honest answer while nothing
 * was chosen, because `extractorVersion` is PROVENANCE and a row claiming to have
 * been read by an extractor nobody chose is fabricated provenance. The researcher has
 * now ruled (`docs/gf-extractor-ruling-2026-09-23.md`), the constant is set, and that
 * arm can never be taken again — so it is GONE rather than left as a branch no
 * instrument can see. A document whose bytes yield no text still gets a version: its
 * text is null and its `contentVersionHash` IS the document's own name (A1 :1242-:1243),
 * which is what §3 :284's bytes-only arm means.
 */
export async function deriveContent(
  bytes: Uint8Array,
  mimeType: string,
  docId: string,
  derivedFrom: DocumentDerivedFrom,
): Promise<DerivedContent> {
  const extraction = await extract(bytes, mimeType);
  return {
    text: extraction.text,
    contentVersionHash: contentVersionHashOf(extraction.text, docId),
    extractor: extraction.extractor ?? extraction.readerClass,
    extractorVersion: CURRENT_EXTRACTOR,
    readFailed: extraction.readFailed,
    derivedFrom,
  };
}

/**
 * Append a content version, or record that this extractor REPRODUCED the one that exists.
 *
 * ONE WRITE, and it takes a transaction client so a caller writing a Document and
 * its first version does both in one transaction. It creates no ROW when the
 * content is unchanged: `@@unique([commitment, contentVersionHash])` means a
 * re-derivation that agrees finds the existing row (§3 :316-:317).
 *
 * BUT IT IS NOT A NO-OP — RULED BY THE RESEARCHER 2026-09-23 (A2 :1300, A3 :1368).
 * The row that already holds this content gains today's extractor in `derivedUnder`,
 * the append-only list of every version that REPRODUCED this exact text, and
 * `CURRENT(d)` reads MEMBERSHIP of that list. Without the append, a held document
 * whose text a new extractor reproduces has no row carrying the new version, reads
 * AWAITING_DERIVATION forever while the pass reports UNCHANGED, and becomes
 * permanently uncitable under A6 :1531's hard check.
 *
 * THE APPEND LIVES IN THE ONE WRITER RATHER THAN IN THE PASS, for the reason the
 * header already gives about `@@unique`: this table has ONE writer (plan :158-:161),
 * and a caller issuing its own `update` would be a second one. It is also why
 * `add_document` inherits the behaviour without knowing about it.
 *
 * `extractorVersion` IS NEVER OVERWRITTEN. It names the extractor that produced this
 * text FIRST — provenance, not a pointer — and the list is what moves.
 *
 * IT WRITES NO OPINION. The OPINION register has its own writer below, because a
 * model's reading is a different register on the same row and folding the two into
 * one call would let a derivation carry a model's words by accident.
 */
export async function recordContentVersion(
  tx: Prisma.TransactionClient,
  commitment: string,
  derived: DerivedContent,
): Promise<DocumentContentVersion> {
  const existing = await tx.documentContentVersion.findUnique({
    where: {
      commitment_contentVersionHash: {
        commitment,
        contentVersionHash: derived.contentVersionHash,
      },
    },
  });
  if (existing !== null) {
    // APPEND-ONLY IS NOT APPEND-AGAIN: the list is the SET of versions that reproduced
    // this text, so a pass run twice must not grow it.
    if (existing.derivedUnder.includes(derived.extractorVersion)) return existing;
    return tx.documentContentVersion.update({
      where: { id: existing.id },
      data: { derivedUnder: [...existing.derivedUnder, derived.extractorVersion] },
    });
  }
  return tx.documentContentVersion.create({
    data: {
      commitment,
      text: derived.text,
      contentVersionHash: derived.contentVersionHash,
      extractor: derived.extractor,
      extractorVersion: derived.extractorVersion,
      // The version that produced it is the first that reproduced it, by construction.
      derivedUnder: [derived.extractorVersion],
      readFailed: derived.readFailed,
      derivedFrom: derived.derivedFrom,
    },
  });
}

// ---------------------------------------------------------------------------
// THE OPINION REGISTER — §3 :293-:296, and COMPLIANCE.md rule 3.
//
// TWO WRITERS AND NO MORE (plan :161-:162): the RECEIPT'S ONE READ of a sealed
// document, which is the only moment its plaintext exists (step 32), and
// `describe_document`, a paid call on the researcher's word (step 30). Both write
// through the one function below, so neither can record a reading that is not
// labelled.
//
// THE LABEL IS NOT OPTIONAL AND IS NOT A UI CONCERN. COMPLIANCE.md rule 3 requires
// every AI-generated section to carry its label, and a reading stored without its
// model and prompt version is a reading no surface can label later — the fact is
// gone by then. So the schema of the stored value REQUIRES both, and a reading that
// arrives without them is REFUSED here rather than written and apologised for.
// ---------------------------------------------------------------------------

/**
 * A model's reading of a document, as it is stored.
 *
 * ZOD BECAUSE IT IS A MODEL'S OUTPUT, which the house validates at its boundary
 * without exception. The fields beyond the label are the ones §3 :294-:295 names —
 * a transcription, a summary, a date, the actors, a category — and each is optional
 * because a model that could not read one must be able to say so rather than invent
 * it; what is NOT optional is who produced the reading.
 */
export const documentOpinion = z.object({
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  transcription: z.string().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  date: z.string().optional(),
  actors: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
});

export type DocumentOpinion = z.infer<typeof documentOpinion>;

/**
 * Append a model's reading to a version — the OPINION register's one write path.
 *
 * IT REPLACES THE VERSION'S OPINION AND MOVES NO HASH. `contentVersionHash` is over
 * the COMPUTED text alone (A1 :1242): an opinion is provenance beside the version,
 * "never in the hash, never pinned, never a citation" (§3 :295-:296), so a reading
 * recorded after a citation was pinned cannot move what the citation names.
 *
 * REFUSES AN UNLABELLED READING, by parsing it. A model's words with no model
 * against them are words the platform cannot label, and rule 3 makes labelling a
 * requirement of showing them at all.
 */
export async function recordOpinion(
  tx: Prisma.TransactionClient,
  versionId: string,
  opinion: DocumentOpinion,
): Promise<DocumentContentVersion> {
  const labelled = documentOpinion.parse(opinion);
  return tx.documentContentVersion.update({
    where: { id: versionId },
    data: { opinion: labelled },
  });
}
