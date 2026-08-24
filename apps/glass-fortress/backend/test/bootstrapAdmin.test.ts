import {
  bootstrapAdmin,
  demoteAdmin,
  type AdminRole,
  type AdminStore,
} from '../src/services/bootstrapAdmin';

// ---------------------------------------------------------------------------
// bootstrapAdmin — the one supported way to create the FIRST ADMIN in an
// environment that has none.
//
// The property under test is not "it can promote someone" — it is that it
// CANNOT promote anyone once the environment has a root, and cannot promote an
// identity the environment has not already approved. Those two refusals are the
// entire difference between a bootstrap tool and a privilege-escalation tool,
// so each is asserted from several directions, including that no write is
// attempted either way.
//
// Handles here are fabricated. The real one identifies a person and is passed
// at runtime, never committed — this repository is public.
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  handle: string;
  role: AdminRole;
  approved: boolean;
}

function buildStore(rows: Row[]): { store: AdminStore; update: jest.Mock } {
  const update = jest.fn(
    async ({ where, data }: { where: { id: string }; data: { role: AdminRole } }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`no row ${where.id}`);
      row.role = data.role;
      return { id: row.id, handle: row.handle, role: row.role };
    },
  );

  const store: AdminStore = {
    researcher: {
      findMany: async ({ where }) =>
        rows
          .filter((r) => (where?.role === undefined ? true : r.role === where.role))
          .map((r) => ({ handle: r.handle })),
      findUnique: async ({ where }) => rows.find((r) => r.handle === where.handle) ?? null,
      update,
    },
  };

  return { store, update };
}

const approvedResearcher = (id: string, handle: string): Row => ({
  id,
  handle,
  role: 'RESEARCHER',
  approved: true,
});

describe('bootstrapAdmin', () => {
  it('promotes an approved researcher when the environment has no admin', async () => {
    const { store, update } = buildStore([approvedResearcher('r1', 'first-analyst')]);

    const outcome = await bootstrapAdmin(store, 'first-analyst');

    expect(outcome).toEqual({ kind: 'promoted', handle: 'first-analyst', researcherId: 'r1' });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'ADMIN' } }),
    );
  });

  // The guard that makes this a bootstrap rather than an escalation tool.
  describe('refuses once the environment already has a root', () => {
    it('refuses a real handle when an admin exists, and writes nothing', async () => {
      const { store, update } = buildStore([
        { id: 'r1', handle: 'incumbent', role: 'ADMIN', approved: true },
        approvedResearcher('r2', 'newcomer'),
      ]);

      const outcome = await bootstrapAdmin(store, 'newcomer');

      expect(outcome).toEqual({ kind: 'refused_admin_exists', adminHandles: ['incumbent'] });
      expect(update).not.toHaveBeenCalled();
    });

    // The refusal must not depend on the handle: identical answers for a real
    // and an invented one, or this becomes an account-enumeration oracle.
    it('refuses a non-existent handle identically', async () => {
      const { store, update } = buildStore([
        { id: 'r1', handle: 'incumbent', role: 'ADMIN', approved: true },
        approvedResearcher('r2', 'newcomer'),
      ]);

      const real = await bootstrapAdmin(store, 'newcomer');
      const invented = await bootstrapAdmin(store, 'nobody-by-this-name');

      expect(invented).toEqual(real);
      expect(update).not.toHaveBeenCalled();
    });

    it('names every incumbent admin, not just the first', async () => {
      const { store } = buildStore([
        { id: 'r1', handle: 'incumbent-a', role: 'ADMIN', approved: true },
        { id: 'r2', handle: 'incumbent-b', role: 'ADMIN', approved: true },
        approvedResearcher('r3', 'newcomer'),
      ]);

      const outcome = await bootstrapAdmin(store, 'newcomer');

      expect(outcome).toEqual({
        kind: 'refused_admin_exists',
        adminHandles: ['incumbent-a', 'incumbent-b'],
      });
    });
  });

  // ADMIN implies approval. Promoting an unapproved account would let this tool
  // bypass the approval gate entirely.
  it('refuses an unapproved researcher, and writes nothing', async () => {
    const { store, update } = buildStore([
      { id: 'r1', handle: 'pending-signup', role: 'RESEARCHER', approved: false },
    ]);

    const outcome = await bootstrapAdmin(store, 'pending-signup');

    expect(outcome).toEqual({
      kind: 'refused_not_approved',
      handle: 'pending-signup',
      researcherId: 'r1',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports an unknown handle and lists what is registered', async () => {
    const { store, update } = buildStore([approvedResearcher('r1', 'first-analyst')]);

    const outcome = await bootstrapAdmin(store, 'typo-handle');

    expect(outcome).toEqual({
      kind: 'no_such_handle',
      handle: 'typo-handle',
      availableHandles: ['first-analyst'],
    });
    expect(update).not.toHaveBeenCalled();
  });

  // Re-running a bootstrap must never be an error — but note this is only
  // reachable via the refusal above once the promotion has taken effect, which
  // is asserted here directly against a store built in that state.
  it('is a no-op when the named researcher is the only admin already', async () => {
    const { store, update } = buildStore([
      { id: 'r1', handle: 'first-analyst', role: 'ADMIN', approved: true },
    ]);

    const outcome = await bootstrapAdmin(store, 'first-analyst');

    // The freshness guard fires first and names them as the incumbent, so a
    // repeat run still writes nothing.
    expect(outcome).toEqual({ kind: 'refused_admin_exists', adminHandles: ['first-analyst'] });
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves approval untouched when it promotes', async () => {
    const rows = [approvedResearcher('r1', 'first-analyst')];
    const { store } = buildStore(rows);

    await bootstrapAdmin(store, 'first-analyst');

    expect(rows[0]).toEqual({ id: 'r1', handle: 'first-analyst', role: 'ADMIN', approved: true });
  });
});

