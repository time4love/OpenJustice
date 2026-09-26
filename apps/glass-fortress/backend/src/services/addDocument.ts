import { randomBytes } from 'node:crypto';
import type { Document, DocumentContentVersion, Prisma } from '@prisma/client';
import { isAccepted, TOO_LARGE_BYTES } from '../lib/acceptedDocumentTypes';
import { CURRENT_EXTRACTOR } from '../lib/documentExtractor';
import { commitment as commitmentOf, docId as docIdOf } from '../lib/documentIdentity';
import { prisma } from '../lib/prisma';
import { WRITE_TRANSACTION } from '../walk/pageLog';
import { anchorDocument, anchoredOf, type AnchorableDocument } from './anchorDocuments';
import { openDocumentRegistryWindow } from './anchorSnapshots';
import { readObject, statObject } from './documentBucket';
import { capturesEqualTo } from './documentCaptures';
import { deriveContent, recordContentVersion, type DerivedContent } from './documentContentVersions';
import { currentVersion } from './documentPredicates';
import { documentRefusal, NO_RESEARCHER, type DocumentRefusal } from './documentRefusals';

// ---------------------------------------------------------------------------
// add_document — THE RESEARCHER'S DOOR. docs/gf-document-flows.md §9 :998-:1017, A4
// :1404-:1411 as ruled 2026-09-22 and 2026-09-23; plan step 30 :175-:182.
//
// THE ONE ATTRIBUTED ACT OF THE DOOR. The upload dialog put the file in the bucket under its
// DOC_ID (§9 :998); this call NAMES that object, reads it, recomputes its name, derives its
// content, and writes the Document and a RESEARCHER Arrival. It never receives bytes, so the
// backend's JSON limit is irrelevant and TOO_LARGE is the OBJECT'S OWN SIZE (A4 :1404).
//
// THE TRANSACTION BOUNDARY (sketch (b)). Every refusal, the bucket read, the hash and the
// derivation run OUTSIDE the transaction: a 50 MB download and a PDF's text-layer read are
// seconds of work, Prisma's interactive window is 5 s and the suite cannot see it
// (`gf-prisma-transaction-window`), and nothing inside depends on anything the read could change
// — the object under a DOC_ID key is content-addressed. Inside: a handful of writes, no loop.
// A race between two arrivals of the same bytes is settled by `Document.docId`'s `@id`: the
// loser meets the unique violation and is answered as the second arrival it is.
//
// A KNOWN DOC_ID — A2 :1271 and A4 :1409 as RULED 2026-09-23: the row's four assertions are
// written ONCE, by the FIRST researcher arrival. A later call is recorded (an Arrival,
// attributed) and changes none of them; every value it gave that differs is answered as
// IGNORED — never stored, never silently dropped.
//
// THE ANCHOR AT RECEIPT — plan step 31 :195–:196; relay item 8 as ruled 2026-09-24. The FIRST
// arrival — the call that creates the row — anchors the commitment through the one
// document-anchoring function, AFTER the receipt's transaction has committed: a chain call is never
// inside a transaction, and a receipt is never refused for the chain. EVERY failure completes the
// receipt OWED, logged; the standing pass pays it. A LATER arrival writes nothing to the chain — "what
// closes it is the pass" (§4 :448). Every answer READS `anchored` from chain state (A3 :1366), never
// assumes it; nothing about the anchor is stored.
// ---------------------------------------------------------------------------

export interface AddDocumentArgs {
  docId?: string;
  title?: string;
  mimeType?: string;
  assertedUrl?: string;
  /** `YYYY-MM-DD` — the day the page is said to have shown these bytes. */
  assertedAt?: string;
  /** The COMMITMENT of the document this one is a redaction or transcription of (§7, §9 :1013). */
  derivedFrom?: string;
}

/** The four assertions as the ROW holds them — the first researcher arrival's (A2 :1271 as ruled). */
export interface Assertions {
  title: string | null;
  assertedUrl: string | null;
  /** `YYYY-MM-DD`, the day as asserted — a date, never an instant. */
  assertedAt: string | null;
  derivedFrom: { commitment: string; title: string | null } | null;
}

/** The values a call gave that differ from the stored ones — A4 :1409 as ruled. */
export type Ignored = Partial<Record<'title' | 'assertedUrl' | 'assertedAt' | 'derivedFrom' | 'mimeType', string>>;

export interface AddDocumentAnswer {
  commitment: string;
  docId: string;
  custody: 'HELD';
  /**
   * The derived version's HASH, or null while the derivation is owed (A4 :1407-:1409). NEVER its text — RULED
   * 2026-09-23 (F1 ruling 1): a write's answer is the RECEIPT of the act, and the content is `read_document`'s. A real
   * spreadsheet's text inline blew the client's result cap and cut every field after it.
   */
  content: { contentVersionHash: string } | null;
  /** ANCHORED(d), A3 :1366 — READ from chain state for this answer; false while owed. */
  anchored: boolean;
  equalsCapture: { url: string; capture: string } | null;
  existed: boolean;
  assertions: Assertions;
  ignored: Ignored;
}

