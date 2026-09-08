jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { findUnique: jest.fn(), findMany: jest.fn() },
    urlSnapshot: { findMany: jest.fn() },
    urlVersionDiff: { findMany: jest.fn() },
    cdxIndexEntry: { findFirst: jest.fn() },
    evidence: { findMany: jest.fn(), findUnique: jest.fn() },
    thesisMention: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    integrityCheck: { findMany: jest.fn() },
  },
}));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

const mockIsHashRegistered = jest.fn();
const mockReadEvidenceRecord = jest.fn();
const mockWeb3Constructor = jest.fn();
const REGISTRAR = `0x${'1'.repeat(40)}`;

jest.mock('../src/services/Web3Service', () => ({
  Web3Service: class {
    constructor() {
      mockWeb3Constructor();
    }
    isHashRegistered = mockIsHashRegistered;
    readEvidenceRecord = mockReadEvidenceRecord;
    get registryAddress(): string {
      return `0x${'9'.repeat(40)}`;
    }
    get registrarAddress(): string {
      return REGISTRAR;
    }
  },
}));

// THE jsdom BOUNDARY (refactor plan §8). `thesisClaimAudit` reaches
// `archiveText` → jsdom, which is ESM-only and unparseable in this project.
// `resolve_record` imports `extractText` DYNAMICALLY so no consumer drags it
// into a static graph; a case that actually resolves a citation still executes
// it, so it is mocked here exactly as every other suite mocks jsdom away.
const mockExtractText = jest.fn((_doc: unknown) => 'the published version, as plain text #ev_…');
jest.mock('../src/services/thesisClaimAudit', () => ({ extractText: mockExtractText }));

jest.mock('../src/lib/chainIdentity', () => ({
  readChainIdentity: jest.fn().mockResolvedValue({
    reachable: true,
    chainId: 84532,
    registryAddress: `0x${'9'.repeat(40)}`,
  }),
}));

import { prisma } from '../src/lib/prisma';
import { listFindingsHandler } from '../src/mcp/tools/listFindings';
import { getDiffInputHandler } from '../src/mcp/tools/getDiffInput';
import { resolveRecordHandler } from '../src/mcp/tools/resolveRecord';
import { checkOnChainStatusHandler } from '../src/mcp/tools/checkOnChainStatus';
import {
  AFTER,
  BEFORE,
  BETWEEN,
  CAPTURE_NAME,
  CURRENT_VERSION,
  DIFF_NAME,
  DIFF_ROW,
  PAGE,
  URL,
  anchorCheck,
} from './helpers/corpusFixture';

// ---------------------------------------------------------------------------
// THE FOUR CORPUS READS — docs/gf-evidence-flows.md A4, evidence step 12.
//
// One file because the four share a corpus and a gate, and because the property
// that matters most is a property OF THE SET: every one of them answers the same
// bytes to a researcher and to a stranger on a public page, and refuses only
// ACCESS on a private one. A4: "PUBLIC reads take no identity and answer
// identically for everyone … that is access, not a second behaviour: the output
// never depends on who asks."
//
// IN THE GATING PROJECT, DELIBERATELY. `test/evidence/` is the acceptance suite —
// red by design until the step that builds each symbol, and therefore not part of
// the required run. These four tools EXIST after this step, so what they publish
// and what they refuse belongs where `npm test` will fail on it.
// ---------------------------------------------------------------------------

const page = prisma.trackedUrl.findUnique as jest.Mock;
const pages = prisma.trackedUrl.findMany as jest.Mock;
const snapshots = prisma.urlSnapshot.findMany as jest.Mock;
const diffs = prisma.urlVersionDiff.findMany as jest.Mock;
const workListRow = prisma.cdxIndexEntry.findFirst as jest.Mock;
const evidenceRows = prisma.evidence.findMany as jest.Mock;
const evidenceRow = prisma.evidence.findUnique as jest.Mock;
const mentionCount = prisma.thesisMention.count as jest.Mock;
const mentions = prisma.thesisMention.findMany as jest.Mock;
const checks = prisma.integrityCheck.findMany as jest.Mock;

/**
 * `evidence.findMany` answers TWO different questions and the double has to tell
 * them apart: PUBLIC_PAGE asks which records belong to a page (`where.OR`), and
 * the timeline's linkage asks which of these names are promoted
 * (`where.fileHash.in`). A mock that answered both the same way would make the
 * gate and the linkage move together, which is precisely what they must not do.
 */
