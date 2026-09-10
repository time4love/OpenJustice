import { DIFF_NAME } from '../helpers/corpusFixture';
import { db, resetDouble, rolledBack, store, written } from '../helpers/evidenceDouble';
import { built, load } from './absent';
import { MODULES, type ModulePath } from './contract';
import { DATED_ROWS, DIFF_NAME_VECTOR } from './fixtures';

// ---------------------------------------------------------------------------
// THE LOADER, AND THE MODULE MAP IT SERVES — thesis step 17's ground (7.1).
//
// ONE CASE PER MODULE THE SUITE WILL LOAD, red BY NAME with the step that owes
// it: the map in `contract.ts` is a list, and a list is only a rule when each
// entry can fail on its own. Each case goes green the day its step builds the
// module with every export the contract names — and not a day earlier, because a
// stub at the right path fails on the missing export's name.
//
// THE LOADER'S OWN FOUR ARMS are held against modules that exist TODAY, so they
// are green now and cannot be satisfied by an absence: a present module passes,
// a present module without the named export fails on the export, a path that
// does not exist fails as "not built" with its step, and an export of the WRONG
// KIND fails on its name, its kind and its step.
// ---------------------------------------------------------------------------

describe("the thesis layer's modules — each red by name until the step that builds it", () => {
  for (const module of Object.keys(MODULES) as ModulePath[]) {
    const names = Object.keys(MODULES[module].exports).join(', ');
    it(`${module} exports ${names}`, async () => {
      const loaded = await built<Record<string, unknown>>(module);
      expect(Object.keys(loaded)).toEqual(expect.arrayContaining(Object.keys(MODULES[module].exports)));
    });
  }
});

describe('the loader — its four arms, held against modules that exist today', () => {
  it('passes a present module through, with the export the contract names', async () => {
    // NORMALISE's one symbol is present (thesis A1 :1247–:1250), so this arm has a
    // real subject at step 17.
    const loaded = await load<{ normaliseClaim: (t: string) => string }>('services/claimTrajectory', 18, {
      normaliseClaim: { step: 18, kind: 'function' },
    });
    expect(loaded.normaliseClaim('  a \n b ')).toBe('a b');
  });

  it("fails a present module on the missing EXPORT's name, with that export's step", async () => {
    await expect(load('services/claimTrajectory', 18, { gapId: { step: 22, kind: 'function' } })).rejects.toThrow(
      'services/claimTrajectory exists but does not export gapId (thesis step 22)',
    );
  });

  it('fails an absent path as NOT BUILT, naming the step — never as a compile error', async () => {
    await expect(load('services/noSuchThesisModule', 20, { anything: { step: 20, kind: 'function' } })).rejects.toThrow(
      'services/noSuchThesisModule is not built — thesis step 20 builds it',
    );
  });

  it('fails an export of the WRONG KIND, naming the export, its kind and its step (round 2, M1)', async () => {
    // `FLAG_ARMS_EVALUATED` is a present TABLE (a const array); asked for as a
    // FUNCTION it must refuse — a stub exporting the right name as an object
    // cannot pass for a predicate.
    await expect(
      load('services/evidencePredicates', 15, { FLAG_ARMS_EVALUATED: { step: 15, kind: 'function' } }),
    ).rejects.toThrow(
      'services/evidencePredicates exists but exports FLAG_ARMS_EVALUATED as a table, not as a function (thesis step 15)',
    );
  });
});