/** A DOC_ID as `docId()` prints it — `0x` + 64 lowercase hex (A1 :1244). Anything else names no object. */
const DOC_ID = /^0x[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayOf = (at: Date | null): string | null => (at === null ? null : at.toISOString().slice(0, 10));

export async function addDocument(
  args: AddDocumentArgs,
  researcherId: string | null,
): Promise<AddDocumentAnswer | DocumentRefusal> {
  // --- OUTSIDE: the refusals, in A4's order (sketch (b) 1-10) -----------------------------
  if (researcherId === null) return NO_RESEARCHER();
  const key = args.docId;
  if (key === undefined || !DOC_ID.test(key)) {
    return documentRefusal('NO_BYTES', 'add_document names the bucket object the upload dialog wrote, by its docId (0x + 64 hex) — none was given.');
  }
  const title = args.title?.trim() ?? '';
  if (title === '') {
    return documentRefusal('NO_TITLE', 'A document needs its title — the name a person recognises it by, approved in the conversation (A2 :1271).');
  }
  const mimeType = args.mimeType ?? '';
  if (!isAccepted(mimeType)) {
    return documentRefusal('UNSUPPORTED_TYPE', `The door accepts PDF, XLSX, CSV, image, audio and video — not "${mimeType}".`);
  }
  if (args.assertedAt !== undefined && !DAY.test(args.assertedAt)) {
    throw new Error(`add_document: assertedAt must be YYYY-MM-DD; the tool's schema lets nothing else through, and got ${JSON.stringify(args.assertedAt)}`);
  }
  if (args.assertedUrl !== undefined && (await prisma.trackedUrl.findUnique({ where: { url: args.assertedUrl } })) === null) {
    return documentRefusal('NOT_SURVEYED', `${args.assertedUrl} has not been surveyed — survey it first; a page the archive lacks is created with zero captures (§9 :1004-:1005).`);
  }
  const derivedFromRow =
    args.derivedFrom === undefined ? null : await prisma.document.findUnique({ where: { commitment: args.derivedFrom } });
  if (args.derivedFrom !== undefined && derivedFromRow === null) {
    return documentRefusal('NOT_A_DOCUMENT', `derivedFrom names no document: ${args.derivedFrom}.`);
  }
  const stat = await statObject(key);
  if (stat === null) {
    return documentRefusal('NO_BYTES', 'No object is stored under that docId — the upload did not complete, or the sweep has taken it. Upload again from the dialog.');
  }
  if (stat.size > TOO_LARGE_BYTES) {
    return documentRefusal('TOO_LARGE', `The object is ${String(stat.size)} bytes; the door takes at most ${String(TOO_LARGE_BYTES)} (50 MB).`);
  }
  const bytes = await readObject(key);
  if (bytes === null) {
    return documentRefusal('NO_BYTES', 'The object under that docId disappeared between two reads — upload again from the dialog.');
  }
  if (docIdOf(bytes) !== key) {
    return documentRefusal('NAME_MISMATCH', 'The bytes stored under that docId do not hash to it. Nothing was kept; upload the file again from the dialog.');
  }

  const call: Assertions = {
    title,
    assertedUrl: args.assertedUrl ?? null,
    assertedAt: args.assertedAt ?? null,
    derivedFrom: derivedFromRow === null ? null : { commitment: derivedFromRow.commitment, title: derivedFromRow.title },
  };

  try {
    return await receive(key, bytes, stat.size, mimeType, call, researcherId);
  } catch (error) {
    // A SECOND ARRIVAL RACED THIS ONE AND WROTE THE ROW FIRST — the same bytes are the same
    // document (§2 :211), so this call is answered as the arrival it now is.
    if (isUniqueViolation(error)) return receive(key, bytes, stat.size, mimeType, call, researcherId);
    throw error;
  }
}

async function receive(
  key: string,
  bytes: Uint8Array,
  size: number,
  mimeType: string,
  call: Assertions,
  researcherId: string,
): Promise<AddDocumentAnswer> {
  const existing = await prisma.document.findUnique({ where: { docId: key }, include: { versions: true, shed: true } });

  if (existing === null) {
    // OUTSIDE: the fresh salt, then the derivation (step 29's pure half) — in that order, because a bytes-only version
    // is named by the COMMITMENT (A1 :1243 as CONFORMED 2026-09-26, R85 Q-G), which the salt makes.
    const salt = randomBytes(32);
    const commitment = commitmentOf(key, salt);
    const derived = await deriveContent(bytes, mimeType, commitment, 'AT_RECEIPT');
    const version = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.document.create({
        data: {
          docId: key,
          commitment,
          salt,
          bytes: key,
          mimeType,
          byteLength: size,
          title: call.title,
          assertedUrl: call.assertedUrl,
          assertedAt: call.assertedAt === null ? null : new Date(`${call.assertedAt}T00:00:00.000Z`),
          derivedFromCommitment: call.derivedFrom?.commitment ?? null,
        },
      });
      await arrive(tx, commitment, researcherId);
      return recordContentVersion(tx, commitment, derived);
    }, WRITE_TRANSACTION);
    const document = { commitment, docId: key, held: true };
    return answerFor(key, commitment, version, false, call, {}, await anchorAtReceipt(document));
  }

  if (existing.bytes === null) {
    // A SEALED row arriving held (§9 :1009-:1010), or a shed one arriving again. Neither world
    // exists before step 32 (the intake receipt) and step 35 (SHED): answered loudly rather than
    // by code no world reaches.
    throw new Error(
      `add_document: ${existing.commitment} is held by no bytes (sealed or shed). A sealed document arriving held is document step 32's arm, and nothing before it can create one.`,
    );
  }

  const stored = await storedAssertions(existing);
  const ignored = ignoredOf(call, stored, mimeType, existing.mimeType);
  const current = currentVersion(existing, existing.versions, CURRENT_EXTRACTOR, existing.shed);
  // Derive only when CURRENT is owed — a document already current under this extractor has nothing to derive.
  const derived: DerivedContent | null = 'awaiting' in current ? await deriveContent(bytes, existing.mimeType, existing.commitment, 'HELD_BYTES') : null;
  const version = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await arrive(tx, existing.commitment, researcherId);
    return derived === null ? null : recordContentVersion(tx, existing.commitment, derived);
  }, WRITE_TRANSACTION);
  const content = version ?? ('awaiting' in current || 'shed' in current ? null : current);
  return answerFor(key, existing.commitment, content, true, stored, ignored, await anchoredNow({ commitment: existing.commitment, docId: key, held: true }));
}

