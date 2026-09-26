import type { Document, DocumentContentVersion, Shed } from '@prisma/client';
import { familyOf, IMAGE_BLOCK_BYTES } from '../lib/acceptedDocumentTypes';
import { CURRENT_EXTRACTOR } from '../lib/documentExtractor';
import { mintTextLink } from '../lib/documentTextLink';
import { prisma } from '../lib/prisma';
import { storedAssertions, type Assertions } from './addDocument';
import { anchoredOf } from './anchorDocuments';
import { openDocumentRegistryWindow } from './anchorSnapshots';
import { mintDownloadUrl, readObject } from './documentBucket';
import { capturesEqualTo } from './documentCaptures';
import { currentVersion, custody, type Custody } from './documentPredicates';
import { openingsOf } from './documentOpenings';
import { documentRefusal, NO_RESEARCHER, type DocumentRefusal } from './documentRefusals';
import { uploadUrl } from './documentUploadUrl';
import { handlesOf } from './publishedThesis';

// ---------------------------------------------------------------------------
// read_document and list_documents — THE TWO GATED READS. docs/gf-document-flows.md A4
// :1424-:1435 as ruled 2026-09-22 and 2026-09-23; plan step 30 :180-:182.
//
// read_document NEVER PUTS BYTES IN THE MODEL'S CONTEXT (A4 :1425 as ruled): `bytes` is not a
// field of the answer. COMPUTED text rides it; a bytes-only document whose bytes are an IMAGE
// rides as an MCP image block BESIDE the answer (the tool assembles it from `imageFor`), up to
// IMAGE_BLOCK_BYTES; every other bytes-only kind rides as `bytesUrl`, a short-lived signed
// DOWNLOAD link with its expiry.
//
// read_document's HELD SHAPE IS STEP 30'S; its SEALED shape is step 32's (plan :224) and its
// NONE shape step 35's (plan :302). No SEALED or shed row can exist before those steps build
// what writes one, so a read that meets one THROWS naming the owning step, loudly — never a
// shape guessed ahead of the step that owns it.
//
// list_documents TAKES ui §7.1's SHAPE AS-IS (A4 :1432 as ruled): `scope: 'mine' | 'all'`,
// default `mine` so no claude.ai flow reads differently; the gated route passes `all`; each row
// carries `by: { handle, mine }`, never an id. `by` is the FIRST researcher arrival's — the
// researcher whose assertions the row holds (A2 :1271 as ruled), and `mine` is theirs.
//
// OPINIONS ARE LABELLED AND SEPARATE (§3 :291-:296; `opinions-not-facts`, A7 :1571-:1573): each
// version carries its `opinions` array, never folded into `text` or `contentVersionHash`.
//
// TEXT LAST AND CAPPED — A4 :1425-:1426 as ruled 2026-09-23 (F1 ruling 2, §9 Q2). On staging a real spreadsheet's
// text rode inline BEFORE every other field and blew the client's result cap, and every field after it was lost. So
// a version carries its hash, provenance, opinions and its OWN signed `textUrl` — no inline text — and the envelope
// ENDS with `text`: CURRENT(d)'s, cut at TEXT_CAP_CHARACTERS, beside `textTruncated` and the envelope's own `textUrl`
// (CURRENT's). Every `textUrl` is A5 :1504's SIGNED ARM (`lib/documentTextLink`), never a bucket object.
// ---------------------------------------------------------------------------

/**
 * THE CLIENT'S RESULT CAP, in characters — the operational parameter A4 :1425 rules (interaction A8's kind), set from
 * the measurement (the researcher, 2026-09-24): on staging the paper's text, 77,218 characters, FIT the claude.ai
 * tool-result cap, and the spreadsheet's, 112,602 characters, did NOT (REVIEW's read of the two staging versions;
 * `docs/gf-document-step-30-staging-exercise-2026-09-23.md` §4 F1). 80,000 sits between them, with a margin over the
 * paper's. Characters are CODE POINTS, as that measurement counted them — a cut never splits one in two.
 */