describe('demoteAdmin', () => {
  it('withdraws ADMIN and leaves approval intact', async () => {
    const rows: Row[] = [{ id: 'r1', handle: 'incumbent', role: 'ADMIN', approved: true }];
    const { store, update } = buildStore(rows);

    const outcome = await demoteAdmin(store, 'incumbent');

    expect(outcome).toEqual({ kind: 'demoted', handle: 'incumbent', researcherId: 'r1' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'RESEARCHER' } }));
    expect(rows[0].approved).toBe(true);
  });

  // Unguarded on purpose: removing privilege can never become an escalation,
  // and the resulting no-admin environment is exactly what bootstrapAdmin
  // recovers from.
  it('demotes the last remaining admin', async () => {
    const rows: Row[] = [{ id: 'r1', handle: 'only-admin', role: 'ADMIN', approved: true }];
    const { store } = buildStore(rows);

    await demoteAdmin(store, 'only-admin');

    expect(rows[0].role).toBe('RESEARCHER');
    // ...and the environment is now bootstrappable again, which is the whole
    // reason demotion is allowed to leave no root behind.
    const again = await bootstrapAdmin(store, 'only-admin');
    expect(again).toEqual({ kind: 'promoted', handle: 'only-admin', researcherId: 'r1' });
  });

  it('is a no-op for a researcher who is not an admin', async () => {
    const { store, update } = buildStore([approvedResearcher('r1', 'first-analyst')]);

    const outcome = await demoteAdmin(store, 'first-analyst');

    expect(outcome).toEqual({ kind: 'not_admin', handle: 'first-analyst', researcherId: 'r1' });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports an unknown handle and lists what is registered', async () => {
    const { store, update } = buildStore([approvedResearcher('r1', 'first-analyst')]);

    const outcome = await demoteAdmin(store, 'typo-handle');

    expect(outcome).toEqual({
      kind: 'no_such_handle',
      handle: 'typo-handle',
      availableHandles: ['first-analyst'],
    });
    expect(update).not.toHaveBeenCalled();
  });
});
