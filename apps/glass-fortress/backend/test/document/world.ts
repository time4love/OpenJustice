import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// THE DOCUMENT SUITE'S OWN WORLD — document step 30 (R76, REVIEW's finding 1).
//
// WHY THIS FILE EXISTS. `addDocument.test.ts`, `readDocument.test.ts` and the rest were
// written at step 27 with NO WORLD: no database double, no bucket double, nothing seeded.
// Their cases ("the tool READS the object the dialog wrote") could not be satisfied by any
// correct implementation, because nothing was there to read. The thesis suite's shape is the
// precedent (`test/thesis/versionWrite.test.ts` :1-:5 mocks `lib/prisma` with a double and
// the model factory with a tripwire); this is that shape for THIS suite, in THIS directory,
// so `test/helpers/evidenceDouble.ts` — shared with the gating suites — is not edited.
//
// A DOUBLE OVER EXACTLY THE DELEGATES STEP 30'S SERVICES CALL, with the unique keys the
// schema has, so a writer that would violate one fails here as it would in Postgres:
//   Document.docId @id · Document.commitment @unique ·
//   DocumentContentVersion @@unique([commitment, contentVersionHash]) ·
//   ArrivalDocument @@id([arrivalId, commitment]).
// A delegate call the double does not model THROWS BY NAME — a silent `undefined` would
// let a service pass over a query nobody checked.
//
// THE BUCKET IS A MAP FROM KEY TO BYTES. The key is the DOC_ID string exactly as
// `docId()` prints it (sketch S8). A signed upload checks no content (ui A1 :1129's route;
// storage-js mints a URL, not a checksum), so an object under a key MAY hold other bytes —
// which is the world NAME_MISMATCH refuses, and it is reachable.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export const store = {
  documents: [] as Row[],
  arrivals: [] as Row[],
  arrivalDocuments: [] as Row[],
  versions: [] as Row[],
  opinions: [] as Row[],
  trackedUrls: [] as Row[],
  snapshots: [] as Row[],
  researchers: [] as Row[],
  mentions: [] as Row[],
  openings: [] as Row[],
  sheds: [] as Row[],
  evidence: [] as Row[],
};

export const objects = new Map<string, { bytes: Uint8Array; createdAt: Date }>();

/** Which client a write went through — the global one, or the one a `$transaction` callback was handed. */
export type Via = 'global' | 'transaction';

/**
 * Every write, in order, WITH THE CLIENT IT WENT THROUGH — what "one transaction" and "wrote
 * nothing" are checked against. The tag is the point: a write made through the global client
 * while a transaction is open is OUTSIDE it, and a log without the tag cannot see that
 * (`gf-a-transaction-double-must-hand-a-distinct-client`; R76 and R77 REVIEW's decoys, 0 red).
 */
export const writes: { via: Via; op: string }[] = [];

let sequence = 0;
const nextId = (prefix: string): string => {
  sequence += 1;
  return `${prefix}-${String(sequence)}`;
};

export function resetWorld(): void {
  for (const list of Object.values(store)) list.length = 0;
  objects.clear();
  writes.length = 0;
  bucketCalls.length = 0;
  modelCalls.length = 0;
  modelAnswer.value = null;
  sequence = 0;
}

// --- the where-clauses the services use: equality, `{ in }`, and nothing else ----------

function matches(row: Row, where: Row | undefined): boolean {
  if (where === undefined) return true;
  return Object.entries(where).every(([key, wanted]) => {
    if (wanted !== null && typeof wanted === 'object' && !(wanted instanceof Date)) {
      const clause = wanted as Row;
      if (Array.isArray(clause['in'])) return (clause['in'] as unknown[]).includes(row[key]);
      throw new Error(`the document world models equality and { in } only — got ${key}: ${JSON.stringify(wanted)}`);
    }
    return row[key] === wanted;
  });
}

const unmodelled = (what: string) => (): never => {
  throw new Error(`the document world does not model ${what} — model it here or do not call it`);
};

function withIncludes(model: 'document', row: Row, include: Row | undefined): Row {
  if (include === undefined) return row;
  const out: Row = { ...row };
  if (model === 'document') {
    if (include['versions'] === true) out['versions'] = store.versions.filter((v) => v['commitment'] === row['commitment']);
    if (include['shed'] === true) out['shed'] = store.sheds.find((s) => s['commitment'] === row['commitment']) ?? null;
  }
  return out;
}

