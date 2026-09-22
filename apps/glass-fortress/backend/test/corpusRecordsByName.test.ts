jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

import { db, resetDouble, store } from './helpers/evidenceDouble';
import { AFTER, BEFORE, CAPTURE_NAME, DIFF_NAME, DIFF_ROW, PAGE } from './helpers/corpusFixture';
import { recordsByName } from '../src/services/corpusReads';

// ---------------------------------------------------------------------------
// THE CORPUS WALK, NARROWED — UI-8 chunk A, `docs/gf-thesis-read-cost-2026-09-22.md`'s §2.
//
// THE PROPERTY: when every name asked for is PROMOTED, the pass searches those names' own pages and never
// reads `TrackedUrl` at all; when one is not, the full walk runs — ONCE, not once per name. `Evidence.snapshotId`
// and `Evidence.urlVersionDiffId` are `@unique` FKs, so a promoted name's record lives on that name's own page.
//
// AND THE FALL-THROUGH, which is the one that could produce a PUBLIC FALSE REFUSAL. The `@unique` argument is
// sound but nothing here holds it; if a promoted name does not match on the narrowed page set, the answer must
// be the full walk's and not `null`. `null` is A4's `NOT_A_RECORD` on the public `resolve_record` — a record
// the corpus plainly holds, reported as no record at all — and that is not a cost worth one saved query.
//
// THE INSTRUMENT IS THE DELEGATE'S OWN CALL COUNT, read as a DIFFERENCE around the act. `recordsByName` is
// driven DIRECTLY rather than through a body, so no other read can contribute a `trackedUrl.findMany` and a
// zero here means this function made none.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
});

/** A second page, so "the pages the names cite" and "every page" are different sets and the narrowing is visible. */
const OTHER_PAGE = { id: 'page-2', url: 'https://example.gov.il/other' };

/** One page with two captures and the diff between them; a second page the names do not cite. */
function seedCorpus(): void {
  store.pages = [PAGE, OTHER_PAGE];
  store.captures = [
    { ...BEFORE, trackedUrlId: PAGE.id },
    { ...AFTER, trackedUrlId: PAGE.id },
  ];
  store.diffs = [{ ...DIFF_ROW, trackedUrlId: PAGE.id }];
}

/** The `Evidence` row that PROMOTES a name, with the page its relation names — the narrowing's whole input. */
function promote(fileHash: string, kind: 'CAPTURE' | 'DIFF', page: { id: string; url: string } | null): void {
  store.evidenceRows = [
    ...store.evidenceRows,
    {
      fileHash,
      kind,
      snapshot: kind === 'CAPTURE' ? { trackedUrl: page } : null,
      urlVersionDiff: kind === 'DIFF' ? { trackedUrl: page } : null,
    },
  ];
}

const pageReads = (): number => db.trackedUrl.findMany.mock.calls.length;