export const TEXT_CAP_CHARACTERS = 80_000;

export interface Researcher {
  handle: string;
  mine: boolean;
}

export interface OpinionRow {
  model: string;
  promptVersion: string;
  /** The researcher who spent the paid call; null for the receipt's read of a sealed document (step 32). */
  by: Researcher | null;
  at: string;
  /** The reading — null only after SHED (A2 :1305). */
  body: unknown;
}

/** A signed link and its expiry — `bytesUrl`'s shape, and every `textUrl`'s (A4 :1425 as ruled 2026-09-24). */
export interface SignedLink {
  url: string;
  expiresAt: string;
}

export interface VersionView {
  contentVersionHash: string;
  provenance: {
    extractor: string;
    extractorVersion: string;
    derivedUnder: string[];
    readFailed: boolean;
    derivedFrom: 'AT_RECEIPT' | 'HELD_BYTES';
    derivedAt: string;
  };
  opinions: OpinionRow[];
  /** This version's own text, by a signed link — null where the version IS the bytes (§9 Q2: never inline). */
  textUrl: SignedLink | null;
}

/**
 * ONE ARRIVAL, as both envelopes spell it — A4 :1426 as ruled 2026-09-23 (batch item 15): `by` is the
 * researcher who brought the bytes, or NULL for a public-door arrival (step 32; none exists before it).
 */
export interface ArrivalView {
  by: Researcher | null;
  at: string;
}

/** CURRENT(d) as BOTH envelopes spell it — A4 :1426 and :1434 as ruled 2026-09-23. */
export type CurrentView = { contentVersionHash: string } | { awaiting: 'AWAITING_DERIVATION' };

/** CURRENT(d)'s one spelling in an answer — both envelopes call it, so they cannot drift apart again (#582). */
function currentView(current: ReturnType<typeof currentVersion>): CurrentView {
  return 'awaiting' in current || 'shed' in current ? { awaiting: 'AWAITING_DERIVATION' } : { contentVersionHash: current.contentVersionHash };
}

export interface ReadDocumentHeld {
  custody: 'HELD';
  commitment: string;
  docId: string;
  mimeType: string;
  byteLength: number;
  receivedAt: string;
  assertions: Assertions;
  /** Every arrival of these bytes, OLDEST FIRST (A4 :1426 as ruled). */
  arrivals: ArrivalView[];
  versions: VersionView[];
  current: CurrentView;
  /** Set iff CURRENT has no text AND the bytes do not ride as an image block (A4 :1425 as ruled). */
  bytesUrl: SignedLink | null;
  /** CURRENT(d)'s text by a signed link, whole — null where it has none (A4 :1425 as ruled). */
  textUrl: SignedLink | null;
  /** Whether `text` was cut at TEXT_CAP_CHARACTERS. */
  textTruncated: boolean;
  /** ANCHORED(d), A3 :1366 as ruled 2026-09-24 — READ from chain state on this read, both arms; false while owed. */
  anchored: boolean;
  equalsCapture: { url: string; capture: string } | null;
  /** The dialog's link, THIS document as derived-from and its assertions as defaults (:1428). */
  uploadUrl: string;
  /** CURRENT(d)'s text, CAPPED — the envelope's FINAL field, so whatever the client cuts, it cuts nothing else. */
  text: string | null;
}

export interface ListedDocument {
  commitment: string;
  title: string | null;
  custody: Custody;
  mimeType: string;
  byteLength: number;
  receivedAt: string;
  assertions: Omit<Assertions, 'title'>;
  /** CURRENT(d) — ONE shape with read_document's (A4 :1434 as ruled 2026-09-23): the object form can say awaiting. */
  current: CurrentView;
  /** ANCHORED(d), A3 :1366 as ruled 2026-09-24 — READ from chain state on this read, both arms; false while owed. */
  anchored: boolean;
  citedBy: { thesisId: string; published: boolean }[];
  opening: 'PASSAGE' | 'CONTENT' | 'BYTES' | null;
  /** The FIRST arrival whose `by` is not null — read off `arrivalsOf`, the one spelling (A4 :1434 as ruled). */
  by: Researcher | null;
}