function uniqueOrThrow(list: Row[], row: Row, keys: readonly string[], model: string): void {
  for (const key of keys) {
    if (list.some((existing) => existing[key] === row[key])) {
      const error = new Error(`Unique constraint failed on ${model}.${key}`) as Error & { code: string };
      error.code = 'P2002';
      throw error;
    }
  }
}

/**
 * The delegates step 30's services call, bound to ONE client. `db` is the global client; every
 * `$transaction` callback is handed a FRESH one tagged `transaction` — a DISTINCT object, so a
 * write through `prisma` inside a callback is logged as the global write it is.
 */
function clientFor(via: Via) {
  const wrote = (op: string): void => {
    writes.push({ via, op });
  };
  return {
    document: {
      findUnique: jest.fn(({ where, include }: { where: Row; include?: Row }) => {
        const row = store.documents.find((d) => matches(d, where));
        return Promise.resolve(row === undefined ? null : withIncludes('document', row, include));
      }),
      findMany: jest.fn(({ where, include }: { where?: Row; include?: Row } = {}) =>
        Promise.resolve(store.documents.filter((d) => matches(d, where)).map((d) => withIncludes('document', d, include))),
      ),
      create: jest.fn(({ data }: { data: Row }) => {
        uniqueOrThrow(store.documents, data, ['docId', 'commitment'], 'Document');
        const row = { receivedAt: new Date(), createdAt: new Date(), cid: null, verifiedAtReceipt: null, ...data };
        store.documents.push(row);
        wrote('document.create');
        return Promise.resolve(row);
      }),
      /** The sweep's per-object re-read: is this key any Document's `bytes`? (sketch §(c)). */
      findFirst: jest.fn(({ where }: { where: Row }) => Promise.resolve(store.documents.find((d) => matches(d, where)) ?? null)),
      update: unmodelled('document.update — the Document row is written ONCE (A2 :1271 as ruled)'),
    },
    arrival: {
      create: jest.fn(({ data }: { data: Row }) => {
        const row = { id: nextId('arrival'), receivedAt: new Date(), thesisId: null, gapId: null, termsHash: null, ...data };
        store.arrivals.push(row);
        wrote('arrival.create');
        return Promise.resolve(row);
      }),
    },
    arrivalDocument: {
      create: jest.fn(({ data }: { data: Row }) => {
        if (store.arrivalDocuments.some((a) => a['arrivalId'] === data['arrivalId'] && a['commitment'] === data['commitment'])) {
          throw new Error('Unique constraint failed on ArrivalDocument(arrivalId, commitment)');
        }
        store.arrivalDocuments.push({ ...data });
        wrote('arrivalDocument.create');
        return Promise.resolve({ ...data });
      }),
      findMany: jest.fn(({ where }: { where?: Row } = {}) =>
        Promise.resolve(
          store.arrivalDocuments
            .filter((a) => matches(a, where))
            .map((a) => ({ ...a, arrival: store.arrivals.find((r) => r['id'] === a['arrivalId']) ?? null })),
        ),
      ),
    },
    documentContentVersion: {
      findUnique: jest.fn(({ where }: { where: { commitment_contentVersionHash: { commitment: string; contentVersionHash: string } } }) => {
        const key = where.commitment_contentVersionHash;
        return Promise.resolve(
          store.versions.find((v) => v['commitment'] === key.commitment && v['contentVersionHash'] === key.contentVersionHash) ?? null,
        );
      }),
      findMany: jest.fn(({ where }: { where?: Row } = {}) => Promise.resolve(store.versions.filter((v) => matches(v, where)))),
      create: jest.fn(({ data }: { data: Row }) => {
        if (store.versions.some((v) => v['commitment'] === data['commitment'] && v['contentVersionHash'] === data['contentVersionHash'])) {
          throw new Error('Unique constraint failed on DocumentContentVersion(commitment, contentVersionHash)');
        }
        const row = { id: nextId('version'), derivedAt: new Date(), readFailed: false, ...data };
        store.versions.push(row);
        wrote('documentContentVersion.create');
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        const at = store.versions.findIndex((v) => v['id'] === where.id);
        if (at < 0) throw new Error(`no version ${where.id}`);
        const updated = { ...store.versions[at], ...data };
        store.versions[at] = updated;
        wrote('documentContentVersion.update');
        return Promise.resolve(updated);
      }),
    },
    documentOpinion: {
      create: jest.fn(({ data }: { data: Row }) => {
        const row = { id: nextId('opinion'), createdAt: new Date(), ...data };
        store.opinions.push(row);
        wrote('documentOpinion.create');
        return Promise.resolve(row);
      }),
      findMany: jest.fn(({ where }: { where?: Row } = {}) => Promise.resolve(store.opinions.filter((o) => matches(o, where)))),
    },
    trackedUrl: {
      findUnique: jest.fn(({ where }: { where: Row }) => Promise.resolve(store.trackedUrls.find((t) => matches(t, where)) ?? null)),
    },
    urlSnapshot: {
      findMany: jest.fn(({ where }: { where?: Row } = {}) =>
        Promise.resolve(
          store.snapshots
            .filter((s) => matches(s, where))
            .map((s) => ({ ...s, trackedUrl: store.trackedUrls.find((t) => t['id'] === s['trackedUrlId']) ?? null })),
        ),
      ),
    },
    researcher: {
      findMany: jest.fn(({ where }: { where?: Row } = {}) => Promise.resolve(store.researchers.filter((r) => matches(r, where)))),
    },
    thesisMention: {
      findMany: jest.fn(({ where }: { where?: Row } = {}) => Promise.resolve(store.mentions.filter((m) => matches(m, where)))),
    },
    evidence: {
      findMany: jest.fn(({ where }: { where?: Row } = {}) => Promise.resolve(store.evidence.filter((e) => matches(e, where)))),
    },
    documentOpeningDecision: {
      findMany: jest.fn(({ where }: { where?: Row } = {}) => Promise.resolve(store.openings.filter((o) => matches(o, where)))),
    },
  };
}