describe("the shared double's thesis tables — `findMany` honours its `where` (round 2, M2)", () => {
  it("with two theses' rows, it returns only the one thesis's", async () => {
    resetDouble();
    store.gapDecisions = [
      { id: 'decision-of-thesis-1', thesisId: 'thesis-1' },
      { id: 'decision-of-thesis-2', thesisId: 'thesis-2' },
    ];
    const rows = await db.thesisGapDecision.findMany({ where: { thesisId: 'thesis-1' } });
    expect(rows.map((row) => row['id'])).toEqual(['decision-of-thesis-1']);
  });

  it("the mention table answers A2's target names as it answers today's — only the version asked for (7.2 round 2)", async () => {
    // REVIEWS reads HEAD's mentions and PUBLISHED's apart; this is the double
    // behaviour its cases stand on, held here so it cannot loosen unnoticed.
    resetDouble();
    store.mentions = [
      { id: 'mention-of-version-1', versionId: 'version-1', kind: 'EVIDENCE', thesisVersionId: 'version-1', type: 'EVIDENCE' },
      { id: 'mention-of-version-2', versionId: 'version-2', kind: 'TRAJECTORY', thesisVersionId: 'version-2', type: 'CLAIM_TRAJECTORY' },
    ];
    const ids = (rows: readonly Record<string, unknown>[]): unknown[] => rows.map((row) => row['id']);
    expect(ids(await db.thesisMention.findMany({ where: { versionId: 'version-2' } }))).toEqual(['mention-of-version-2']);
    expect(ids(await db.thesisMention.findMany({ where: { thesisVersionId: 'version-2' } }))).toEqual(['mention-of-version-2']);
    expect(ids(await db.thesisMention.findMany({ where: { versionId: 'version-1', kind: 'TRAJECTORY' } }))).toEqual([]);
  });

  it('a version is read BY ID once the suite holds the list — never the one loaded version for any id (7.2 round 2)', async () => {
    resetDouble();
    store.version = { id: 'version-head' };
    store.versions = [{ id: 'version-published' }, { id: 'version-head' }];
    expect(await db.thesisVersion.findUnique({ where: { id: 'version-published' } })).toEqual({ id: 'version-published' });
    expect(await db.thesisVersion.findUnique({ where: { id: 'version-absent' } })).toBeNull();
    // THE FALLBACK, for the evidence consumer that sets only the one row.
    store.versions = [];
    expect(await db.thesisVersion.findUnique({ where: { id: 'anything' } })).toEqual({ id: 'version-head' });
  });

  it('the debates answer from their list, only the thesis asked for — and `[]` when none is seeded (7.2 round 3)', async () => {
    resetDouble();
    expect(await db.diffDebateSession.findMany({ where: { thesisId: 'thesis-1' } })).toEqual([]);
    store.debates = [
      { id: 'debate-of-thesis-1', thesisId: 'thesis-1' },
      { id: 'debate-of-thesis-2', thesisId: 'thesis-2' },
    ];
    const rows = await db.diffDebateSession.findMany({ where: { thesisId: 'thesis-1' } });
    expect(rows.map((row) => row['id'])).toEqual(['debate-of-thesis-1']);
  });
});