/** A4 :1435 — `list_documents` refuses these two and nothing else; the gated route's table maps both. */
export type ListDocumentsCode = 'NO_RESEARCHER' | 'NOT_SURVEYED';

export interface ListDocumentsAnswer {
  documents: ListedDocument[];
  uploadUrl: string;
}

type Loaded = Document & { versions: DocumentContentVersion[]; shed: Shed | null };

const iso = (at: Date): string => at.toISOString();

/** A signed text link for one version, as the envelope carries it — null where the version has no text. */
function textLinkOf(commitment: string, version: { contentVersionHash: string; text: string | null }): SignedLink | null {
  if (version.text === null) return null;
  const link = mintTextLink(commitment, version.contentVersionHash);
  return { url: link.url, expiresAt: iso(link.expiresAt) };
}

/** The text cut at TEXT_CAP_CHARACTERS code points, and whether it was cut. */
function capped(text: string | null): { text: string | null; truncated: boolean } {
  if (text === null) return { text: null, truncated: false };
  const characters = Array.from(text);
  return characters.length <= TEXT_CAP_CHARACTERS ? { text, truncated: false } : { text: characters.slice(0, TEXT_CAP_CHARACTERS).join(''), truncated: true };
}

/** Whether a HELD document with no computed text rides as an image block — an image, within the cap. */
const ridesAsImage = (document: Document): boolean =>
  familyOf(document.mimeType) === 'IMAGE' && document.byteLength <= IMAGE_BLOCK_BYTES;

function heldOrThrow(document: Loaded): void {
  const mode = custody(document, document.shed);
  if (mode === 'SEALED') throw new Error(`read_document: ${document.commitment} is SEALED — the SEALED shape is document step 32's (plan :224)`);
  if (mode === 'NONE') throw new Error(`read_document: ${document.commitment} is SHED — the NONE shape is document step 35's (plan :302)`);
}

export async function readDocument(commitment: string, researcherId: string | null): Promise<ReadDocumentHeld | DocumentRefusal> {
  if (researcherId === null) return NO_RESEARCHER();
  const document = await prisma.document.findUnique({ where: { commitment }, include: { versions: true, shed: true } });
  if (document === null) return documentRefusal('NOT_A_DOCUMENT', `No document is named ${commitment}.`);
  heldOrThrow(document);

  const versions = [...document.versions].sort((a, b) => a.derivedAt.getTime() - b.derivedAt.getTime());
  const opinions = await prisma.documentOpinion.findMany({ where: { versionId: { in: versions.map((v) => v.id) } } });
  const handles = await handlesOf(opinions.flatMap((o) => (o.researcherId === null ? [] : [o.researcherId])));
  const current = currentVersion(document, document.versions, CURRENT_EXTRACTOR, document.shed);
  const currentIsBytes = !('awaiting' in current) && !('shed' in current) && current.text === null;
  const link = currentIsBytes && !ridesAsImage(document) ? await mintDownloadUrl(document.bytes ?? document.docId) : null;
  const assertions = await storedAssertions(document);
  const arrivals = (await arrivalsOf([commitment], researcherId)).get(commitment) ?? [];
  const currentText = 'awaiting' in current || 'shed' in current ? null : current;
  const text = capped(currentText?.text ?? null);
  const standing = await anchoredOf(openDocumentRegistryWindow(), [{ commitment, docId: document.docId, held: true }]);

  return {
    custody: 'HELD',
    commitment,
    docId: document.docId,
    mimeType: document.mimeType,
    byteLength: document.byteLength,
    receivedAt: iso(document.receivedAt),
    assertions,
    arrivals,
    versions: versions.map((version) => ({
      contentVersionHash: version.contentVersionHash,
      provenance: {
        extractor: version.extractor,
        extractorVersion: version.extractorVersion,
        derivedUnder: version.derivedUnder,
        readFailed: version.readFailed,
        derivedFrom: version.derivedFrom,
        derivedAt: iso(version.derivedAt),
      },
      opinions: opinions
        .filter((o) => o.versionId === version.id)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((o) => ({
          model: o.model,
          promptVersion: o.promptVersion,
          by: o.researcherId === null ? null : { handle: handleOf(handles, o.researcherId), mine: o.researcherId === researcherId },
          at: iso(o.createdAt),
          body: o.body,
        })),
      textUrl: textLinkOf(commitment, version),
    })),
    current: currentView(current),
    bytesUrl: link === null ? null : { url: link.url, expiresAt: iso(link.expiresAt) },
    textUrl: currentText === null ? null : textLinkOf(commitment, currentText),
    textTruncated: text.truncated,
    anchored: standing.get(commitment)?.anchored ?? false,
    equalsCapture: await capturesEqualTo(document.docId),
    uploadUrl: uploadUrl({
      url: document.assertedUrl,
      at: assertions.assertedAt,
      derivedFrom: { commitment, title: document.title, family: familyOf(document.mimeType) },
    }),
    text: text.text,
  };
}