let promoted: { fileHash: string; status: string }[] = [];

/** The corpus every case starts from: one page, two captures, one pair, nothing promoted. */
function corpus(): void {
  promoted = [];
  page.mockResolvedValue(PAGE);
  pages.mockResolvedValue([PAGE]);
  snapshots.mockResolvedValue([BEFORE, AFTER]);
  diffs.mockResolvedValue([DIFF_ROW]);
  evidenceRow.mockResolvedValue(null);
  mentions.mockResolvedValue([]);
  checks.mockResolvedValue([]);
  workListRow.mockResolvedValue(null);
  evidenceRows.mockImplementation((args: { where?: { OR?: unknown; fileHash?: unknown } }) =>
    Promise.resolve(args.where?.OR === undefined ? promoted : recordsOfThePage),
  );
}

/** What PUBLIC_PAGE finds for this page: the records that could have been cited. */
let recordsOfThePage: { fileHash: string }[] = [{ fileHash: DIFF_NAME }];

/** PUBLIC_PAGE: a published version cites a record of this page, or none does. */
function published(is: boolean): void {
  recordsOfThePage = [{ fileHash: DIFF_NAME }];
  mentionCount.mockResolvedValue(is ? 1 : 0);
}

/** The linkage half: which of the page's records carry an evidence row. */
function promotedRows(rows: { fileHash: string; status: string }[]): void {
  promoted = rows;
}

function asResearcher(): void {
  mockResearcherId.mockReturnValue('researcher-1');
}
function asStranger(): void {
  mockResearcherId.mockReturnValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
  corpus();
  published(true);
  asStranger();
  // A REGISTRY THAT ACTUALLY HOLDS TWO ENTRIES. `isRegistered` answers with the
  // index of the hash it was ASKED about, and `getEvidence` returns what sits
  // there — because `attributeClaim` checks the two against each other, and a
  // double that returned index 0 for every hash would make the second capture
  // look like a contradiction the chain never had.
  const REGISTERED = [BEFORE.documentHash, AFTER.documentHash];
  mockIsHashRegistered.mockImplementation((hash: string) => {
    const index = REGISTERED.indexOf(hash.replace(/^0x/, ''));
    return Promise.resolve({ registered: index >= 0, evidenceId: BigInt(Math.max(index, 0)) });
  });
  mockReadEvidenceRecord.mockImplementation((index: bigint) =>
    Promise.resolve({
      fileHash: `0x${REGISTERED[Number(index)] ?? ''}`,
      submitter: REGISTRAR.toLowerCase(),
      timestamp: 1,
      category: 'DOCUMENT_SHA256',
    }),
  );
});

// ---------------------------------------------------------------------------
// list_findings
// ---------------------------------------------------------------------------

