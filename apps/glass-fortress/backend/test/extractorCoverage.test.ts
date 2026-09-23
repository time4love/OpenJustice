// ---------------------------------------------------------------------------
// `extractor-coverage`, THE INSTRUMENT — flows A7 :1591, §12 :1207, plan :154-:157.
//
// "COMPUTED text against bytes-only, by type and by door." It answers the plan's
// question at step 29 — does the chosen extractor read each of §3's four kinds — and
// §12's question later, over the real corpus. It reports BOTH subjects and says which
// is which, because at step 29 the corpus holds no document and a number standing for
// both would judge nothing.
//
// THE ONE PROPERTY THAT IS NOT A MEASUREMENT: an instrument that cannot LOOK must
// never report ZERO. A corpus with no documents reports zero documents in terms; a
// fixture set that cannot be READ throws. Those are different answers to different
// questions and this house has paid for conflating them. Both arms are asserted here.
//
// `measureFixtures` IS GIVEN A DIRECTORY, so these cases build their own and never
// depend on the committed set staying as it is — except the one case that asserts the
// committed set IS the subject, which is what makes the rest non-vacuous. THE PDF KIND IS
// NOT AMONG THEM: `pdfjs-dist` 6.3.289 is ESM-only and no mechanism loads it inside jest
// (three were measured failing — `documentExtractor.ts`'s header records them). Its arm is
// measured by this same instrument under plain Node. Named, never implied.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { document: { findMany: jest.fn() } },
}));

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { CURRENT_EXTRACTOR } from '../src/lib/documentExtractor';
import { prisma } from '../src/lib/prisma';
import {
  fixtureDirectory,
  formatCoverage,
  measureCorpus,
  measureFixtures,
  type CoverageReport,
} from '../src/services/extractorCoverage';
import { FIXTURES } from './documentFixtureBytes';

const mocked = prisma as unknown as { document: { findMany: jest.Mock } };

/** A directory holding the fixtures jest can load, with a manifest of the same shape. */
function directoryOf(kinds: readonly string[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'coverage-'));
  const entries = FIXTURES.filter((fixture) => kinds.includes(fixture.kind)).map((fixture) => {
    const bytes = fixture.bytes();
    writeFileSync(join(directory, fixture.file), bytes);
    return {
      kind: fixture.kind,
      file: fixture.file,
      mimeType: fixture.mimeType,
      byteLength: bytes.length,
      docId: '0x' + '0'.repeat(64),
      groundTruth: fixture.groundTruth,
      proves: fixture.proves,
    };
  });
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ kinds: entries.length, fixtures: entries }));
  return directory;
}

const directories: string[] = [];
afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

function temporary(kinds: readonly string[]): string {
  const directory = directoryOf(kinds);
  directories.push(directory);
  return directory;
}

describe('the FIXTURE half — the extractor measured over real bytes', () => {
  it('reports COMPUTED, BYTES-ONLY and the REASON per kind, with a character count', async () => {
    const measured = await measureFixtures(temporary(['SCAN', 'SPREADSHEET', 'UNREADABLE']));

    expect(measured).toEqual([
      expect.objectContaining({ kind: 'SCAN', computed: false, reason: 'OCR_NONE', characters: 0 }),
      expect.objectContaining({ kind: 'SPREADSHEET', computed: true, reason: 'COMPUTED' }),
      expect.objectContaining({ kind: 'UNREADABLE', computed: false, reason: 'NO_READER_FOR_TYPE', characters: 0 }),
    ]);
    // "computed" is never a bare bit: the character count is what stops a reader that
    // returns an empty string from being reported as a reader that worked.
    expect(measured.at(1)?.characters).toBeGreaterThan(0);
  });

  it('THROWS on a fixture set it cannot read — an instrument that cannot look never reports zero', async () => {
    await expect(measureFixtures(join(tmpdir(), 'no-such-fixture-directory-9f2a'))).rejects.toThrow(
      /could not be read/,
    );
  });

  it('REFUSES a manifest that is not the shape it expects — from the SCHEMA, by its type', async () => {
    // THE ASSERTION IS THE REFUSAL'S TYPE, AND TWO WEAKER ONES WERE MEASURED FAILING
    // to hold it. `rejects.toThrow()` alone is satisfied by any downstream TypeError,
    // and so is `toThrow(/fixtures/)` — because deleting the parse leaves
    // `manifest.fixtures is not iterable`, whose message CONTAINS the word. Both
    // "passed" with the validation removed. A ZodError can only come from the parse.
    const directory = temporary([]);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ kinds: 4 }));

    await expect(measureFixtures(directory)).rejects.toThrow(ZodError);
  });

  it('the COMMITTED set is the instrument’s real subject — the floor under every case above', () => {
    // Without this the cases above measure directories this file wrote, and the
    // instrument could be pointed anywhere while still passing them.
    const committed = fixtureDirectory();
    const manifest = JSON.parse(readFileSync(join(committed, 'manifest.json'), 'utf8')) as {
      kinds: number;
      fixtures: { kind: string }[];
    };

    expect(committed.endsWith(join('fixtures', 'documents'))).toBe(true);
    expect(manifest.kinds).toBe(4);
    expect(manifest.fixtures.map((fixture) => fixture.kind)).toEqual(FIXTURES.map((fixture) => fixture.kind));
  });
});