export const db = {
  ...clientFor('global'),
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>, options?: Row): Promise<unknown> => {
    // THE WINDOW IS STATED OR THE CALL IS REFUSED — `gf-prisma-transaction-window`.
    if (options === undefined) throw new Error('a $transaction without WRITE_TRANSACTION — the 5 s window is unstated');
    writes.push({ via: 'global', op: '$transaction' });
    return fn(transactionClient());
  }),
};

/**
 * The client a transaction's callback receives — the same delegates over the same store, without
 * `$transaction`, and a DISTINCT object tagged `transaction`. Round 1 returned `db` itself, so a write
 * made through the global client inside a callback was indistinguishable from one made through `tx`.
 */
function transactionClient(): unknown {
  return clientFor('transaction');
}

/** What `jest.mock('../../src/lib/prisma', …)` hands the services. */
export const prismaDouble = { prisma: db as unknown as Prisma.TransactionClient };

// --- the bucket ---------------------------------------------------------------------------

export const bucketCalls: string[] = [];

export const bucketDouble = {
  DOCUMENTS_BUCKET: 'documents',
  statObject: jest.fn((key: string) => {
    bucketCalls.push(`stat ${key}`);
    const object = objects.get(key);
    return Promise.resolve(object === undefined ? null : { size: object.bytes.length, createdAt: object.createdAt });
  }),
  readObject: jest.fn((key: string) => {
    bucketCalls.push(`read ${key}`);
    return Promise.resolve(objects.get(key)?.bytes ?? null);
  }),
  listObjects: jest.fn(() => {
    bucketCalls.push('list');
    return Promise.resolve([...objects].map(([key, object]) => ({ key, size: object.bytes.length, createdAt: object.createdAt })));
  }),
  removeObject: jest.fn((key: string) => {
    bucketCalls.push(`remove ${key}`);
    objects.delete(key);
    return Promise.resolve();
  }),
  mintDownloadUrl: jest.fn((key: string) => {
    bucketCalls.push(`download-url ${key}`);
    return Promise.resolve({ url: `https://storage.test/signed/${key}`, expiresAt: new Date(Date.UTC(2026, 8, 23, 12, 10)) });
  }),
};

// --- the model ----------------------------------------------------------------------------

/** Every model call a case caused — what "nothing spent" is checked against. */
export const modelCalls: unknown[] = [];

/** The reading the double's model returns — set per case. */
export const modelAnswer: { value: unknown } = { value: null };