/**
 * The FIRST arrival's anchor: ANCHORED as the chain answers after the attempt, or — on any failure — OWED, logged, and
 * read again, because a write that timed out may still have landed and the answer says what the chain holds.
 */
async function anchorAtReceipt(document: AnchorableDocument): Promise<boolean> {
  try {
    return (await anchorDocument(openDocumentRegistryWindow(), document)).anchored;
  } catch (error) {
    console.error(`add_document: the anchor of ${document.commitment} is OWED — ${error instanceof Error ? error.message : String(error)}`);
    return anchoredNow(document);
  }
}

/** ANCHORED(d) for one document, read from chain state — false where the chain cannot be read. */
async function anchoredNow(document: AnchorableDocument): Promise<boolean> {
  return (await anchoredOf(openDocumentRegistryWindow(), [document])).get(document.commitment)?.anchored ?? false;
}

/** One RESEARCHER arrival and its document — attributed (A2 :1278-:1286). */
async function arrive(tx: Prisma.TransactionClient, commitment: string, researcherId: string): Promise<void> {
  const arrival = await tx.arrival.create({ data: { door: 'RESEARCHER', researcherId } });
  await tx.arrivalDocument.create({ data: { arrivalId: arrival.id, commitment } });
}

async function answerFor(
  key: string,
  commitment: string,
  version: DocumentContentVersion | null,
  existed: boolean,
  assertions: Assertions,
  ignored: Ignored,
  anchored: boolean,
): Promise<AddDocumentAnswer> {
  return {
    commitment,
    docId: key,
    custody: 'HELD',
    content: version === null ? null : { contentVersionHash: version.contentVersionHash },
    anchored,
    equalsCapture: await capturesEqualTo(key),
    existed,
    assertions,
    ignored,
  };
}

/** The four assertions as the row holds them, with derived-from's title for its label. */
export async function storedAssertions(document: Document): Promise<Assertions> {
  const from =
    document.derivedFromCommitment === null
      ? null
      : await prisma.document.findUnique({ where: { commitment: document.derivedFromCommitment } });
  return {
    title: document.title,
    assertedUrl: document.assertedUrl,
    assertedAt: dayOf(document.assertedAt),
    derivedFrom: document.derivedFromCommitment === null ? null : { commitment: document.derivedFromCommitment, title: from?.title ?? null },
  };
}

/** Every value the call GAVE that differs from what is stored — A4 :1409 as ruled. */
function ignoredOf(call: Assertions, stored: Assertions, callType: string, storedType: string): Ignored {
  const ignored: Ignored = {};
  if (call.title !== null && call.title !== stored.title) ignored.title = call.title;
  if (call.assertedUrl !== null && call.assertedUrl !== stored.assertedUrl) ignored.assertedUrl = call.assertedUrl;
  if (call.assertedAt !== null && call.assertedAt !== stored.assertedAt) ignored.assertedAt = call.assertedAt;
  if (call.derivedFrom !== null && call.derivedFrom.commitment !== stored.derivedFrom?.commitment) {
    ignored.derivedFrom = call.derivedFrom.commitment;
  }
  if (callType !== storedType) ignored.mimeType = callType;
  return ignored;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}
