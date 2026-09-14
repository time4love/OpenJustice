jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

import { join } from 'node:path';
import * as evidencePredicates from '../src/services/evidencePredicates';
import * as thesisPredicates from '../src/services/thesisPredicates';
import { listThesisReviews, type ThesisReviewList } from '../src/services/thesisReviews';
import type { TrajectoryCurrency } from '../src/services/trajectoryCitation';
import {
  AFTER,
  BEFORE,
  CAPTURE_NAME,
  CHUNKS,
  CURRENT_VERSION,
  DIFF_NAME,
  DIFF_ROW,
  PAGE,
  SUPERSEDED_VERSION,
  URL,
} from './helpers/corpusFixture';
import { resetDouble, store, written, type Row } from './helpers/evidenceDouble';
import {
  AUTHOR,
  BOTH_EVIDENCE_MENTION,
  BOTH_TRAJECTORY_MENTION,
  CITING_BOTH_VERSION,
  DEBATE,
  MENTION,
  NEXT_VERSION,
  THESIS,
  TRAJECTORY_ID,
  TRAJECTORY_MENTION,
  TRAJECTORY_VERSION,
  VERSION,
} from './thesis/fixtures';
import { CURRENCIES, trajectoriesAre, trajectoriesUnresolved } from './thesis/gateWorld';
import { mentionRow } from './thesis/rows';
import { AS_PUBLISHED, PUBLISHED_AT, seedThesis } from './thesis/tools';
import { codeOf, readCode } from './walk/scan';

// ---------------------------------------------------------------------------
// list_thesis_reviews' MATERIAL, INSTANTS AND ORDER — what `test/thesis/derivations.test.ts` and `reads.test.ts` do not
// see. docs/gf-thesis-flows.md T6 :863–:882, A3 :1408–:1410, A4 :1523–:1525; the R50 sketch §b, §c, §e1, §f3. Thesis
// step 24.
//
// The acceptance suite holds WHAT is owed (REVIEWS) and the envelope's shape; this file holds what a researcher reads
// beside each entry — FLAGGED's pin beside CURRENT from evidence's ONE loader (the researcher's ruling R-iii), the instant
// each became owed (q4 as amended), the tie-breaks — and that the list CALLS `reviews` rather than deciding an arm itself.
// In the unit project, which gates.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const minute = (m: number): Date => new Date(Date.UTC(2026, 8, 10, 9, m));

/** The pair's content versions as the evidence row loads them, each with the instant it was derived. */
const DERIVED_AT = minute(5);
const CURRENT_ROW = { ...CURRENT_VERSION, derivedAt: DERIVED_AT };
const OLDER_ROW = { ...SUPERSEDED_VERSION, derivedAt: minute(1) };

/** The cited diff as an evidence row — the shape `recordRowOf` selects. */
const diffEvidence = (versions: Row[], over: Row = {}): Row => ({
  fileHash: DIFF_NAME,
  kind: 'DIFF',
  status: 'PROMOTED',
  affirmedContentVersionHash: CURRENT_VERSION.contentVersionHash,
  snapshot: null,
  urlVersionDiff: {
    id: DIFF_ROW.id,
    trackedUrlId: PAGE.id,
    trackedUrl: { url: URL },
    beforeSnapshot: BEFORE,
    afterSnapshot: AFTER,
    contentVersions: versions,
  },
  ...over,
});

/** The kept text the before endpoint moved off, superseded by a page decision at `when`. */
const keptBefore = (when: Date): Row => ({
  snapshotId: BEFORE.id,
  textHash: SUPERSEDED_VERSION.beforeTextHash,
  text: 'קודם',
  textExtractionVersion: BEFORE.textExtractionVersion,
  supersededAt: when,
  supersededByDecisionId: 'page-decision-1',
  supersededByDecision: { id: 'page-decision-1', type: 'RULES_APPROVED', waybackTimestamp: BEFORE.waybackTimestamp, sequence: 3, researcherId: AUTHOR, createdAt: when },
});

