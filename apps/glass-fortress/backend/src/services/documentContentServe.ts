import type { DocumentOpening } from '@prisma/client';
import { verifyTextLink, type SignedTextQuery } from '../lib/documentTextLink';
import { prisma } from '../lib/prisma';
import { readObject } from './documentBucket';
import { documentsByCommitment, type CitedDocument } from './documentCitation';
import { openingsOf, pinsOf } from './documentOpenings';
import { openingRank } from './documentPredicates';
import { documentRefusal, type ContentServeCode, type DocumentRefusal } from './documentRefusals';

// ---------------------------------------------------------------------------
// GET /api/documents/:commitment/content — docs/gf-document-flows.md A5 :1504-:1506 as ruled 2026-09-24 (Q1 of step 30's
// close); document step 34 builds its PUBLIC branch (plan :276–:277).
//
// THE SIGNED ARM (#579): with a signature `read_document` minted (`lib/documentTextLink`), serve THAT version's text
// (`?version=<hash>`), reading no caller identity — the signature proves the mint. Unchanged at step 34.
//
// THE PUBLIC BRANCH (step 34): a PINNED content version under OPENED(d) ≥ CONTENT — the text, or, where the content IS the
// bytes (§3), the bytes (§7 :783–:784). A5 :1505–:1506 as CONFORMED 2026-09-26 (the researcher's Q-H, R85): "the pinned
// content version is served" (§7 :783) — `?version=<hash>` names the pin of a citation on a version EVER published citing
// d; with none, the pin of the most recent publication citing d. CURRENT(d) is served only when it is such a pin: a reader
// checking a quoted phrase is handed the text PassageVerdict stamped, and a newer derivation is announced by the FLAG
// (§7 :855), never served in its place. Refused, in this order: NOT_PUBLIC (no document holds the name, or no publication
// opened it — one answer for both, so the branch never says which documents are held); SHED; NOT_OPENED_TO (OPENED(d) is
// PASSAGE, which serves nothing, §7 :777); NOT_PINNED (`?version` is not what was opened). OPENED(d) is
// `documentOpenings.openingsOf`'s and the pins `documentOpenings.pinsOf`'s — never re-derived. NEVER a DOC_ID or a salt:
// those ride `/bytes` alone (§7 :765–:770; A5 :1509–:1510).
// ---------------------------------------------------------------------------

/** What the public branch reads of a document once it is PUBLIC and not shed — the gate both serves pass through. */
export interface PublicDocument {
  cited: CitedDocument;
  opening: DocumentOpening;
}

/**
 * THE ONE PUBLIC GATE of the two serves (A5 :1506, :1511): NOT_PUBLIC, then SHED, else the document and OPENED(d). Each
 * serve then asks its own opening — CONTENT for `/content`, BYTES for `/bytes` — through `openingRank`, the ONE order.
 */
export async function publicDocumentOf(commitment: string): Promise<PublicDocument | DocumentRefusal<'NOT_PUBLIC' | 'SHED'>> {
  const [documents, openings] = await Promise.all([documentsByCommitment([commitment]), openingsOf([commitment])]);
  const cited = documents.get(commitment);
  const opening = openings.get(commitment)?.opened ?? null;
  if (cited === undefined || opening === null) return documentRefusal('NOT_PUBLIC', 'This document is not public.');
  if (cited.custody === 'NONE') return documentRefusal('SHED', 'This document’s content was taken back; nothing of it is served.');
  return { cited, opening };
}

/** What the public branch serves: the text, or the bytes where the content IS the bytes. */
export type ContentServed = { text: string } | { bytes: Uint8Array; mimeType: string };

export async function serveDocumentContent(query: SignedTextQuery, now: number = Date.now()): Promise<ContentServed | DocumentRefusal<ContentServeCode>> {
  if (verifyTextLink(query, now) && query.version !== undefined) {
    const version = await prisma.documentContentVersion.findUnique({
      where: { commitment_contentVersionHash: { commitment: query.commitment, contentVersionHash: query.version } },
    });
    const text = version?.text ?? null;
    // The signature proves `read_document` minted this link for a version WITH text, and versions are append-only —
    // no world before SHED (document step 35) removes one or its text.
    if (text === null) {
      throw new Error(`document content: a valid signature names ${query.commitment} @ ${query.version}, which holds no text — only SHED (document step 35) removes one`);
    }
    return { text };
  }

  const gate = await publicDocumentOf(query.commitment);
  if ('code' in gate) return gate;
  if (openingRank(gate.opening) < openingRank('CONTENT')) {
    return documentRefusal('NOT_OPENED_TO', 'This document is opened to its passages only; its content is not served.');
  }
  const { document, custody, versions } = gate.cited;
  const pins = await pinsOf(document.commitment);
  const wanted = query.version ?? pins.at(0)?.pin;
  if (wanted === undefined) {
    // PUBLIC(d) is a publication citing d (A3 :1377), and every such citation carries a pin — none is a malformed load.
    throw new Error(`document content: ${document.commitment} is opened and no published citation of it carries a pin — a malformed load`);
  }
  if (!pins.some((p) => p.pin === wanted)) {
    return documentRefusal('NOT_PINNED', 'This version is not one a published thesis cites; the document is served at the versions its citations pin.');
  }
  const pinned = versions.find((v) => v.contentVersionHash === wanted);
  if (pinned === undefined) {
    // A pin names a version the version write found stored, and versions are append-only (§3 :271–:275).
    throw new Error(`document content: ${document.commitment}'s citation pins ${wanted}, which is not among its versions — a malformed row`);
  }
  if (pinned.text !== null) return { text: pinned.text };
  // THE CONTENT IS THE BYTES (§3). Only a HELD document holds any; a sealed one's plaintext existed once, at receipt.
  if (custody !== 'HELD' || document.bytes === null) {
    throw new Error(`document content: sealed document ${document.commitment} has no computed text and no bytes anywhere — a world step 32's door creates`);
  }
  return { bytes: await heldBytesOf(document.commitment, document.bytes), mimeType: document.mimeType };
}

/**
 * A HELD document's object — LOUD where it is missing (S6, R85): the write held `sha256(bytes) = docId` (A3 :1361; A4
 * :1404 NAME_MISMATCH) and `document-recomputable` lists a row whose object is gone (A7 :1549–:1552). Answering NOT_HELD
 * would be a false word about custody. `readObject` answers null for an absent key through storage's own `exists()`
 * (measured read-only on staging, R85 chunk 4b) and throws on any other storage failure.
 */
export async function heldBytesOf(commitment: string, key: string): Promise<Uint8Array> {
  const bytes = await readObject(key);
  if (bytes === null) {
    throw new Error(`document serve: HELD document ${commitment} holds no object under its key — a malformed row, which forensics:audit-documents lists`);
  }
  return bytes;
}