describe('recordsByName — the corpus walk is narrowed by what the Evidence lookup answers (UI-8 chunk A)', () => {
  it('W0 — THE COUNTER SEES SOMETHING: the unpromoted world DOES read TrackedUrl, so a zero below is a narrowing and not a blind instrument', async () => {
    // THE VACUITY GUARD ON A COUNT (the `requireSubjects` shape, for a number). A `trackedUrl.findMany` that
    // was never wired to the double would read zero in EVERY case below and satisfy W1 for free. The floor is
    // one: the walk this chunk narrows must be observable before its absence can mean anything.
    seedCorpus();
    const before = pageReads();
    await recordsByName([CAPTURE_NAME]);
    expect(pageReads() - before).toBeGreaterThanOrEqual(1);
  });

  it('W1 — every name PROMOTED: no TrackedUrl read at all, and each name still resolves to its record', async () => {
    seedCorpus();
    promote(CAPTURE_NAME, 'CAPTURE', PAGE);
    promote(DIFF_NAME, 'DIFF', PAGE);

    const before = pageReads();
    const resolved = await recordsByName([CAPTURE_NAME, DIFF_NAME]);

    expect(pageReads() - before).toBe(0);
    expect([resolved.get(CAPTURE_NAME)?.fileHash, resolved.get(DIFF_NAME)?.fileHash]).toEqual([CAPTURE_NAME, DIFF_NAME]);
  });

  it('W2 — ONE name unpromoted: the full walk runs, and it runs ONCE for the whole set and not once per name', async () => {
    // A draft may cite first and argue after (thesis :439; `corpusReads.ts` :497–:500), so an unargued name has
    // no Evidence row and its page is recoverable only by recomputing. The walk is INHERENT for that name —
    // what this case holds is that it is inherent ONCE.
    seedCorpus();
    promote(CAPTURE_NAME, 'CAPTURE', PAGE);

    const before = pageReads();
    const resolved = await recordsByName([CAPTURE_NAME, DIFF_NAME]);

    expect(pageReads() - before).toBe(1);
    expect([resolved.get(CAPTURE_NAME)?.fileHash, resolved.get(DIFF_NAME)?.fileHash]).toEqual([CAPTURE_NAME, DIFF_NAME]);
  });

  it('W3 — a PROMOTED name whose Evidence row names a page its record is NOT on still resolves: the narrow pass falls through to the full walk, never to NOT_A_RECORD', async () => {
    // THE WORLD IS REACHABLE ONLY IF THE `@unique` FK ARGUMENT FAILS — which is exactly why it is held here
    // rather than asserted. Under a narrowing that returns `null` on a miss, the public `resolve_record` would
    // answer NOT_A_RECORD for a record the corpus holds, which is a false refusal on a public read.
    seedCorpus();
    promote(CAPTURE_NAME, 'CAPTURE', OTHER_PAGE);

    const before = pageReads();
    const resolved = await recordsByName([CAPTURE_NAME]);

    expect(resolved.get(CAPTURE_NAME)?.fileHash).toBe(CAPTURE_NAME);
    expect(pageReads() - before).toBe(1);
  });

  it('W4 — an Evidence row whose page CANNOT be read still resolves its name, and the walk runs once', async () => {
    // `promotedPage` gains an entry only where a relation answered a page (`corpusReads.ts` :547–:549), so the
    // predicate is `promotedPage.size === wanted.length` and not `promoted.length === wanted.length`.
    //
    // WHAT THIS CASE DOES *NOT* HOLD, said rather than implied. A decoy swapping that predicate for the row
    // count REDDENS NOTHING — including here (DEV's D2, 2026-09-22). The reason is the fall-back above: with
    // the wrong predicate the narrow pass runs over an EMPTY page set, matches nothing, and the full walk then
    // answers exactly what it answers now. So the predicate is correctness-NEUTRAL while the fall-back stands;
    // what it saves is one wasted pass. The case is kept for the OUTCOME it names — a promoted name whose page
    // is unreadable is not turned into NOT_A_RECORD — which is a property, and D3 shows is not a free one.
    seedCorpus();
    promote(CAPTURE_NAME, 'CAPTURE', null);

    const before = pageReads();
    const resolved = await recordsByName([CAPTURE_NAME]);

    expect(resolved.get(CAPTURE_NAME)?.fileHash).toBe(CAPTURE_NAME);
    expect(pageReads() - before).toBe(1);
  });

  it('W5 — a name the corpus derives NOTHING for is still NOT_A_RECORD: the narrowing does not turn an unknown string into a resolved record', async () => {
    seedCorpus();
    promote(CAPTURE_NAME, 'CAPTURE', PAGE);

    const resolved = await recordsByName([CAPTURE_NAME, 'not-a-name-the-corpus-holds']);

    expect(resolved.get('not-a-name-the-corpus-holds')).toBeNull();
    expect(resolved.has('not-a-name-the-corpus-holds')).toBe(true);
  });
});