describe('list_findings — the page\'s timeline, in date order and no other', () => {
  it('returns every capture and every diff, in TIMESTAMP order', async () => {
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.captures.map((c: { capture: string }) => c.capture)).toEqual([
      BEFORE.waybackTimestamp,
      AFTER.waybackTimestamp,
    ]);
    expect(out.diffs).toHaveLength(1);
    expect(out.diffs[0].before).toBe(BEFORE.waybackTimestamp);
    expect(out.diffs[0].after).toBe(AFTER.waybackTimestamp);
  });

  it('names a diff by its PAIR of timestamps — never by a date and never by a row id', async () => {
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.diffs[0]).not.toHaveProperty('id');
    expect(out.diffs[0]).not.toHaveProperty('beforeDate');
    expect(out.diffs[0].before).toMatch(/^\d{14}$/);
  });

  it('carries the RECORD\'S OWN NAME on every entry, promoted or not', async () => {
    // Thesis T2: "list_findings returns the name of every record on a page's
    // timeline, promoted or not, so a draft can cite what the corpus holds
    // before anyone has argued for it." Without it citation-first is
    // unimplementable — there is nothing for a version to name.
    promotedRows([]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.captures[0].fileHash).toBe(CAPTURE_NAME);
    expect(out.diffs[0].fileHash).toBe(DIFF_NAME);
    expect(out.diffs[0].evidence).toBeNull();
  });

  it('reports attribution from the STORED verdict, and makes NO chain call', async () => {
    checks.mockResolvedValue([anchorCheck(BEFORE.id, { attributed: true })]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));

    expect(out.captures[0].anchor.attributed).toBe(true);
    expect(mockWeb3Constructor).not.toHaveBeenCalled();
    expect(mockIsHashRegistered).not.toHaveBeenCalled();
  });

  it('attributed is NULL where no verdict was ever stored — never false', async () => {
    // Three values, three facts. "Never asked" is not "not attributed", and a
    // boolean carrying both is the null-with-three-meanings this repository has
    // already paid for.
    checks.mockResolvedValue([]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.captures[0].anchor.attributed).toBeNull();
  });

  it('attributed is NULL for a verdict stored under an OLDER check version', async () => {
    checks.mockResolvedValue([
      anchorCheck(BEFORE.id, { attributed: true, verifierVersion: 'v1-decide-verdict-positive-consistency' }),
    ]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.captures[0].anchor.attributed).toBeNull();
  });

  it('the NEWEST verdict per capture wins, and the older ones are history', async () => {
    checks.mockResolvedValue([
      anchorCheck(BEFORE.id, { attributed: false, checkedAt: new Date('2026-09-08T00:00:00Z') }),
      anchorCheck(BEFORE.id, { attributed: true, checkedAt: new Date('2026-09-01T00:00:00Z') }),
    ]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.captures[0].anchor.attributed).toBe(false);
  });

  it('AWAITING_DERIVATION is a named state, not an empty answer', async () => {
    // The defect this whole step was pulled forward for: a read that answered
    // "nothing was looked at" in the shape of a real negative.
    diffs.mockResolvedValue([
      { ...DIFF_ROW, contentVersions: [{ ...CURRENT_VERSION, beforeTextHash: 'text-before-v2' }] },
    ]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));

    expect(out.diffs[0].awaitingDerivation).toBe(true);
    expect(out.diffs[0].current).toBeNull();
    expect(out.diffs[0].opinion).toBeNull();
  });

  it('NARROWED when the corpus holds an ACQUIRED capture between the endpoints', async () => {
    snapshots.mockResolvedValue([BEFORE, BETWEEN, AFTER]);
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.diffs[0].narrowed).toBe(true);
  });

  it('is not narrowed by its own endpoints', async () => {
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.diffs[0].narrowed).toBe(false);
  });

  it('linkage lists PUBLISHED citations only, for every caller', async () => {
    promotedRows([{ fileHash: DIFF_NAME, status: 'PROMOTED' }]);
    mentions.mockResolvedValue([{ refId: DIFF_NAME, thesisVersion: { thesisId: 'thesis-1' } }]);

    const out = JSON.parse(await listFindingsHandler({ url: URL }));

    expect(out.diffs[0].evidence).toEqual({
      fileHash: DIFF_NAME,
      status: 'PROMOTED',
      citedBy: [{ thesisId: 'thesis-1', published: true }],
    });
    // The query itself asks for published versions only — an unpublished draft's
    // citation is the thesis tools' and is gated there.
    expect(mentions.mock.calls[0][0].where.thesisVersion).toEqual({ isPublished: { isNot: null } });
  });

  it('REFUSES NOT_SURVEYED for a page the corpus does not hold', async () => {
    page.mockResolvedValue(null);
    const out = JSON.parse(await listFindingsHandler({ url: 'https://example.gov.il/x' }));
    expect(out.code).toBe('NOT_SURVEYED');
  });

  it('REFUSES NOT_PUBLIC to a stranger on a page no published thesis cites', async () => {
    published(false);
    asStranger();
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.code).toBe('NOT_PUBLIC');
  });

  it('answers a RESEARCHER on that same page', async () => {
    published(false);
    asResearcher();
    const out = JSON.parse(await listFindingsHandler({ url: URL }));
    expect(out.code).toBeUndefined();
    expect(out.page.public).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// get_diff_input
// ---------------------------------------------------------------------------

describe('get_diff_input — the pair, its two texts, and the current chunks', () => {
  beforeEach(() => {
    snapshots.mockResolvedValue([
      { ...BEFORE, text: 'the page before' },
      { ...AFTER, text: 'the page after' },
    ]);
  });

  it('returns both current texts and the CURRENT version\'s chunks', async () => {
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }),
    );
    expect(out.before.text).toBe('the page before');
    expect(out.after.text).toBe('the page after');
    expect(out.current.contentVersionHash).toBe(CURRENT_VERSION.contentVersionHash);
    expect(out.current.chunks).toHaveLength(2);
  });

  it('REFUSES NOT_A_CAPTURE for a DATE rather than a timestamp', async () => {
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: '2020-12-09', after: AFTER.waybackTimestamp }),
    );
    expect(out.code).toBe('NOT_A_CAPTURE');
    expect(out.error).toContain('14-digit');
  });

  it('NOT_A_CAPTURE says WHICH: a timestamp the page\'s work-list does not hold', async () => {
    workListRow.mockResolvedValue(null);
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: '20190101000000', after: AFTER.waybackTimestamp }),
    );
    expect(out.code).toBe('NOT_A_CAPTURE');
    expect(out.error).toContain('work-list at all');
  });

  it('NOT_A_CAPTURE says WHICH: a capture the page holds but never acquired', async () => {
    workListRow.mockResolvedValue({ status: 'DUPLICATE' });
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: '20190101000000', after: AFTER.waybackTimestamp }),
    );
    expect(out.code).toBe('NOT_A_CAPTURE');
    expect(out.error).toContain('DUPLICATE');
  });

  it('REFUSES NO_SUCH_DIFF for two real captures the walk never diffed', async () => {
    diffs.mockResolvedValue([]);
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }),
    );
    expect(out.code).toBe('NO_SUCH_DIFF');
  });

  it('REFUSES AWAITING_DERIVATION, NAMING THE DIFF', async () => {
    diffs.mockResolvedValue([
      { ...DIFF_ROW, contentVersions: [{ ...CURRENT_VERSION, afterTextHash: 'text-after-v2' }] },
    ]);
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }),
    );
    expect(out.code).toBe('AWAITING_DERIVATION');
    expect(out.error).toContain(`${BEFORE.waybackTimestamp} → ${AFTER.waybackTimestamp}`);
  });

  it('REFUSES NOT_PUBLIC to a stranger on a private page', async () => {
    published(false);
    const out = JSON.parse(
      await getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }),
    );
    expect(out.code).toBe('NOT_PUBLIC');
  });
});