/**
 * The image block `read_document` hands the model beside its answer — the bytes of a HELD
 * image with no computed text, within IMAGE_BLOCK_BYTES; null for every other document.
 */
export async function imageFor(answer: ReadDocumentHeld): Promise<{ data: string; mimeType: string } | null> {
  // CURRENT exists and has no text — the envelope's `text` is CURRENT's (A4 :1426), and versions carry none inline.
  const noText = 'contentVersionHash' in answer.current && answer.text === null;
  if (!noText || familyOf(answer.mimeType) !== 'IMAGE' || answer.byteLength > IMAGE_BLOCK_BYTES) return null;
  const bytes = await readObject(answer.docId);
  return bytes === null ? null : { data: Buffer.from(bytes).toString('base64'), mimeType: answer.mimeType };
}

export async function listDocuments(
  args: { url?: string; scope?: 'mine' | 'all' },
  researcherId: string | null,
): Promise<ListDocumentsAnswer | DocumentRefusal<ListDocumentsCode>> {
  if (researcherId === null) return NO_RESEARCHER();
  if (args.url !== undefined && (await prisma.trackedUrl.findUnique({ where: { url: args.url } })) === null) {
    return documentRefusal('NOT_SURVEYED', `${args.url} has not been surveyed.`);
  }
  const documents = await prisma.document.findMany({
    where: args.url === undefined ? {} : { assertedUrl: args.url },
    include: { versions: true, shed: true },
  });
  const commitments = documents.map((d) => d.commitment);
  const arrivals = await arrivalsOf(commitments, researcherId);
  const byOf = (commitment: string): Researcher | null => (arrivals.get(commitment) ?? []).find((arrival) => arrival.by !== null)?.by ?? null;
  const mentions = await prisma.thesisMention.findMany({
    where: { kind: 'DOCUMENT', name: { in: commitments } },
    select: { name: true, versionId: true, thesisVersion: { select: { thesisId: true, thesis: { select: { publishedVersionId: true } } } } },
  });
  // OPENED(d) — document step 34 (A3 :1377–:1378 as CONFORMED 2026-09-26): what publication has opened of each, read
  // through the ONE loader, so this row and the public serves cannot disagree. Null until a publication puts one in force.
  const openings = await openingsOf(commitments);

  const scoped = documents.filter((d) => (args.scope ?? 'mine') === 'all' || byOf(d.commitment)?.mine === true);
  const standing = await anchoredOf(
    openDocumentRegistryWindow(),
    scoped.map((d) => ({ commitment: d.commitment, docId: d.docId, held: custody(d, d.shed) === 'HELD' })),
  );
  const rows = await Promise.all(
    scoped
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime() || (a.commitment < b.commitment ? -1 : 1))
      .map(async (document): Promise<ListedDocument> => {
        const assertions = await storedAssertions(document);
        const current = currentVersion(document, document.versions, CURRENT_EXTRACTOR, document.shed);
        return {
          commitment: document.commitment,
          title: document.title,
          custody: custody(document, document.shed),
          mimeType: document.mimeType,
          byteLength: document.byteLength,
          receivedAt: iso(document.receivedAt),
          assertions: { assertedUrl: assertions.assertedUrl, assertedAt: assertions.assertedAt, derivedFrom: assertions.derivedFrom },
          current: currentView(current),
          anchored: standing.get(document.commitment)?.anchored ?? false,
          citedBy: citedByOf(mentions, document.commitment),
          opening: openings.get(document.commitment)?.opened ?? null,
          by: byOf(document.commitment),
        };
      }),
  );
  return { documents: rows, uploadUrl: uploadUrl({ url: args.url ?? null }) };
}