/** THESIS published at VERSION, whose one citation pins `pin` — and REVIEWS answering exactly `entries`. */
function publishedCiting(pin: string, entries: thesisPredicates.ReviewEntry[]): void {
  seedThesis(AS_PUBLISHED);
  store.mentions = [mentionRow({ ...MENTION, contentVersionHash: pin }, true)];
  store.contentVersions = [
    { ...CURRENT_ROW, diffId: DIFF_ROW.id },
    { ...OLDER_ROW, diffId: DIFF_ROW.id },
  ];
  jest.spyOn(thesisPredicates, 'reviews').mockResolvedValue(entries);
}

const flaggedEntry = (reasons: evidencePredicates.FlagReason[]): thesisPredicates.ReviewEntry => ({
  kind: 'FLAGGED',
  thesisId: THESIS.id,
  name: DIFF_NAME,
  versionId: VERSION.id,
  mentionId: MENTION.id,
  reasons,
  command: 'add_thesis_version …',
});

/** One entry of the list, typed through the envelope the service exports. */
type ThesisReview = ThesisReviewList['reviews'][number];

const onlyReview = async (): Promise<ThesisReview> => {
  const list = await listThesisReviews(AUTHOR);
  expect(list.owed).toBe(1);
  const review = list.reviews.at(0);
  if (review === undefined) throw new Error('the list answered no review');
  return review;
};

describe('UNARGUED — the citation to argue, the record at its pin, and a command that pastes', () => {
  it('1. a DIFF citation names { url, before, after } and its pin; the command carries that record; owed since the head was written — and a CAPTURE citation names { url, capture }', async () => {
    seedThesis();
    const diff = await onlyReview();
    const pair = { url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp };
    expect(diff).toMatchObject({
      kind: 'UNARGUED',
      owedSince: VERSION.createdAt,
      material: { versionId: VERSION.id, record: pair, pin: CURRENT_VERSION.contentVersionHash },
      command: `open_debate thesisId=${THESIS.id} record=${JSON.stringify(pair)} rationale=…`,
    });

    store.mentions = [mentionRow({ ...MENTION, name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash }, false)];
    const capture = await onlyReview();
    const named = { url: URL, capture: BEFORE.waybackTimestamp };
    expect(capture).toMatchObject({ material: { record: named }, command: `open_debate thesisId=${THESIS.id} record=${JSON.stringify(named)} rationale=…` });
  });
});