// ---------------------------------------------------------------------------
// resolve_record
// ---------------------------------------------------------------------------

describe('resolve_record — what a citation points at', () => {
  it('resolves a DIFF name to its pair, its page and its verification', async () => {
    evidenceRow.mockResolvedValue({
      fileHash: DIFF_NAME,
      kind: 'DIFF',
      snapshot: null,
      urlVersionDiff: {
        trackedUrlId: PAGE.id,
        beforeSnapshot: { ...BEFORE, trackedUrl: { url: URL } },
        afterSnapshot: { ...AFTER, trackedUrl: { url: URL } },
      },
    });
    checks.mockResolvedValue([anchorCheck(BEFORE.id), anchorCheck(AFTER.id)]);

    const out = JSON.parse(await resolveRecordHandler({ fileHash: DIFF_NAME }));

    expect(out.kind).toBe('DIFF');
    expect(out.record).toEqual({ before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp });
    expect(out.recomputable).toBe(true);
    expect(out.verified.verified).toBe(true);
    expect(out.verified.captures).toHaveLength(2);
    expect(out.verified.captures[0].anchoredHash).toBe(BEFORE.anchoredHash);
    expect(out.verified.captures[0].anchoredHashMatchesDocumentHash).toBe(true);
  });

  it('resolves an UNPROMOTED record — a name exists before any evidence row', async () => {
    evidenceRow.mockResolvedValue(null);
    const out = JSON.parse(await resolveRecordHandler({ fileHash: CAPTURE_NAME }));

    expect(out.kind).toBe('CAPTURE');
    expect(out.record).toEqual({ capture: BEFORE.waybackTimestamp });
    // VERIFIED is a property of an evidence ROW; a record nobody promoted has
    // not failed the check, it has not been put to one.
    expect(out.verified).toEqual({ notEvaluable: 'NOT_PROMOTED' });
  });

  it('VERIFIED is FALSE when a capture\'s attribution was never stored', async () => {
    // An unanswered question is not a pass. This is the 2026-08-20 audit's whole
    // lesson, as a predicate.
    evidenceRow.mockResolvedValue({
      fileHash: CAPTURE_NAME,
      kind: 'CAPTURE',
      snapshot: { ...BEFORE, trackedUrl: { url: URL } },
      urlVersionDiff: null,
    });
    checks.mockResolvedValue([]);

    const out = JSON.parse(await resolveRecordHandler({ fileHash: CAPTURE_NAME }));

    expect(out.verified.verified).toBe(false);
    expect(out.verified.captures[0].attributed).toBeNull();
  });

  it('VERIFIED is FALSE when the anchored hash is not the hash of the bytes as served', async () => {
    evidenceRow.mockResolvedValue({
      fileHash: CAPTURE_NAME,
      kind: 'CAPTURE',
      snapshot: { ...BEFORE, anchoredHash: 'something-else', trackedUrl: { url: URL } },
      urlVersionDiff: null,
    });
    checks.mockResolvedValue([anchorCheck(BEFORE.id)]);

    const out = JSON.parse(await resolveRecordHandler({ fileHash: CAPTURE_NAME }));
    expect(out.verified.verified).toBe(false);
    expect(out.verified.captures[0].anchoredHashMatchesDocumentHash).toBe(false);
  });

  it('recomputable is FALSE when the row is keyed to a DIFFERENT record than its name', async () => {
    // THE ROW IS MALFORMED, AND THE READ MUST NOT LAUNDER IT. `fileHash` is a
    // valid name — of the BEFORE capture — while `snapshotId` points at AFTER.
    // The name resolves through the corpus to BEFORE, so a read that reported
    // `recomputable: true` from the resolution alone would publish a verified
    // block computed over the WRONG capture beside a name it does not belong to.
    // RECOMPUTABLE is a property of the ROW: "a row that fails it is MALFORMED,
    // never stale — nothing legitimate makes it false."
    evidenceRow.mockResolvedValue({
      fileHash: CAPTURE_NAME,
      kind: 'CAPTURE',
      snapshot: { ...AFTER, trackedUrl: { url: URL } },
      urlVersionDiff: null,
    });
    checks.mockResolvedValue([anchorCheck(AFTER.id)]);

    const out = JSON.parse(await resolveRecordHandler({ fileHash: CAPTURE_NAME }));

    expect(out.recomputable).toBe(false);
    expect(out.verified.verified).toBe(false);
  });

  it('REFUSES NOT_A_RECORD for a name the corpus cannot reproduce', async () => {
    const out = JSON.parse(await resolveRecordHandler({ fileHash: `0x${'f'.repeat(64)}` }));
    expect(out.code).toBe('NOT_A_RECORD');
  });

  it('REFUSES NOT_PUBLIC to a stranger on a private page', async () => {
    published(false);
    const out = JSON.parse(await resolveRecordHandler({ fileHash: CAPTURE_NAME }));
    expect(out.code).toBe('NOT_PUBLIC');
  });
});