interface MentionRead {
  name: string;
  versionId: string;
  thesisVersion: { thesisId: string; thesis: { publishedVersionId: string | null } } | null;
}

/**
 * EVERY ARRIVAL OF EACH DOCUMENT, OLDEST FIRST — the ONE spelling both envelopes read (A4 :1426, :1434 as ruled
 * 2026-09-23). `read_document` answers the list; `list_documents`' `by` is its first entry whose `by` is not null,
 * so the two can never name different researchers for one document. Ties on the moment keep the arrival's id order.
 */
async function arrivalsOf(commitments: readonly string[], researcherId: string): Promise<Map<string, ArrivalView[]>> {
  const rows = await prisma.arrivalDocument.findMany({ where: { commitment: { in: [...commitments] } }, include: { arrival: true } });
  const handles = await handlesOf(rows.flatMap(({ arrival }) => (arrival.researcherId === null ? [] : [arrival.researcherId])));
  const byCommitment = new Map<string, { at: Date; id: string; view: ArrivalView }[]>();
  for (const { commitment, arrival } of rows) {
    const by = arrival.researcherId === null ? null : { handle: handleOf(handles, arrival.researcherId), mine: arrival.researcherId === researcherId };
    const list = byCommitment.get(commitment) ?? [];
    list.push({ at: arrival.receivedAt, id: arrival.id, view: { by, at: iso(arrival.receivedAt) } });
    byCommitment.set(commitment, list);
  }
  return new Map(
    [...byCommitment].map(([commitment, list]) => [
      commitment,
      list.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : 1)).map((entry) => entry.view),
    ]),
  );
}

/** The theses whose versions cite the document — one entry per thesis, published iff its PUBLISHED version cites it. */
function citedByOf(mentions: readonly MentionRead[], commitment: string): { thesisId: string; published: boolean }[] {
  const byThesis = new Map<string, boolean>();
  for (const mention of mentions) {
    if (mention.name !== commitment || mention.thesisVersion === null) continue;
    const published = mention.thesisVersion.thesis.publishedVersionId === mention.versionId;
    byThesis.set(mention.thesisVersion.thesisId, (byThesis.get(mention.thesisVersion.thesisId) ?? false) || published);
  }
  return [...byThesis].map(([thesisId, published]) => ({ thesisId, published }));
}

/** A researcher's handle — a missing row is a broken foreign key, and says so. */
function handleOf(handles: ReadonlyMap<string, string>, researcherId: string): string {
  const handle = handles.get(researcherId);
  if (handle === undefined) {
    throw new Error(`readDocument: an arrival or an opinion names researcher ${researcherId}, and no such researcher exists — a broken foreign key.`);
  }
  return handle;
}