describe('the CORPUS half — §12, by type and by door', () => {
  it('ZERO documents is an ANSWER and is said in terms, never an outage', async () => {
    mocked.document.findMany.mockResolvedValue([]);

    const { rows, documents } = await measureCorpus();

    expect(documents).toBe(0);
    expect(rows).toEqual([]);
    const printed = formatCoverage({ extractor: CURRENT_EXTRACTOR, fixtures: [], corpus: rows, documents });
    expect(printed).toContain('ZERO documents');
    expect(printed).toContain('observation and not an outage');
  });

  it('buckets by the PAIR of type and door, and counts CURRENT’s four states apart', async () => {
    const version = {
      id: 'v1',
      commitment: '0xaa',
      text: 'the circular',
      contentVersionHash: '0xbb',
      extractor: 'exceljs',
      extractorVersion: CURRENT_EXTRACTOR,
      // CURRENT(d) reads MEMBERSHIP of this list, never equality on `extractorVersion`
      // (A3 :1368, ruled 2026-09-23).
      derivedUnder: [CURRENT_EXTRACTOR],
      readFailed: false,
      derivedAt: new Date(0),
      derivedFrom: 'AT_RECEIPT' as const,
      opinion: null,
    };
    const base = {
      docId: '0x01',
      salt: Buffer.alloc(32),
      cid: null,
      bytes: 'key',
      mimeType: 'text/csv',
      byteLength: 10,
      receivedAt: new Date(0),
      verifiedAtReceipt: null,
      assertedUrl: null,
      assertedAt: null,
      derivedFromCommitment: null,
      title: 't',
      createdAt: new Date(0),
      arrivals: [{ arrival: { door: 'RESEARCHER' } }],
    };
    mocked.document.findMany.mockResolvedValue([
      { ...base, commitment: '0xaa', versions: [version], shed: null },
      // Same type, same door — one bucket. No version under today's extractor: AWAITING.
      { ...base, commitment: '0xcc', versions: [], shed: null },
      // A different DOOR is a different bucket, even at the same type.
      { ...base, commitment: '0xdd', versions: [], shed: null, arrivals: [{ arrival: { door: 'INTAKE' } }] },
    ]);

    const { rows, documents } = await measureCorpus();

    expect(documents).toBe(3);
    expect(rows).toEqual([
      { mimeType: 'text/csv', doors: 'RESEARCHER', computed: 1, bytesOnly: 0, readFailed: 0, awaiting: 1, shed: 0 },
      { mimeType: 'text/csv', doors: 'INTAKE', computed: 0, bytesOnly: 0, readFailed: 0, awaiting: 1, shed: 0 },
    ]);
  });

  it('a READ THAT FAILED is counted APART from bytes no reader was selected for \u2014 A7 :1591', async () => {
    // A BROKEN PDF AND A PHOTOGRAPH ARE THE SAME COUNT AND NOT THE SAME FACT. One is a
    // document the platform COULD NOT READ; the other is a document there is nothing to
    // read in. A single bytes-only number would report a corpus of damaged files as a
    // corpus of photographs — the instrument measuring its own failures as the material's
    // nature, which is the shape `extractor-coverage` was already warned about for OCR.
    const bytesOnly = (commitment: string, readFailed: boolean) => ({
      docId: '0x01',
      commitment,
      salt: Buffer.alloc(32),
      cid: null,
      bytes: 'key',
      mimeType: 'application/pdf',
      byteLength: 10,
      receivedAt: new Date(0),
      verifiedAtReceipt: null,
      assertedUrl: null,
      assertedAt: null,
      derivedFromCommitment: null,
      title: 't',
      createdAt: new Date(0),
      arrivals: [{ arrival: { door: 'RESEARCHER' } }],
      shed: null,
      versions: [
        {
          id: `v-${commitment}`,
          commitment,
          text: null,
          contentVersionHash: '0x01',
          extractor: 'pdfjs',
          extractorVersion: CURRENT_EXTRACTOR,
          derivedUnder: [CURRENT_EXTRACTOR],
          readFailed,
          derivedAt: new Date(0),
          derivedFrom: 'HELD_BYTES' as const,
          opinion: null,
        },
      ],
    });
    mocked.document.findMany.mockResolvedValue([
      bytesOnly('0xbroken', true),
      bytesOnly('0xphoto', false),
    ]);

    const { rows } = await measureCorpus();

    // BOTH are bytes-only — `readFailed` is a SUBSET and never a fifth exclusive state,
    // so the columns still sum to the document count, which is how a reader checks a table.
    expect(rows).toEqual([
      { mimeType: 'application/pdf', doors: 'RESEARCHER', computed: 0, bytesOnly: 2, readFailed: 1, awaiting: 0, shed: 0 },
    ]);
    const printed = formatCoverage({ extractor: CURRENT_EXTRACTOR, fixtures: [], corpus: rows, documents: 2 });
    expect(printed).toContain('bytes-only 2 (read FAILED 1)');
  });

  it('a document with NO arrival is bucketed as NONE rather than under an empty name', async () => {
    mocked.document.findMany.mockResolvedValue([
      {
        docId: '0x01',
        commitment: '0xaa',
        salt: Buffer.alloc(32),
        cid: null,
        bytes: 'key',
        mimeType: 'audio/wav',
        byteLength: 10,
        receivedAt: new Date(0),
        verifiedAtReceipt: null,
        assertedUrl: null,
        assertedAt: null,
        derivedFromCommitment: null,
        title: 't',
        createdAt: new Date(0),
        arrivals: [],
        versions: [],
        shed: null,
      },
    ]);

    const { rows } = await measureCorpus();

    expect(rows.at(0)?.doors).toBe('NONE');
  });
});

describe('the report a reader actually reads', () => {
  it('states the extractor, the counts BEFORE the table, and that bytes-only is not a failure', () => {
    const report: CoverageReport = {
      extractor: CURRENT_EXTRACTOR,
      fixtures: [
        { kind: 'SPREADSHEET', file: 's.xlsx', mimeType: 'x', computed: true, reason: 'COMPUTED', characters: 76 },
        { kind: 'UNREADABLE', file: 'a.wav', mimeType: 'audio/wav', computed: false, reason: 'NO_READER_FOR_TYPE', characters: 0 },
      ],
      corpus: [],
      documents: 0,
    };

    const printed = formatCoverage(report);

    expect(printed).toContain(CURRENT_EXTRACTOR);
    expect(printed).toContain('2 kinds, 1 with COMPUTED text, 1 BYTES-ONLY');
    expect(printed).toContain('never a failure');
    // The reason travels with the row: "BYTES-ONLY" alone would not say WHY, and the
    // two bytes-only reasons — a decision (OCR_NONE) and a type nothing reads — are
    // different facts about the corpus.
    expect(printed).toContain('NO_READER_FOR_TYPE');
  });
});