// ---------------------------------------------------------------------------
// check_on_chain_status
// ---------------------------------------------------------------------------

describe('check_on_chain_status — the registry, about a CAPTURE', () => {
  it('reads chain STATE for one capture: registered, at an index, submitted by whom', async () => {
    const out = JSON.parse(
      await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    );

    expect(out.captures).toHaveLength(1);
    expect(out.captures[0].isRegistered).toBe(true);
    expect(out.captures[0].attributed).toBe(true);
    expect(out.captures[0].submitter).toBe(REGISTRAR.toLowerCase());
    expect(out.captures[0].anchoredHashMatchesDocumentHash).toBe(true);
    expect(out.registry.chainId).toBe(84532);
  });

  it('reports the STORED verdict beside the live one, with its version', async () => {
    checks.mockResolvedValue([anchorCheck(BEFORE.id)]);
    const out = JSON.parse(
      await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    );
    expect(out.captures[0].storedVerdict.verifierVersion).toBeDefined();
    expect(out.captures[0].storedVerdict.attributed).toBe(true);
  });

  it('asked about a RECORD, answers about every capture beneath it', async () => {
    const out = JSON.parse(await checkOnChainStatusHandler({ fileHash: DIFF_NAME }));
    expect(out.captures.map((c: { capture: string }) => c.capture)).toEqual([
      BEFORE.waybackTimestamp,
      AFTER.waybackTimestamp,
    ]);
  });

  it('reads ONE entry per capture, at the index the registry named', async () => {
    await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp });
    expect(mockReadEvidenceRecord).toHaveBeenCalledTimes(1);
  });

  it('a FOREIGN submitter is registered and NOT attributed', async () => {
    mockReadEvidenceRecord.mockResolvedValue({
      fileHash: `0x${BEFORE.documentHash}`,
      submitter: `0x${'2'.repeat(40)}`,
      timestamp: 1,
      category: 'DOCUMENT_SHA256',
    });
    const out = JSON.parse(
      await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    );
    expect(out.captures[0].isRegistered).toBe(true);
    expect(out.captures[0].attributed).toBe(false);
  });

  it('REFUSES CHAIN_UNAVAILABLE rather than reporting the hash unregistered', async () => {
    mockIsHashRegistered.mockRejectedValue(new Error('no backend is currently healthy'));
    const out = JSON.parse(
      await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    );
    expect(out.code).toBe('CHAIN_UNAVAILABLE');
    expect(out.error).toContain('NOT');
  });

  it('REFUSES CHAIN_UNAVAILABLE when two reads of one state disagree', async () => {
    mockReadEvidenceRecord.mockResolvedValue({
      fileHash: `0x${'c'.repeat(64)}`,
      submitter: REGISTRAR.toLowerCase(),
      timestamp: 1,
      category: 'DOCUMENT_SHA256',
    });
    const out = JSON.parse(
      await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    );
    expect(out.code).toBe('CHAIN_UNAVAILABLE');
    expect(out.error).toContain('inconsistently');
  });

  it('REFUSES NOT_A_CAPTURE for a capture the corpus never acquired', async () => {
    const out = JSON.parse(await checkOnChainStatusHandler({ url: URL, capture: '20190101000000' }));
    expect(out.code).toBe('NOT_A_CAPTURE');
  });

  it('REFUSES NOT_A_RECORD for a fileHash naming nothing', async () => {
    const out = JSON.parse(await checkOnChainStatusHandler({ fileHash: `0x${'e'.repeat(64)}` }));
    expect(out.code).toBe('NOT_A_RECORD');
  });

  it('REFUSES NOT_PUBLIC to a stranger on a private page — like its three siblings', async () => {
    published(false);
    const out = JSON.parse(
      await checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    );
    expect(out.code).toBe('NOT_PUBLIC');
    expect(mockWeb3Constructor).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// THE PROPERTY OF THE SET.
// ---------------------------------------------------------------------------

describe('a PUBLIC read answers IDENTICALLY, with and without an identity', () => {
  // A4: "PUBLIC reads take no identity and answer identically for everyone.
  // Access to a page's timeline is gated by PUBLIC_PAGE for a caller without
  // identity — that is ACCESS, not a second behaviour: the output never depends
  // on who asks." Asserted BYTE FOR BYTE, per tool, because the failure this
  // forbids is a read that quietly shows a researcher more.
  const CALLS: [string, () => Promise<string>][] = [
    ['list_findings', () => listFindingsHandler({ url: URL })],
    [
      'get_diff_input',
      () => getDiffInputHandler({ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }),
    ],
    ['resolve_record', () => resolveRecordHandler({ fileHash: CAPTURE_NAME })],
    [
      'check_on_chain_status',
      () => checkOnChainStatusHandler({ url: URL, capture: BEFORE.waybackTimestamp }),
    ],
  ];

  it.each(CALLS)('%s returns the same bytes to a researcher and to a stranger', async (_name, call) => {
    snapshots.mockResolvedValue([
      { ...BEFORE, text: 'the page before' },
      { ...AFTER, text: 'the page after' },
    ]);
    evidenceRow.mockResolvedValue(null);

    asStranger();
    const anonymous = await call();
    jest.clearAllMocks();
    corpus();
    published(true);
    snapshots.mockResolvedValue([
      { ...BEFORE, text: 'the page before' },
      { ...AFTER, text: 'the page after' },
    ]);
    evidenceRow.mockResolvedValue(null);
    mockIsHashRegistered.mockResolvedValue({ registered: true, evidenceId: BigInt(0) });
    mockReadEvidenceRecord.mockResolvedValue({
      fileHash: `0x${BEFORE.documentHash}`,
      submitter: REGISTRAR.toLowerCase(),
      timestamp: 1,
      category: 'DOCUMENT_SHA256',
    });
    mockExtractText.mockReturnValue('the published version, as plain text #ev_…');
    asResearcher();
    const identified = await call();

    expect(identified).toBe(anonymous);
  });
});