/**
 * `factories/LLMFactory`, mocked AT ITS BOUNDARY: `withStructuredOutput(…).invoke(messages)`
 * records the messages and returns `modelAnswer.value`. No test in this suite reaches a model.
 */
export const llmDouble = {
  LLMFactory: {
    getChatModel: () => ({
      withStructuredOutput: () => ({
        invoke: (messages: unknown) => {
          modelCalls.push(messages);
          return Promise.resolve(modelAnswer.value);
        },
      }),
    }),
  },
  resolveModelId: (agentType: string): string => `double:${agentType}`,
};

// --- seeds ----------------------------------------------------------------------------------

const MANIFEST_DIR = join(__dirname, '..', '..', 'fixtures', 'documents');

interface ManifestEntry {
  kind: string;
  file: string;
  mimeType: string;
  byteLength: number;
  docId: string;
}

const manifest = JSON.parse(readFileSync(join(MANIFEST_DIR, 'manifest.json'), 'utf8')) as { fixtures: ManifestEntry[] };

/** A committed fixture: its REAL bytes and its REAL docId (`fixtures/documents/manifest.json`). */
export function fixture(kind: 'PDF_TEXT_LAYER' | 'SCAN' | 'SPREADSHEET' | 'UNREADABLE'): ManifestEntry & { bytes: Uint8Array } {
  const entry = manifest.fixtures.find((f) => f.kind === kind);
  if (entry === undefined) throw new Error(`no fixture ${kind} in the manifest`);
  return { ...entry, bytes: new Uint8Array(readFileSync(join(MANIFEST_DIR, entry.file))) };
}

export const nameOf = (bytes: Uint8Array): string => `0x${createHash('sha256').update(bytes).digest('hex')}`;

/** An object the dialog wrote under `key` — its bytes need not hash to it (a signed URL checks nothing). */
export function seedObject(key: string, bytes: Uint8Array, createdAt = new Date(Date.UTC(2026, 8, 23))): void {
  objects.set(key, { bytes, createdAt });
}

export function seedTrackedUrl(url: string): Row {
  const row = { id: nextId('page'), url };
  store.trackedUrls.push(row);
  return row;
}

/**
 * A capture of `page` whose stored digest is `documentHash` — IN THE SPELLING ITS WRITER STORES IT:
 * bare lowercase hex, 64 characters (`lib/evidenceIdentity.ts` :46-:47). A seed in the `0x` display
 * would be a world no writer creates, and would hide a comparison of spellings.
 */
export function seedSnapshot(page: Row, documentHash: string, waybackTimestamp: string): void {
  if (!/^[0-9a-f]{64}$/.test(documentHash)) throw new Error(`a UrlSnapshot.documentHash is bare hex — got ${documentHash}`);
  store.snapshots.push({ id: nextId('snapshot'), trackedUrlId: page['id'], documentHash, waybackTimestamp });
}

export function seedResearcher(id: string, handle: string): void {
  store.researchers.push({ id, handle });
}

/** A document row as `add_document` writes it — used where a case needs one before the call. */
export function seedDocument(row: Row): Row {
  const full = {
    salt: Buffer.alloc(32),
    cid: null,
    bytes: null,
    mimeType: 'application/pdf',
    byteLength: 0,
    receivedAt: new Date(Date.UTC(2026, 8, 20)),
    createdAt: new Date(Date.UTC(2026, 8, 20)),
    verifiedAtReceipt: null,
    assertedUrl: null,
    assertedAt: null,
    derivedFromCommitment: null,
    title: null,
    ...row,
  };
  store.documents.push(full);
  return full;
}

export function seedArrival(researcherId: string, commitment: string, receivedAt = new Date(Date.UTC(2026, 8, 20))): void {
  const arrival = { id: nextId('arrival'), door: 'RESEARCHER', researcherId, receivedAt, thesisId: null, gapId: null, termsHash: null };
  store.arrivals.push(arrival);
  store.arrivalDocuments.push({ arrivalId: arrival.id, commitment });
}

export function seedVersion(row: Row): Row {
  const full = {
    id: nextId('version'),
    text: null,
    extractor: 'seed',
    extractorVersion: 'seed',
    derivedUnder: [],
    readFailed: false,
    derivedAt: new Date(Date.UTC(2026, 8, 20)),
    derivedFrom: 'AT_RECEIPT',
    ...row,
  };
  store.versions.push(full);
  return full;
}
