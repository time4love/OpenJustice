import { bootstrapResearcher, type ResearcherStore } from '../src/services/bootstrapResearcher';
import { identifyEnvironment } from '../src/lib/dbEnvironment';

// ---------------------------------------------------------------------------
// bootstrapResearcher — the one supported way to approve the first researcher
// in an environment that has none.
//
// The property under test is not "it can approve someone" — it is that it
// CANNOT approve anyone once the environment is populated. That refusal is the
// entire difference between a bootstrap tool and a privilege-escalation tool,
// so it is asserted from several directions: with a matching handle, with a
// non-existent handle, and by confirming no write is attempted either way.
//
// Handles here are fabricated. The real one identifies a person and is passed
// at runtime, never committed — this repository is public.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  handle: string;
  approved: boolean;
}

function buildStore(rows: Row[]): { store: ResearcherStore; update: jest.Mock } {
  const update = jest.fn(async ({ where }: { where: { id: string } }) => {
    const row = rows.find((r) => r.id === where.id);
    if (!row) throw new Error(`no row ${where.id}`);
    row.approved = true;
    return { id: row.id, handle: row.handle, approved: true };
  });

  const store: ResearcherStore = {
    researcher: {
      findMany: async ({ where }) =>
        rows
          .filter((r) => (where?.approved === undefined ? true : r.approved === where.approved))
          .map((r) => ({ id: r.id, handle: r.handle, approved: r.approved })),
      findUnique: async ({ where }) => rows.find((r) => r.handle === where.handle) ?? null,
      update,
    },
  };

  return { store, update };
}

describe('bootstrapResearcher', () => {
  it('approves the named researcher in a fresh environment', async () => {
    const { store, update } = buildStore([{ id: 'r1', handle: 'first-analyst', approved: false }]);

    const outcome = await bootstrapResearcher(store, 'first-analyst');

    expect(outcome).toEqual({ kind: 'approved', handle: 'first-analyst', researcherId: 'r1' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('leaves role untouched — approval alone grants write access', async () => {
    const { store, update } = buildStore([{ id: 'r1', handle: 'first-analyst', approved: false }]);

    await bootstrapResearcher(store, 'first-analyst');

    const [args] = update.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(args.data).toEqual({ approved: true });
    expect(args.data).not.toHaveProperty('role');
  });

  it('REFUSES when an approved researcher already exists, and writes nothing', async () => {
    const { store, update } = buildStore([
      { id: 'r1', handle: 'incumbent', approved: true },
      { id: 'r2', handle: 'newcomer', approved: false },
    ]);

    const outcome = await bootstrapResearcher(store, 'newcomer');

    expect(outcome).toEqual({ kind: 'refused_not_fresh', approvedHandles: ['incumbent'] });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses identically for a handle that does not exist, leaking nothing', async () => {
    // A populated environment must not become an account-enumeration oracle:
    // "that handle exists but I won't approve it" is strictly more information
    // than "refused", for no operational gain.
    const populated = buildStore([{ id: 'r1', handle: 'incumbent', approved: true }]);

    const real = await bootstrapResearcher(populated.store, 'incumbent');
    const fake = await bootstrapResearcher(populated.store, 'does-not-exist');

    expect(fake).toEqual(real);
    expect(populated.update).not.toHaveBeenCalled();
  });

  it('refuses when the environment has several approved researchers, naming them', async () => {
    const { store } = buildStore([
      { id: 'r1', handle: 'one', approved: true },
      { id: 'r2', handle: 'two', approved: true },
      { id: 'r3', handle: 'three', approved: false },
    ]);

    const outcome = await bootstrapResearcher(store, 'three');

    expect(outcome).toEqual({ kind: 'refused_not_fresh', approvedHandles: ['one', 'two'] });
  });

  it('reports the registered handles when the requested one is absent', async () => {
    const { store, update } = buildStore([
      { id: 'r1', handle: 'alpha', approved: false },
      { id: 'r2', handle: 'beta', approved: false },
    ]);

    const outcome = await bootstrapResearcher(store, 'gamma');

    expect(outcome).toEqual({
      kind: 'no_such_handle',
      handle: 'gamma',
      availableHandles: ['alpha', 'beta'],
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports an empty environment distinctly from a wrong handle', async () => {
    const { store } = buildStore([]);

    const outcome = await bootstrapResearcher(store, 'nobody');

    expect(outcome).toEqual({ kind: 'no_such_handle', handle: 'nobody', availableHandles: [] });
  });

  it('is safe to re-run: a second invocation refuses rather than rewriting', async () => {
    const { store, update } = buildStore([{ id: 'r1', handle: 'first-analyst', approved: false }]);

    const first = await bootstrapResearcher(store, 'first-analyst');
    const second = await bootstrapResearcher(store, 'first-analyst');

    expect(first.kind).toBe('approved');
    // Once approved, that same researcher makes the environment non-fresh — so
    // the guard catches the re-run before any second write is attempted.
    expect(second).toEqual({ kind: 'refused_not_fresh', approvedHandles: ['first-analyst'] });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('handles a non-ASCII handle unchanged', async () => {
    // Handles are self-chosen pseudonyms and GF is Hebrew-first, so a
    // right-to-left handle must round-trip through argv and the lookup intact.
    const { store } = buildStore([{ id: 'r1', handle: 'שם בדיקה', approved: false }]);

    const outcome = await bootstrapResearcher(store, 'שם בדיקה');

    expect(outcome).toEqual({ kind: 'approved', handle: 'שם בדיקה', researcherId: 'r1' });
  });
});

describe('identifyEnvironment', () => {
  it('names production and staging from their project refs', () => {
    const prod = identifyEnvironment({
      DATABASE_URL: 'postgresql://postgres.fqmczumacfbunffgodlo:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    } as NodeJS.ProcessEnv);
    const staging = identifyEnvironment({
      DATABASE_URL: 'postgresql://postgres.elwsznbcfmbmkldpntae:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    } as NodeJS.ProcessEnv);

    expect(prod).toMatchObject({ label: 'PRODUCTION', isProduction: true, isUnrecognised: false });
    expect(staging).toMatchObject({ label: 'staging', isProduction: false, isUnrecognised: false });
  });

  it('treats an unknown ref as unrecognised, never as safe', () => {
    const unknown = identifyEnvironment({
      DATABASE_URL: 'postgresql://postgres.abcdefghijklmnopqrst:x@somewhere.pooler.supabase.com:5432/postgres',
    } as NodeJS.ProcessEnv);

    expect(unknown.isUnrecognised).toBe(true);
    expect(unknown.isProduction).toBe(false);
    expect(unknown.label).toContain('UNRECOGNISED');
  });

  it('does not crash on a missing DATABASE_URL', () => {
    expect(identifyEnvironment({} as NodeJS.ProcessEnv)).toMatchObject({
      ref: 'unknown',
      isUnrecognised: true,
      isProduction: false,
    });
  });
});