describe('FLAGGED — the pin beside CURRENT, what moved, why, and what E3 last decided (R-iii)', () => {
  it('2. WITHDRAWN: the decision is the WITHDRAW with its reason; owed since the LATER of the publication and the withdrawal — both orders', async () => {
    const withdraw = (at: Date): Row => ({ fileHash: DIFF_NAME, sequence: 1, type: 'WITHDRAW', fromVersionHash: null, toVersionHash: null, reason: 'אינו תומך', researcherId: AUTHOR, createdAt: at });
    publishedCiting(CURRENT_VERSION.contentVersionHash, [flaggedEntry(['WITHDRAWN'])]);
    store.evidenceRows = [diffEvidence([CURRENT_ROW], { status: 'WITHDRAWN' })];

    store.decisions = [withdraw(minute(40))];
    const after = await onlyReview();
    expect(after).toMatchObject({ owedSince: minute(40), material: { decision: { type: 'WITHDRAW', reason: 'אינו תומך', at: minute(40) }, moved: { entered: [], left: [] } } });

    store.decisions = [withdraw(minute(20))];
    expect((await onlyReview()).owedSince).toEqual(PUBLISHED_AT);
  });

  it('3. NOT_CITATION_CURRENT on a DIFF: pin beside current, `movedBetween` CALLED, cause DECISION, decision null when never reviewed; owed since the LATER of the move and the publication — both orders', async () => {
    publishedCiting(SUPERSEDED_VERSION.contentVersionHash, [flaggedEntry(['NOT_CITATION_CURRENT'])]);
    store.evidenceRows = [diffEvidence([CURRENT_ROW, OLDER_ROW])];
    store.textVersions = [keptBefore(minute(45))];
    const moved = jest.spyOn(evidencePredicates, 'movedBetween');

    const review = await onlyReview();
    expect(review).toMatchObject({
      owedSince: minute(45),
      material: {
        pin: { hash: SUPERSEDED_VERSION.contentVersionHash, chunks: SUPERSEDED_VERSION.chunks },
        current: { hash: CURRENT_VERSION.contentVersionHash, chunks: CHUNKS },
        cause: [{ kind: 'DECISION', decisionId: 'page-decision-1', at: minute(45) }],
        decision: null,
      },
    });
    expect(moved).toHaveBeenCalledWith(SUPERSEDED_VERSION.chunks, CHUNKS);
    expect((review.material as { moved: unknown }).moved).toEqual(moved.mock.results.at(0)?.value);

    store.textVersions = [keptBefore(minute(25))];
    expect((await onlyReview()).owedSince).toEqual(PUBLISHED_AT);
  });

  it('4. on a CAPTURE: the pin is a kept text, its units SEGMENTS (no side), the cause EXTRACTOR', async () => {
    publishedCiting('text-before-old', [{ ...flaggedEntry(['NOT_CITATION_CURRENT']), name: CAPTURE_NAME }]);
    store.captures = store.captures.map((c) => (c['id'] === BEFORE.id ? { ...c, text: 'שורה חדשה.' } : c));
    store.evidenceRows = [
      {
        fileHash: CAPTURE_NAME,
        kind: 'CAPTURE',
        status: 'PROMOTED',
        affirmedContentVersionHash: BEFORE.textHash,
        snapshot: { ...BEFORE, trackedUrlId: PAGE.id, trackedUrl: { url: URL } },
        urlVersionDiff: null,
      },
    ];
    store.textVersions = [
      { snapshotId: BEFORE.id, textHash: 'text-before-old', text: 'שורה ישנה.', textExtractionVersion: 'v2-extractor', supersededAt: minute(50), supersededByDecisionId: null, supersededByDecision: null },
    ];

    const material = (await onlyReview()).material as { pin: { chunks: { side?: string }[] }; current: { hash: string }; cause: { kind: string }[]; record: unknown };
    expect(material.record).toEqual({ url: URL, capture: BEFORE.waybackTimestamp });
    expect([material.current.hash, material.cause.map((c) => c.kind)]).toEqual([BEFORE.textHash, ['EXTRACTOR']]);
    expect(material.pin.chunks.length).toBeGreaterThan(0);
    expect(material.pin.chunks.filter((unit) => unit.side !== undefined)).toEqual([]);
  });

  it('5. AWAITING_DERIVATION: current and moved are null; with no cause carrying a moment it is owed since the publication', async () => {
    const awaiting = { ...OLDER_ROW, contentVersionHash: 'content-awaiting' };
    publishedCiting('content-awaiting', [flaggedEntry(['AWAITING_DERIVATION'])]);
    store.evidenceRows = [diffEvidence([awaiting])];

    const review = await onlyReview();
    expect(review).toMatchObject({ owedSince: PUBLISHED_AT, material: { current: null, moved: null, cause: [{ kind: 'UNREADABLE' }] } });
  });

  it('6. a REAFFIRMED record: the decision names from → to', async () => {
    publishedCiting(SUPERSEDED_VERSION.contentVersionHash, [flaggedEntry(['NOT_CITATION_CURRENT'])]);
    store.evidenceRows = [diffEvidence([CURRENT_ROW, OLDER_ROW])];
    store.textVersions = [keptBefore(minute(45))];
    store.decisions = [
      { fileHash: DIFF_NAME, sequence: 2, type: 'REAFFIRM', fromVersionHash: SUPERSEDED_VERSION.contentVersionHash, toVersionHash: CURRENT_VERSION.contentVersionHash, reason: null, researcherId: AUTHOR, createdAt: minute(47) },
    ];
    expect((await onlyReview()).material).toMatchObject({
      decision: { sequence: 2, type: 'REAFFIRM', fromVersionHash: SUPERSEDED_VERSION.contentVersionHash, toVersionHash: CURRENT_VERSION.contentVersionHash },
    });
  });

  it('11. a pin that is NOT a stored version of the record THROWS naming the mention — a malformed pin, never an empty material', async () => {
    publishedCiting('content-nowhere', [flaggedEntry(['NOT_CITATION_CURRENT'])]);
    store.evidenceRows = [diffEvidence([CURRENT_ROW])];
    await expect(listThesisReviews(AUTHOR)).rejects.toThrow(MENTION.id);
  });

  it('FLAGGED reads PUBLISHED(t) ONLY — a HEAD citation `flagged` is stubbed to flag is not owed as FLAGGED (the sketch\'s F3 holder)', async () => {
    // Published at TRAJECTORY_VERSION (no record cited); the head CITING_BOTH_VERSION cites the diff. A3 :1408: FLAGGED
    // mentions of PUBLISHED(t) — so however `flagged` answers for the head's citation, REVIEWS owes it no FLAGGED entry.
    seedThesis({ ...AS_PUBLISHED, headVersionId: CITING_BOTH_VERSION.id, publishedVersionId: TRAJECTORY_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
    store.mentions = [mentionRow(TRAJECTORY_MENTION, true), mentionRow(BOTH_EVIDENCE_MENTION, false), mentionRow(BOTH_TRAJECTORY_MENTION, false)];
    trajectoriesAre(CURRENCIES.RECOMPUTED_AGREES);
    jest
      .spyOn(evidencePredicates, 'flagged')
      .mockResolvedValue({ flagged: true, armsEvaluated: evidencePredicates.FLAG_ARMS_EVALUATED, reasons: ['NOT_CITATION_CURRENT'] });
    expect((await thesisPredicates.reviews(AUTHOR)).map((e) => e.kind)).toEqual(['UNARGUED']);
  });

  it('12. WRITES NOTHING — the REAL `reviews` and the list, over a world owing all three kinds (chunk 2 round 1, M1)', async () => {
    // Published at VERSION, whose diff citation's record is WITHDRAWN (FLAGGED); the head CITING_BOTH_VERSION cites the
    // same diff, unargued (UNARGUED), and a trajectory the newest pass DISAGREES with (STALE_TRAJECTORY). Nothing stubbed
    // but the ONE resolver's currency — so a write anywhere on the path, REVIEWS included, is a write this case sees.
    seedThesis({ ...AS_PUBLISHED, headVersionId: CITING_BOTH_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
    store.mentions = [mentionRow(MENTION, true), mentionRow(BOTH_EVIDENCE_MENTION, false), mentionRow(BOTH_TRAJECTORY_MENTION, false)];
    store.evidenceRows = [diffEvidence([CURRENT_ROW], { status: 'WITHDRAWN' })];
    store.decisions = [
      { fileHash: DIFF_NAME, sequence: 1, type: 'WITHDRAW', fromVersionHash: null, toVersionHash: null, reason: 'אינו תומך', researcherId: AUTHOR, createdAt: minute(40) },
    ];
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);

    const owedKinds = (await thesisPredicates.reviews(AUTHOR)).map((e) => e.kind).sort();
    const listedKinds = (await listThesisReviews(AUTHOR)).reviews.map((r) => r.kind).sort();
    expect([owedKinds, listedKinds]).toEqual([
      ['FLAGGED', 'STALE_TRAJECTORY', 'UNARGUED'],
      ['FLAGGED', 'STALE_TRAJECTORY', 'UNARGUED'],
    ]);
    expect(written).toEqual([]);
  });
});

describe('STALE_TRAJECTORY — one entry per trajectory, the cited pass beside the newest', () => {
  /** Published at TRAJECTORY_VERSION; the head CITING_BOTH_VERSION cites the same trajectory and an unargued diff. */
  function publishedAndHeadCiteOneTrajectory(): void {
    seedThesis({ ...AS_PUBLISHED, headVersionId: CITING_BOTH_VERSION.id, publishedVersionId: TRAJECTORY_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION, CITING_BOTH_VERSION];
    store.mentions = [mentionRow(TRAJECTORY_MENTION, true), mentionRow(BOTH_EVIDENCE_MENTION, false), mentionRow(BOTH_TRAJECTORY_MENTION, false)];
  }

  const stale = (list: { reviews: ThesisReview[] }): ThesisReview[] => list.reviews.filter((r) => r.kind === 'STALE_TRAJECTORY');

  it('7. HEAD and PUBLISHED citing one id MERGE: one entry, citedOn both, owed since the LATER of the earlier citing instant and the newest pass', async () => {
    publishedAndHeadCiteOneTrajectory();
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const merged = stale(await listThesisReviews(AUTHOR));
    expect(merged).toHaveLength(1);
    expect(merged.at(0)).toMatchObject({
      name: TRAJECTORY_ID,
      citedOn: [
        { versionId: TRAJECTORY_VERSION.id, published: true },
        { versionId: CITING_BOTH_VERSION.id, published: false },
      ],
      // The head was written 09:17, before the 09:30 publication; the newest pass (09-05) precedes both.
      owedSince: CITING_BOTH_VERSION.createdAt,
      material: { currency: CURRENCIES.RECOMPUTED_DISAGREES, cited: { claimText: expect.any(String) as unknown } },
    });

    const later: TrajectoryCurrency = { ...CURRENCIES.RECOMPUTED_DISAGREES, latestComputedAt: '2026-09-11T00:00:00.000Z' } as TrajectoryCurrency;
    trajectoriesAre(later);
    expect(stale(await listThesisReviews(AUTHOR)).at(0)?.owedSince).toEqual(new Date('2026-09-11T00:00:00.000Z'));
  });

  it('8. NOT_FOLLOWED_BY_LATEST is owed — the ONE predicate `trajectoryCurrent`, never a state spelled here', async () => {
    seedThesis({ headVersionId: TRAJECTORY_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION];
    store.mentions = [mentionRow(TRAJECTORY_MENTION, false)];
    trajectoriesAre(CURRENCIES.NOT_FOLLOWED_BY_LATEST);
    expect(stale(await listThesisReviews(AUTHOR)).map((r) => [r.name, (r as { state: string }).state])).toEqual([[TRAJECTORY_ID, 'NOT_FOLLOWED_BY_LATEST']]);
  });

  it('13. a trajectory NO stored pass holds THROWS from REVIEWS naming the thesis and the id — `staleTrajectories` returns it in `missing`, asking the resolver ONCE', async () => {
    seedThesis({ headVersionId: TRAJECTORY_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION];
    store.mentions = [mentionRow(TRAJECTORY_MENTION, false)];
    const resolve = trajectoriesUnresolved();

    expect(await thesisPredicates.staleTrajectories(TRAJECTORY_VERSION.id)).toEqual({ stale: [], missing: [TRAJECTORY_ID] });
    expect(resolve).toHaveBeenCalledTimes(1);
    await expect(thesisPredicates.reviews(AUTHOR)).rejects.toThrow(new RegExp(`${THESIS.id}.*${TRAJECTORY_ID}`));
  });
});

describe('the list — oldest first, its ties, and REVIEWS CALLED', () => {
  it('9. equal instants order by A3\'s kinds — FLAGGED · STALE_TRAJECTORY · UNARGUED — then thesis, then name', async () => {
    seedThesis({ headVersionId: TRAJECTORY_VERSION.id });
    store.versions = [VERSION, TRAJECTORY_VERSION];
    store.mentions = [
      mentionRow({ ...MENTION, id: 'mention-diff', versionId: TRAJECTORY_VERSION.id }, false),
      mentionRow({ ...MENTION, id: 'mention-capture', versionId: TRAJECTORY_VERSION.id, name: CAPTURE_NAME, contentVersionHash: BEFORE.textHash }, false),
      mentionRow(TRAJECTORY_MENTION, false),
    ];
    // Every entry is owed from the head's writing: the newest pass (09-05) precedes it.
    trajectoriesAre(CURRENCIES.RECOMPUTED_DISAGREES);
    const list = await listThesisReviews(AUTHOR);
    expect(new Set(list.reviews.map((r) => r.owedSince.getTime())).size).toBe(1);
    expect(list.reviews.map((r) => [r.kind, r.name])).toEqual([
      ['STALE_TRAJECTORY', TRAJECTORY_ID],
      ...[CAPTURE_NAME, DIFF_NAME].sort().map((name) => ['UNARGUED', name]),
    ]);
  });

  it('10. the list is REVIEWS\' answer: an entry the world does not owe is listed, and `[]` over an owing world is `{ owed: 0, reviews: [] }`', async () => {
    seedThesis();
    store.mentions = [mentionRow(MENTION, false, DEBATE)];
    expect(await thesisPredicates.reviews(AUTHOR)).toEqual([]);
    const planted: thesisPredicates.ReviewEntry = { kind: 'UNARGUED', thesisId: THESIS.id, name: DIFF_NAME, versionId: VERSION.id, mentionId: MENTION.id, command: 'x' };
    const stub = jest.spyOn(thesisPredicates, 'reviews').mockResolvedValue([planted]);
    expect((await listThesisReviews(AUTHOR)).reviews.map((r) => [r.kind, r.name])).toEqual([['UNARGUED', DIFF_NAME]]);

    stub.mockResolvedValue([]);
    store.mentions = [mentionRow(MENTION, false)];
    expect(await listThesisReviews(AUTHOR)).toEqual({ owed: 0, reviews: [] });
  });
});

// ---------------------------------------------------------------------------
// ONE FUNCTION FOR READINESS AND REVIEWS (the R50 sketch §6-D16). No behaviour case can tell readiness' own loop from the
// call — the answer is byte-identical either way — so the source is what holds it.
// ---------------------------------------------------------------------------

const READINESS = join(__dirname, '..', 'src', 'mcp', 'tools', 'checkPublicationReadiness.ts');
const delegates = (code: string): { calls: boolean; ownFlagged: boolean; ownResolver: boolean } => ({
  calls: /\bflaggedCitations\(/.test(code) && /\bstaleTrajectories\(/.test(code),
  ownFlagged: /\bflagged\(/.test(code),
  ownResolver: /\bresolveTrajectoryCitations\(/.test(code),
});

describe('src/mcp/tools/checkPublicationReadiness.ts — its information through the two readings REVIEWS owes by', () => {
  it('src/mcp/tools/checkPublicationReadiness.ts imports flaggedCitations and staleTrajectories and calls neither flagged( nor resolveTrajectoryCitations( itself', () => {
    expect(delegates(codeOf(readCode(READINESS)))).toEqual({ calls: true, ownFlagged: false, ownResolver: false });
  });

  it('DETECTS its own loop kept beside the calls — and a comment naming one does not fire', () => {
    expect(delegates('await flaggedCitations(v); await staleTrajectories(v); const r = await flagged(m.id);').ownFlagged).toBe(true);
    expect(delegates('await flaggedCitations(v); await staleTrajectories(v); await resolveTrajectoryCitations(ids);').ownResolver).toBe(true);
    expect(delegates(codeOf('// flagged( and resolveTrajectoryCitations( are called by the readings\nawait flaggedCitations(v); await staleTrajectories(v);'))).toEqual({
      calls: true,
      ownFlagged: false,
      ownResolver: false,
    });
  });
});
