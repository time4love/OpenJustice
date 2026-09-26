// ---------------------------------------------------------------------------
// DOCUMENT STEP 29 (b) — THE THREE SERVICES, UNDER TEST. Plan :170-:171, A2
// :1296-:1305, §3 :316-:317, §3 :346-:348, COMPLIANCE.md rule 3.
//
// WHY THIS FILE IS IN THE UNIT PROJECT AND NOT IN `test/document/`. The `document`
// project is the step-27 acceptance suite and is INFORMATIONAL IN CI UNTIL STEP 36
// (plan :121); `package.json` :17 does not select it for `npm test`. A case living
// there holds nothing a merge must pass, so the three services this step wrote —
// `documentContentVersions.ts`, `rederiveDocuments.ts` and the predicates they lean
// on — are asserted HERE, where a merge runs them.
//
// WHAT ROUND 1 LEFT UNHELD, said plainly: 471 lines of new `src/` code were named by
// no test in any project, and `readObject` — the injection point the record called
// "the outage arm, proven by injection" — appeared in none. Plan step 29's fifth
// *Verified by* item, "the derivation pass observed to write a second version for one
// HELD fixture under a moved CURRENT_EXTRACTOR and none for a SEALED one", had no
// test at all. Each of those is a case below.
//
// THE DERIVATION RUNS THE REAL EXTRACTOR OVER A REAL COMMITTED FIXTURE. Nothing here
// stubs `extract`: the pass is handed the actual bytes of `spreadsheet.xlsx` through the
// injected reader, and what is asserted is the text `exceljs` and this repository's own
// cell serialisation really returned. Only the DATABASE is a double, because the pass's
// subject is WHICH ROWS IT WRITES.
//
// THE SPREADSHEET AND NOT THE PDF, AND THE REASON IS THE HARNESS. `pdfjs-dist` 6.3.289
// is ESM-only and NO mechanism loads it inside jest — three were measured failing, and
// `src/lib/documentExtractor.ts`'s header records each with its error, including Node's
// own `createRequire`, which does not escape jest's process-wide `Module._load` hook. It
// loads correctly under plain Node, so the PDF arm is measured by `extractor-coverage`
// and NO TEST ANYWHERE ASSERTS IT. Said here rather than implied: a file that looks like
// coverage and is not is worse than a gap that is named.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    document: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import type { Document, DocumentOpinion, Prisma, Shed } from '@prisma/client';
import { commitment as commitmentOf, contentVersionHashOf, docId as docIdOf } from '../src/lib/documentIdentity';
import { CURRENT_EXTRACTOR } from '../src/lib/documentExtractor';
import { prisma } from '../src/lib/prisma';
import {
  deriveContent,
  recordContentVersion,
  recordOpinion,
  type DerivedContent,
} from '../src/services/documentContentVersions';
import { currentVersion, type DerivedVersion } from '../src/services/documentPredicates';
import { rederiveDocuments } from '../src/services/rederiveDocuments';
import { FIXTURES, type Fixture, type FixtureKind } from './documentFixtureBytes';

/** The extractor string a document was derived under BEFORE today's — "moved". */
const OLD_EXTRACTOR = 'v0-pdfjs6.2.0-streamorder-ocr-none-nfc';

/**
 * A fixture BY KIND, or a loud throw — never a silent skip.
 *
 * A subject quietly dropped from a pass is a subject reported as nothing to check,
 * which is the vacuity this house has paid for; `requireSnapshotIdentity`'s pattern.
 */
function fixture(kind: FixtureKind): Fixture {
  const found = FIXTURES.find((candidate) => candidate.kind === kind);
  if (found === undefined) throw new Error(`the ${kind} fixture is gone — these cases have no subject`);
  return found;
}

const SHEET = fixture('SPREADSHEET');