describe("the shared double's 7.3 additions — each held here, so none can loosen unnoticed", () => {
  it('a thesis is read BY ID once the suite holds the thesis list — so NO_THESIS is writable; the one loaded thesis answers only a suite that set no list', async () => {
    resetDouble();
    store.thesis = { id: 'thesis-loaded' };
    store.theses = [{ id: 'thesis-1' }, { id: 'thesis-2' }];
    expect(await db.thesis.findUnique({ where: { id: 'thesis-2' } })).toEqual({ id: 'thesis-2' });
    expect(await db.thesis.findUnique({ where: { id: 'thesis-absent' } })).toBeNull();
    // THE FALLBACK, for `test/debate.test.ts`, which sets only the one row.
    store.theses = [];
    expect(await db.thesis.findUnique({ where: { id: 'anything' } })).toEqual({ id: 'thesis-loaded' });
  });

  it('the trajectories answer by `in` and by equality — and a `where` the double does not model REJECTS rather than agreeing', async () => {
    resetDouble();
    store.trajectories = [
      { id: 'trajectory-1', computationId: 'computation-1', claimHash: 'claim-1' },
      { id: 'trajectory-2', computationId: 'computation-2', claimHash: 'claim-2' },
    ];
    const ids = (rows: readonly Record<string, unknown>[]): unknown[] => rows.map((row) => row['id']);
    expect(ids(await db.claimTrajectory.findMany({ where: { id: { in: ['trajectory-2', 'trajectory-9'] } } }))).toEqual([
      'trajectory-2',
    ]);
    expect(
      ids(await db.claimTrajectory.findMany({ where: { computationId: 'computation-1', claimHash: { in: ['claim-1', 'claim-2'] } } })),
    ).toEqual(['trajectory-1']);
    await expect(db.claimTrajectory.findMany({ where: { claimHash: { startsWith: 'claim' } } })).rejects.toThrow('does not model');
  });

  it("a mention CREATED joins the list `findMany` answers — a second write reads the first one's rows — one entry per row, createMany included", async () => {
    resetDouble();
    await db.thesisMention.create({ data: { versionId: 'version-2', kind: 'EVIDENCE', name: 'record-1' } });
    await db.thesisMention.createMany({ data: [{ versionId: 'version-2', kind: 'TRAJECTORY', name: 'trajectory-1' }] });
    const rows = await db.thesisMention.findMany({ where: { versionId: 'version-2' } });
    expect(rows.map((row) => [row['kind'], row['name']])).toEqual([
      ['EVIDENCE', 'record-1'],
      ['TRAJECTORY', 'trajectory-1'],
    ]);
    expect(written.map((w) => [w.model, w.op])).toEqual([
      ['thesisMention', 'create'],
      ['thesisMention', 'create'],
    ]);
  });

  it('a framing is ATTACHED by `update`, by its id — and an id the double does not hold rejects (thesis A2 :1297)', async () => {
    resetDouble();
    store.framings = [
      { id: 'framing-1', thesisId: null },
      { id: 'framing-2', thesisId: null },
    ];
    await db.framing.update({ where: { id: 'framing-2' }, data: { thesisId: 'thesis-1' } });
    expect(store.framings.map((f) => f['thesisId'])).toEqual([null, 'thesis-1']);
    await expect(db.framing.update({ where: { id: 'framing-absent' }, data: { thesisId: 'thesis-1' } })).rejects.toThrow(
      'holds no Framing',
    );
  });

  it('a transaction whose callback REJECTS leaves the store as it found it and names its writes in `rolledBack`, `written` keeping them as attempts; one that resolves commits', async () => {
    resetDouble();
    const refused = new Error('a refusal decided inside the transaction');
    // The callback is handed the transaction's own client, typed `unknown` by the
    // double; it is `db`'s shape with every write verb wrapped.
    await expect(
      db.$transaction(async (tx: unknown) => {
        await (tx as typeof db).thesisVersion.create({ data: { thesisId: 'thesis-1' } });
        throw refused;
      }),
    ).rejects.toBe(refused);
    expect(store.versions).toEqual([]);
    expect(written.map((w) => w.model)).toEqual(['thesisVersion']);
    expect(rolledBack).toEqual(written);
    await db.$transaction(async (tx: unknown) => {
      await (tx as typeof db).thesisVersion.create({ data: { thesisId: 'thesis-1' } });
    });
    expect(store.versions).toHaveLength(1);
    expect(rolledBack).toHaveLength(1);
  });

  it('a work-list row answers only the `where` it matches — a row for one timestamp answers another with null; a row naming neither field answers as before (7.3 round 2, M1)', async () => {
    resetDouble();
    const row = { trackedUrlId: 'page-1', waybackTimestamp: '20210612183110', status: 'SKIPPED' };
    store.workList = row;
    expect(await db.cdxIndexEntry.findFirst({ where: { trackedUrlId: 'page-1', waybackTimestamp: '20210612183110' } })).toEqual(row);
    expect(await db.cdxIndexEntry.findFirst({ where: { trackedUrlId: 'page-1', waybackTimestamp: '20000101000000' } })).toBeNull();
    expect(await db.cdxIndexEntry.findFirst({ where: { trackedUrlId: 'page-2', waybackTimestamp: '20210612183110' } })).toBeNull();
    // THE FALLBACK, for `test/debate.test.ts` :235, which seeds `{ status: 'SKIPPED' }` alone.
    store.workList = { status: 'SKIPPED' };
    expect(await db.cdxIndexEntry.findFirst({ where: { trackedUrlId: 'page-1', waybackTimestamp: '20000101000000' } })).toEqual({
      status: 'SKIPPED',
    });
  });

  it("a mention COUNT honours its `where` — PUBLIC_PAGE's question, the pin, told from a citation that is no longer the pin; an unmodelled shape rejects (7.5b)", async () => {
    resetDouble();
    store.mentions = [
      { id: 'on-the-pin', type: 'EVIDENCE', refId: 'record-1', thesisVersion: { isPublished: { id: 'thesis-1' } } },
      { id: 'superseded', type: 'EVIDENCE', refId: 'record-1', thesisVersion: { isPublished: null } },
      { id: 'another-record', type: 'EVIDENCE', refId: 'record-2', thesisVersion: { isPublished: null } },
    ];
    const pinOnly = { isPublished: { isNot: null } };
    expect(await db.thesisMention.count({ where: { type: 'EVIDENCE', refId: { in: ['record-1'] }, thesisVersion: pinOnly } })).toBe(1);
    expect(await db.thesisMention.count({ where: { type: 'EVIDENCE', refId: { in: ['record-1'] } } })).toBe(2);
    // THE FALLBACK: no `where` answers every row, as the delegate always did.
    expect(await db.thesisMention.count({})).toBe(3);
    await expect(db.thesisMention.count({ where: { thesisVersion: { isPublished: { is: null } } } })).rejects.toThrow(
      'does not model',
    );
  });
});

describe('the fixtures — the vectors were derived OUTSIDE the implementation (round 2, Q3)', () => {
  it("the corpus fixture's DIFF record name IS the shell-derived vector the version's contentHash was computed over", () => {
    // `recordId` computes DIFF_NAME; the shell computed DIFF_NAME_VECTOR from
    // evidence A1's byte layout (the commands are in fixtures.ts). If they
    // disagreed, VERSION.contentHash would be a hash of a text nobody cites.
    expect(DIFF_NAME).toBe(DIFF_NAME_VECTOR);
  });
});

describe('the fixtures — every row a distinct instant (L5)', () => {
  it('no two fixture rows share a createdAt: a tie inside one transaction is step 20’s question', () => {
    const instants = DATED_ROWS.map((row) => row.createdAt.getTime());
    expect(new Set(instants).size).toBe(instants.length);
    expect(instants.length).toBeGreaterThan(5);
  });
});