const mocked = prisma as unknown as {
  document: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

// ---------------------------------------------------------------------------
// THE DATABASE DOUBLE — a store that enforces the ONE constraint under test.
//
// `@@unique([commitment, contentVersionHash])` is what makes "a re-derivation with
// identical text is not a new row" a property of the SCHEMA rather than of a writer
// remembering (§3 :316-:317). A double that let two identical rows in would let a
// broken writer pass, so this one refuses exactly as the column does.
// ---------------------------------------------------------------------------

interface Store {
  /** The versions, each with its derivation rows JOINED as the loaders include them (`DERIVED_VERSION`). */
  rows: DerivedVersion[];
  /**
   * Every `DocumentContentDerivation` row WRITTEN, as the writer handed it — the `at` it chose included (DECLARED EDIT,
   * step 34 chunk 5-0, the researcher's Q-R1: one row per derivation, `at` never null for a row the writer writes).
   */
  derivationWrites: { versionId: string; extractorVersion: string; at: Date | null }[];
  /** The OPINION register's rows — a table of its own since step 30 (A2 :1302 as ruled 2026-09-23). */
  opinions: DocumentOpinion[];
  creates: number;
  tx: Prisma.TransactionClient;
}

function store(initial: readonly DerivedVersion[] = []): Store {
  const state: Store = {
    rows: [...initial],
    derivationWrites: [],
    opinions: [],
    creates: 0,
    tx: undefined as unknown as Prisma.TransactionClient,
  };
  state.tx = {
    documentContentVersion: {
      findUnique: ({
        where,
        include,
      }: {
        where: { commitment_contentVersionHash: { commitment: string; contentVersionHash: string } };
        include?: { derivations?: unknown };
      }): Promise<DerivedVersion | null> => {
        // The writer must ASK for the derivations it reads — a read without the include answers a row without them,
        // as Prisma does, so a writer that forgot the include finds no membership rather than a planted one.
        if (include?.derivations === undefined) throw new Error('the double: the writer read a version without its derivations');
        const key = where.commitment_contentVersionHash;
        return Promise.resolve(
          state.rows.find(
            (row) => row.commitment === key.commitment && row.contentVersionHash === key.contentVersionHash,
          ) ?? null,
        );
      },
      create: ({ data }: { data: Omit<DerivedVersion, 'id' | 'derivedAt' | 'derivations'> }): Promise<DerivedVersion> => {
        const duplicate = state.rows.some(
          (row) => row.commitment === data.commitment && row.contentVersionHash === data.contentVersionHash,
        );
        if (duplicate) {
          throw new Error('the double refuses what @@unique([commitment, contentVersionHash]) refuses');
        }
        const row: DerivedVersion = {
          ...data,
          id: `version-${String(state.rows.length + 1)}`,
          derivedAt: new Date(0),
          // A version create writes NO derivation: the writer's second write does (below).
          derivations: [],
        };
        state.rows.push(row);
        state.creates += 1;
        return Promise.resolve(row);
      },
      // A version is NEVER updated since step 34 chunk 5-0 (Q-R1): a re-derivation writes a derivation row instead, and
      // a writer still updating a version fails here by name.
      update: (): never => {
        throw new Error('the double: a DocumentContentVersion is never updated — a re-derivation writes a DocumentContentDerivation row');
      },
    },
    // APPEND-ONLY, and unique per (version, extractor) as the schema's `@@unique([versionId, extractorVersion])` is.
    documentContentDerivation: {
      create: ({ data }: { data: { versionId: string; extractorVersion: string; at: Date | null } }): Promise<{ extractorVersion: string; at: Date | null }> => {
        const version = state.rows.find((row) => row.id === data.versionId);
        if (version === undefined) throw new Error(`the double: no version ${data.versionId} — the foreign key refuses it`);
        if (version.derivations.some((row) => row.extractorVersion === data.extractorVersion)) {
          throw new Error('the double refuses what @@unique([versionId, extractorVersion]) refuses');
        }
        state.derivationWrites.push(data);
        const written = { extractorVersion: data.extractorVersion, at: data.at };
        state.rows = state.rows.map((row) => (row.id === version.id ? { ...row, derivations: [...row.derivations, written] } : row));
        return Promise.resolve(written);
      },
    },
    // APPEND-ONLY: the double models `create` and nothing else, so a writer that UPDATED an
    // opinion — the column's old shape — would fail here rather than pass.
    documentOpinion: {
      create: ({ data }: { data: Omit<DocumentOpinion, 'id' | 'createdAt'> }): Promise<DocumentOpinion> => {
        const row: DocumentOpinion = { ...data, id: `opinion-${String(state.opinions.length + 1)}`, createdAt: new Date(0) } as DocumentOpinion;
        state.opinions.push(row);
        return Promise.resolve(row);
      },
    },
  } as unknown as Prisma.TransactionClient;
  return state;
}

function heldDocument(overrides: Partial<Document> = {}): Document {
  return {
    docId: '0x' + 'a'.repeat(64),
    commitment: '0x' + 'b'.repeat(64),
    salt: Buffer.alloc(32),
    cid: null,
    bytes: 'bucket/object-key',
    mimeType: SHEET.mimeType,
    byteLength: SHEET.bytes().length,
    receivedAt: new Date(0),
    verifiedAtReceipt: null,
    assertedUrl: null,
    assertedAt: null,
    derivedFromCommitment: null,
    title: 'the circular',
    createdAt: new Date(0),
    ...overrides,
  };
}

function versionRow(overrides: Partial<DerivedVersion> = {}): DerivedVersion {
  return {
    id: 'version-0',
    commitment: '0x' + 'b'.repeat(64),
    text: 'whatever the old extractor returned',
    contentVersionHash: '0x' + 'c'.repeat(64),
    extractor: 'pdfjs',
    extractorVersion: OLD_EXTRACTOR,
    // A version's derivation rows carry the extractor that produced it, by construction —
    // the case that matters overrides them to state what a RE-derivation added.
    derivations: [{ extractorVersion: OLD_EXTRACTOR, at: new Date(0) }],
    readFailed: false,
    derivedAt: new Date(0),
    derivedFrom: 'AT_RECEIPT',
    ...overrides,
  };
}

function shedRow(): Shed {
  return { commitment: '0x' + 'b'.repeat(64), cause: 'SENDER', researcherId: null, reason: null, at: new Date(0) };
}

/** Feed the pass a corpus; `$transaction` runs its callback against one store. */
function corpus(documents: readonly unknown[], state: Store): void {
  mocked.document.findMany.mockResolvedValue(documents);
  mocked.$transaction.mockImplementation((run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(state.tx));
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the derivation pass over HELD bytes — plan :170-:171, §3 :346-:348', () => {
  it('writes a SECOND version for a HELD document whose CURRENT predates the extractor, and KEEPS the old', async () => {
    const state = store([versionRow()]);
    const document = heldDocument();
    corpus([{ ...document, versions: state.rows, shed: null }], state);

    const report = await rederiveDocuments(() => Promise.resolve(SHEET.bytes()));

    expect(report.extractor).toBe(CURRENT_EXTRACTOR);
    expect(report.outcomes).toEqual([
      expect.objectContaining({ commitment: document.commitment, outcome: 'SUPERSEDED' }),
    ]);
    // TWO rows, and the old one is untouched: content moves only by a NEW version that
    // keeps the old (§3 :271-:275).
    expect(state.rows).toHaveLength(2);
    expect(state.rows.at(0)?.extractorVersion).toBe(OLD_EXTRACTOR);
    const written = state.rows.at(1);
    expect(written?.extractorVersion).toBe(CURRENT_EXTRACTOR);
    expect(written?.derivedFrom).toBe('HELD_BYTES');
    // The REAL reader ran over the REAL fixture: this is the serialisation's own output,
    // sheet header and all, and it equals the committed ground truth exactly.
    expect(written?.text).toBe(SHEET.groundTruth);
    expect(written?.extractor).toBe(CURRENT_EXTRACTOR);
  }, 30000);

  it('writes NOTHING for a SEALED document — its plaintext existed once, at receipt', async () => {
    const state = store([versionRow()]);
    const sealed = heldDocument({ bytes: null, cid: 'bafy-sealed', verifiedAtReceipt: new Date(0), title: null });
    corpus([{ ...sealed, versions: state.rows, shed: null }], state);

    const report = await rederiveDocuments(() => {
      throw new Error('the pass must not read a sealed document’s bytes — there are none');
    });

    expect(report.outcomes).toEqual([
      expect.objectContaining({ commitment: sealed.commitment, outcome: 'SKIPPED' }),
    ]);
    expect(report.outcomes.at(0)?.detail).toContain('SEALED');
    expect(state.creates).toBe(0);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('a bucket object that cannot be read is listed SKIPPED and never repaired — the injected reader returns null', async () => {
    const state = store([versionRow()]);
    const document = heldDocument();
    corpus([{ ...document, versions: state.rows, shed: null }], state);

    const report = await rederiveDocuments(() => Promise.resolve(null));

    expect(report.outcomes).toEqual([
      expect.objectContaining({ commitment: document.commitment, outcome: 'SKIPPED' }),
    ]);
    expect(report.outcomes.at(0)?.detail).toContain('could not be read');
    expect(state.creates).toBe(0);
    expect(mocked.$transaction).not.toHaveBeenCalled();
  });

  it('a SHED document is SKIPPED — nothing is derived from content that was taken back', async () => {
    const state = store([versionRow()]);
    const document = heldDocument({ bytes: null });
    corpus([{ ...document, versions: state.rows, shed: shedRow() }], state);

    const report = await rederiveDocuments(() => {
      throw new Error('the pass must not read a shed document’s bytes');
    });

    expect(report.outcomes.at(0)?.outcome).toBe('SKIPPED');
    expect(report.outcomes.at(0)?.detail).toContain('SHED');
    expect(state.creates).toBe(0);
  });
});

describe('recordContentVersion — a re-derivation with identical text is NOT a new row (§3 :316-:317)', () => {
  it('returns the EXISTING row on an identical content hash, and creates nothing', async () => {
    const existing = versionRow({ id: 'version-existing', contentVersionHash: '0x' + 'd'.repeat(64) });
    const state = store([existing]);
    const derived: DerivedContent = {
      text: existing.text,
      contentVersionHash: existing.contentVersionHash,
      extractor: 'pdfjs',
      extractorVersion: CURRENT_EXTRACTOR,
      readFailed: false,
      derivedFrom: 'HELD_BYTES',
    };

    const row = await recordContentVersion(state.tx, existing.commitment, derived);

    // NO NEW ROW — the same row, by id, and nothing created. What DID change is the
    // ruling of 2026-09-23: the row records that today's extractor REPRODUCED its text,
    // which is what makes CURRENT(d) resolve to it instead of reading AWAITING for ever.
    expect(row.id).toBe(existing.id);
    expect(row.derivations.map((d) => d.extractorVersion)).toEqual([OLD_EXTRACTOR, CURRENT_EXTRACTOR]);
    expect(row.extractorVersion).toBe(OLD_EXTRACTOR);
    expect(state.creates).toBe(0);
    expect(state.rows).toHaveLength(1);
    // AND THE FLOOR, so the case is not satisfied by a writer that creates nothing at
    // all: a DIFFERENT hash on the same document does create a row.
    const moved = await recordContentVersion(state.tx, existing.commitment, {
      ...derived,
      contentVersionHash: '0x' + 'e'.repeat(64),
    });
    expect(moved.id).not.toBe(existing.id);
    expect(state.creates).toBe(1);
    expect(state.rows).toHaveLength(2);
    // A row created today carries today's extractor as the first that reproduced it.
    expect(moved.derivations.map((d) => d.extractorVersion)).toEqual([CURRENT_EXTRACTOR]);
  });

  // DECLARED ADDITION, step 34 chunk 5-0 — the researcher's Q-R1 (R86 Entry 4): "one row per derivation, (versionId,
  // extractorVersion, at), at null only for rows derived before the table". NULL is the MIGRATION's word for a moment
  // nobody kept; the writer always knows its moment, so a row it writes with none would be a false "not recorded".
  it('Q-R1 — a CREATED version writes its first derivation row in the same write, `at` = the version’s own derivedAt, NEVER null', async () => {
    const state = store();
    const derived: DerivedContent = {
      text: 'a new text',
      contentVersionHash: '0x' + 'f'.repeat(64),
      extractor: 'pdfjs',
      extractorVersion: CURRENT_EXTRACTOR,
      readFailed: false,
      derivedFrom: 'HELD_BYTES',
    };

    const created = await recordContentVersion(state.tx, '0x' + 'b'.repeat(64), derived);

    // THE FLOOR: exactly one row was written, so the next lines cannot pass over none.
    expect(state.derivationWrites).toHaveLength(1);
    expect(state.derivationWrites.at(0)).toEqual({ versionId: created.id, extractorVersion: CURRENT_EXTRACTOR, at: created.derivedAt });
    expect(state.derivationWrites.at(0)?.at).toBeInstanceOf(Date);
    expect(created.derivations).toEqual([{ extractorVersion: CURRENT_EXTRACTOR, at: created.derivedAt }]);
  });

  it('Q-R1 — a RE-REACHED version gains a row whose `at` is THIS derivation’s moment, NEVER null and never the version’s derivedAt (A→B→A)', async () => {
    const existing = versionRow({ id: 'version-existing', contentVersionHash: '0x' + 'd'.repeat(64) });
    const state = store([existing]);
    const before = Date.now();

    const row = await recordContentVersion(state.tx, existing.commitment, {
      text: existing.text,
      contentVersionHash: existing.contentVersionHash,
      extractor: 'pdfjs',
      extractorVersion: CURRENT_EXTRACTOR,
      readFailed: false,
      derivedFrom: 'HELD_BYTES',
    });

    expect(state.derivationWrites).toHaveLength(1);
    const written = state.derivationWrites.at(0);
    expect(written?.versionId).toBe(existing.id);
    expect(written?.at).toBeInstanceOf(Date);
    // The moment the version BECAME current under today's extractor (A3 :1369 as CONFORMED) — now, not the past its
    // own `derivedAt` names (new Date(0) here).
    expect(written?.at?.getTime() ?? 0).toBeGreaterThanOrEqual(before);
    expect(written?.at?.getTime()).not.toBe(existing.derivedAt.getTime());
    expect(row.derivations.at(-1)).toEqual({ extractorVersion: CURRENT_EXTRACTOR, at: written?.at });
  });

  it('returns the row UNTOUCHED when this extractor is already in its list — append-only is not append-again', async () => {
    const existing = versionRow({
      id: 'version-existing',
      contentVersionHash: '0x' + 'd'.repeat(64),
      derivations: [
        { extractorVersion: OLD_EXTRACTOR, at: new Date(0) },
        { extractorVersion: CURRENT_EXTRACTOR, at: new Date(60_000) },
      ],
    });
    const state = store([existing]);

    const row = await recordContentVersion(state.tx, existing.commitment, {
      text: existing.text,
      contentVersionHash: existing.contentVersionHash,
      extractor: 'pdfjs',
      extractorVersion: CURRENT_EXTRACTOR,
      readFailed: false,
      derivedFrom: 'HELD_BYTES',
    });

    expect(row).toBe(existing);
    expect(row.derivations.map((d) => d.extractorVersion)).toEqual([OLD_EXTRACTOR, CURRENT_EXTRACTOR]);
    expect(state.creates).toBe(0);
    expect(state.derivationWrites).toEqual([]);
  });

  it('a READ THAT FAILED reaches the ROW \u2014 deriveContent carries it and the writer stores it (A2 :1300)', async () => {
    // THE SEAM, and nothing asserted it until a decoy blinded it and reddened NOTHING.
    // `extract` distinguishing READ_FAILED is worth nothing if the fact stops at the
    // service boundary: `extractor-coverage` counts a broken PDF apart from a photograph
    // by the COLUMN (A7 :1591), so the column is what has to carry it.
    const corrupt = Buffer.from('this is not a workbook at all', 'utf8');
    const name = docIdOf(corrupt);
    const publicName = commitmentOf(name, Buffer.alloc(32, 7));

    const derived = await deriveContent(
      corrupt,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      publicName,
      'HELD_BYTES',
    );

    expect(derived.readFailed).toBe(true);
    expect(derived.text).toBeNull();
    // Bytes-only, so the hash IS the document's COMMITMENT \u2014 a failed read is still bytes
    // the platform holds, never a document it turned away. DECLARED EDIT, document step 34 (R85 Q-G; A1 :1243 as
    // CONFORMED 2026-09-26): it read "the document's own name" (the DOC_ID); STRENGTHENED to the commitment, and never
    // the DOC_ID, which the pin would publish below BYTES.
    expect(derived.contentVersionHash).toBe(publicName);
    expect(derived.contentVersionHash).not.toBe(name);

    const state = store();
    const row = await recordContentVersion(state.tx, '0x' + 'b'.repeat(64), derived);
    expect(row.readFailed).toBe(true);
    expect(state.creates).toBe(1);
  });

  it('a read that SUCCEEDED stores readFailed false \u2014 the floor, so the case above is not a constant', async () => {
    const name = '0x' + '8'.repeat(64);

    const derived = await deriveContent(SHEET.bytes(), SHEET.mimeType, name, 'HELD_BYTES');

    expect(derived.readFailed).toBe(false);
    expect(derived.text).toBe(SHEET.groundTruth);

    const state = store();
    const row = await recordContentVersion(state.tx, '0x' + 'b'.repeat(64), derived);
    expect(row.readFailed).toBe(false);
  }, 30000);

  // DECLARED EDIT, document step 34 (R85 Q-G; A1 :1243 as CONFORMED 2026-09-26): "IS the document's own name" (the
  // DOC_ID) → the COMMITMENT, and never the DOC_ID — STRENGTHENED, a real docId and a real commitment of it.
  it('the bytes-only arm derives a version whose hash IS the document’s COMMITMENT, never its DOC_ID (A1 :1243 as CONFORMED)', async () => {
    const audio = fixture('UNREADABLE');
    const name = docIdOf(audio.bytes());
    const publicName = commitmentOf(name, Buffer.alloc(32, 15));

    const derived = await deriveContent(audio.bytes(), audio.mimeType, publicName, 'HELD_BYTES');

    expect(derived.text).toBeNull();
    expect(derived.contentVersionHash).toBe(publicName);
    expect(derived.contentVersionHash).not.toBe(name);
    expect(derived.extractorVersion).toBe(CURRENT_EXTRACTOR);
  });
});

describe('the OPINION register REFUSES an unlabelled reading — COMPLIANCE.md rule 3', () => {
  // THE SUBJECT MOVED, THE ASSERTIONS DID NOT: since step 30 a reading is a `DocumentOpinion`
  // ROW, appended (A2 :1302 as ruled 2026-09-23), where it was an update of one column. Each
  // case below holds what it held before — the label refused, the floor that writes — over the
  // table, plus the one property the column could not have: a SECOND reading beside the first.
  const RESEARCHER = { by: 'RESEARCHER', researcherId: 'res_1' } as const;

  it('REFUSES a reading carrying no model and no promptVersion', async () => {
    const state = store([versionRow({ id: 'version-1' })]);
    const unlabelled = { body: { summary: 'a ministry circular about reporting' } } as never;

    await expect(recordOpinion(state.tx, 'version-1', RESEARCHER, unlabelled)).rejects.toThrow();
    expect(state.opinions).toEqual([]);
  });

  it('REFUSES one whose model is an EMPTY STRING — a label that labels nothing', async () => {
    const state = store([versionRow({ id: 'version-1' })]);
    const blank = { model: '', promptVersion: 'v1', body: { summary: 'a circular' } };

    await expect(recordOpinion(state.tx, 'version-1', RESEARCHER, blank)).rejects.toThrow();
    expect(state.opinions).toEqual([]);
  });

  it('WRITES a labelled one — the floor, so the refusals above are not a writer that refuses everything', async () => {
    const state = store([versionRow({ id: 'version-1' })]);

    const row = await recordOpinion(state.tx, 'version-1', RESEARCHER, {
      model: 'claude-opus-5',
      promptVersion: 'document-describe-v1',
      body: { summary: 'a ministry circular about the reporting channel' },
    });

    expect(row).toMatchObject({
      versionId: 'version-1',
      by: 'RESEARCHER',
      researcherId: 'res_1',
      model: 'claude-opus-5',
      promptVersion: 'document-describe-v1',
      body: { summary: 'a ministry circular about the reporting channel' },
    });
    // The hash does not move: an opinion is provenance BESIDE the version, never in it
    // (§3 :295-:296), so a reading recorded after a citation was pinned cannot move
    // what that citation names.
    expect(state.rows.at(0)?.contentVersionHash).toBe(versionRow().contentVersionHash);
  });

  it('a SECOND reading is APPENDED beside the first, never over it — A4 :1438\'s "appended" (A2 :1302 as ruled)', async () => {
    const state = store([versionRow({ id: 'version-1' })]);
    await recordOpinion(state.tx, 'version-1', RESEARCHER, { model: 'm', promptVersion: 'v1', body: { summary: 'first' } });
    await recordOpinion(state.tx, 'version-1', { by: 'RESEARCHER', researcherId: 'res_2' }, { model: 'm', promptVersion: 'v1', body: { summary: 'second' } });
    expect(state.opinions.map((o) => (o.body as { summary: string }).summary)).toEqual(['first', 'second']);
  });

  it('the RECEIPT arm is attributed to NOBODY — A2 :1303 as ruled, the CHECK\'s other arm', async () => {
    const state = store([versionRow({ id: 'version-1' })]);
    const row = await recordOpinion(state.tx, 'version-1', { by: 'RECEIPT' }, { model: 'm', promptVersion: 'v1', body: {} });
    expect(row.by).toBe('RECEIPT');
    expect(row.researcherId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE MEMBERSHIP — THE RE-DERIVATION TRAP, RULED BY THE RESEARCHER 2026-09-23; ROWS SINCE 2026-09-26 (Q-R1).
//
// §3 :317 (*a re-derivation yielding identical text is not a new row*) and A3 :1368
// (*the version with extractorVersion = CURRENT_EXTRACTOR*) together TRAPPED a held
// document whose text a new extractor REPRODUCES: no row carried the new version, so
// CURRENT(d) read AWAITING_DERIVATION forever while the pass reported UNCHANGED — and
// `EVIDENCE_DERIVED` (A6 :1531) is HARD, so the document became permanently uncitable.
//
// THE RULING: A2 :1300 gives the version an APPEND-ONLY record of every extractor version
// that reproduced this exact text — the `derivedUnder` column until 2026-09-26, one
// `DocumentContentDerivation` row each since (R86 Q-R1) — and A3 :1368 makes CURRENT(d)
// read MEMBERSHIP of it, never equality on `extractorVersion`. The row keeps its identity
// AND its provenance: `extractorVersion` still records which extractor FIRST produced the
// text and is never overwritten.
// ---------------------------------------------------------------------------

describe('CURRENT(d) reads MEMBERSHIP of the derivation rows — A3 :1368, A2 :1300', () => {
  it('a version a NEW extractor reproduced is CURRENT, not AWAITING_DERIVATION', () => {
    // The trapped document, exactly: derived once under the OLD extractor, and the
    // pass has since re-derived the same text under today's. One row, two versions in
    // its list, and `extractorVersion` still names the first.
    const reproduced = versionRow({
      extractorVersion: OLD_EXTRACTOR,
      derivations: [
        { extractorVersion: OLD_EXTRACTOR, at: new Date(0) },
        { extractorVersion: CURRENT_EXTRACTOR, at: new Date(60_000) },
      ],
    });

    const current = currentVersion(heldDocument(), [reproduced], CURRENT_EXTRACTOR, null);

    expect(current).toBe(reproduced);
    expect('awaiting' in current).toBe(false);
  });

  it('a version NO extractor reproduced under today’s is AWAITING_DERIVATION — the floor', () => {
    // Without this the case above is satisfied by a predicate that answers the first
    // row it is handed, which is the defect one step the other way.
    const stale = versionRow({ extractorVersion: OLD_EXTRACTOR, derivations: [{ extractorVersion: OLD_EXTRACTOR, at: new Date(0) }] });

    const current = currentVersion(heldDocument(), [stale], CURRENT_EXTRACTOR, null);

    expect(current).toEqual({ awaiting: true });
  });

  it('MEMBERSHIP and not equality — a row whose extractorVersion IS today’s but whose list is not still answers', () => {
    // `extractorVersion` is provenance and never the pointer. A row written by today's
    // extractor carries today's version in BOTH fields, so this states the direction
    // that decays: the rows are what is read.
    const first = versionRow({ extractorVersion: CURRENT_EXTRACTOR, derivations: [{ extractorVersion: CURRENT_EXTRACTOR, at: new Date(0) }] });

    expect(currentVersion(heldDocument(), [first], CURRENT_EXTRACTOR, null)).toBe(first);
  });
});

describe('the pass writes a DERIVATION ROW when it re-derives to content the version already holds', () => {
  it('appends today\u2019s extractor, moves NO row, and never overwrites extractorVersion', async () => {
    // The row already carries EXACTLY the text today's reader returns, derived under an
    // older extractor. Under the ruling the pass must record that today's extractor
    // REPRODUCED it — otherwise this document is the trapped one, awaiting forever.
    const document = heldDocument();
    const reproduced = versionRow({
      id: 'version-1',
      text: SHEET.groundTruth,
      contentVersionHash: contentVersionHashOf(SHEET.groundTruth, document.commitment),
      extractorVersion: OLD_EXTRACTOR,
    });
    const state = store([reproduced]);
    corpus([{ ...document, versions: state.rows, shed: null }], state);

    const report = await rederiveDocuments(() => Promise.resolve(SHEET.bytes()));

    expect(report.outcomes).toEqual([
      expect.objectContaining({ commitment: document.commitment, outcome: 'UNCHANGED' }),
    ]);
    // NO ROW MOVED: one version before, one after, and nothing created.
    expect(state.rows).toHaveLength(1);
    expect(state.creates).toBe(0);
    const after = state.rows.at(0);
    // THE PROVENANCE IS UNTOUCHED — `extractorVersion` still names the extractor that
    // FIRST produced this text, which is the whole reason the list exists beside it.
    expect(after?.extractorVersion).toBe(OLD_EXTRACTOR);
    expect(after?.derivations.map((d) => d.extractorVersion)).toContain(CURRENT_EXTRACTOR);
    expect(after?.derivations.map((d) => d.extractorVersion)).toContain(OLD_EXTRACTOR);
  }, 30000);

  it('appends ONCE \u2014 a second pass over the same document adds no duplicate', async () => {
    // Append-only is not append-again: the list is the SET of versions that reproduced
    // the text, and a pass run twice must not grow it.
    const document = heldDocument();
    const reproduced = versionRow({
      id: 'version-1',
      text: SHEET.groundTruth,
      contentVersionHash: contentVersionHashOf(SHEET.groundTruth, document.commitment),
      extractorVersion: OLD_EXTRACTOR,
      derivations: [
        { extractorVersion: OLD_EXTRACTOR, at: new Date(0) },
        { extractorVersion: CURRENT_EXTRACTOR, at: new Date(60_000) },
      ],
    });
    const state = store([reproduced]);
    corpus([{ ...document, versions: state.rows, shed: null }], state);

    await rederiveDocuments(() => Promise.resolve(SHEET.bytes()));

    expect(state.rows.at(0)?.derivations.map((d) => d.extractorVersion)).toEqual([OLD_EXTRACTOR, CURRENT_EXTRACTOR]);
    expect(state.derivationWrites).toEqual([]);
  }, 30000);
});
