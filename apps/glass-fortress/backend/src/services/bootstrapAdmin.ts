/**
 * Granting the FIRST ADMIN in an environment that has none.
 *
 * This is the same hole `bootstrapResearcher` was written for, one level up.
 * That one exists because approval is ADMIN-only and a fresh environment has no
 * admin; it fixes approval and says so explicitly — "Role is deliberately left
 * untouched". Which leaves role itself rootless: `PATCH /api/auth/researchers/:id`
 * is the only supported way to set `role`, and it too is ADMIN-only. So an
 * environment bootstrapped by that script can write evidence and theses but can
 * never approve its SECOND researcher, because nobody in it can reach /admin.
 * Staging sat in exactly that state: one approved RESEARCHER, one pending
 * registration, and no way to action it.
 *
 * The guard is the same one, and it is what makes this a bootstrap rather than
 * a privilege-escalation tool: it REFUSES when any ADMIN already exists. In a
 * populated environment this can do nothing at all, no matter who runs it or
 * what arguments they pass — the chain has a root, and further admins are made
 * through the ADMIN-only API path like everything else. A raw UPDATE offers no
 * such guarantee; it does whatever its WHERE clause says.
 *
 * Two deliberate refusals beyond that:
 *
 * - An UNAPPROVED researcher cannot be made ADMIN. Approval is the weaker
 *   privilege and ADMIN implies it; granting the stronger one to an identity
 *   the environment has not admitted would let this bypass approval entirely,
 *   which is the check `bootstrapResearcher` exists to protect.
 * - The freshness check runs FIRST, before the handle is looked up, so a
 *   populated environment refuses identically whether or not the caller named a
 *   real account. Leaking "that handle exists but I won't promote it" would
 *   make this an account-enumeration oracle for no gain.
 *
 * `bootstrapResearcher` notes that "a dedicated admin account is the better
 * answer when one is actually needed", and that remains true: promoting the
 * working research identity gives one account both roles. This tool does not
 * decide that — it makes either choice reachable, and `demoteAdmin` makes it
 * reversible.
 */

export type AdminRole = 'RESEARCHER' | 'ADMIN';

export type BootstrapAdminOutcome =
  /** The named researcher now holds ADMIN. */
  | { kind: 'promoted'; handle: string; researcherId: string }
  /** Already ADMIN — re-running changed nothing. Safe to repeat. */
  | { kind: 'already_admin'; handle: string; researcherId: string }
  /** An ADMIN exists, so this environment already has a root. */
  | { kind: 'refused_admin_exists'; adminHandles: string[] }
  /** Registered but not approved — the weaker privilege must come first. */
  | { kind: 'refused_not_approved'; handle: string; researcherId: string }
  /** No researcher with that handle. */
  | { kind: 'no_such_handle'; handle: string; availableHandles: string[] };

export type DemoteAdminOutcome =
  /** ADMIN withdrawn; the account keeps its approval and its write access. */
  | { kind: 'demoted'; handle: string; researcherId: string }
  /** Was not ADMIN to begin with. Re-running changed nothing. */
  | { kind: 'not_admin'; handle: string; researcherId: string }
  /** No researcher with that handle. */
  | { kind: 'no_such_handle'; handle: string; availableHandles: string[] };

/** The slice of PrismaClient this needs, so tests need not build a whole client. */
export interface AdminStore {
  researcher: {
    findMany: (args: {
      where?: { role?: AdminRole };
      select: { handle: true };
    }) => Promise<{ handle: string }[]>;
    findUnique: (args: {
      where: { handle: string };
      select: { id: true; handle: true; role: true; approved: true };
    }) => Promise<{ id: string; handle: string; role: AdminRole; approved: boolean } | null>;
    update: (args: {
      where: { id: string };
      data: { role: AdminRole };
      select: { id: true; handle: true; role: true };
    }) => Promise<{ id: string; handle: string; role: AdminRole }>;
  };
}

async function allHandles(store: AdminStore): Promise<string[]> {
  const all = await store.researcher.findMany({ select: { handle: true } });
  return all.map((r) => r.handle);
}

/**
 * Grants ADMIN to `handle` if — and only if — the environment has no ADMIN yet
 * and that researcher is already approved.
 */
export async function bootstrapAdmin(
  store: AdminStore,
  handle: string,
): Promise<BootstrapAdminOutcome> {
  const admins = await store.researcher.findMany({
    where: { role: 'ADMIN' },
    select: { handle: true },
  });

  if (admins.length > 0) {
    return { kind: 'refused_admin_exists', adminHandles: admins.map((r) => r.handle) };
  }

  const target = await store.researcher.findUnique({
    where: { handle },
    select: { id: true, handle: true, role: true, approved: true },
  });

  if (!target) {
    return { kind: 'no_such_handle', handle, availableHandles: await allHandles(store) };
  }

  if (!target.approved) {
    return { kind: 'refused_not_approved', handle: target.handle, researcherId: target.id };
  }

  // Unreachable while the freshness check above holds, but stated explicitly:
  // re-running must never be an error, so a repeat is a no-op, not a second write.
  if (target.role === 'ADMIN') {
    return { kind: 'already_admin', handle: target.handle, researcherId: target.id };
  }

  const updated = await store.researcher.update({
    where: { id: target.id },
    data: { role: 'ADMIN' },
    select: { id: true, handle: true, role: true },
  });

  return { kind: 'promoted', handle: updated.handle, researcherId: updated.id };
}

/**
 * Withdraws ADMIN, leaving approval and ordinary write access intact.
 *
 * Deliberately NOT guarded the way promotion is, for the same reason
 * `revokeResearcher` is not: granting privilege in a populated environment is
 * the dangerous direction, and removing it can never become an escalation. The
 * worst case is an environment with no admin — which is precisely the state
 * `bootstrapAdmin` above knows how to recover from.
 */
export async function demoteAdmin(
  store: AdminStore,
  handle: string,
): Promise<DemoteAdminOutcome> {
  const target = await store.researcher.findUnique({
    where: { handle },
    select: { id: true, handle: true, role: true, approved: true },
  });

  if (!target) {
    return { kind: 'no_such_handle', handle, availableHandles: await allHandles(store) };
  }

  if (target.role !== 'ADMIN') {
    return { kind: 'not_admin', handle: target.handle, researcherId: target.id };
  }

  const updated = await store.researcher.update({
    where: { id: target.id },
    data: { role: 'RESEARCHER' },
    select: { id: true, handle: true, role: true },
  });

  return { kind: 'demoted', handle: updated.handle, researcherId: updated.id };
}
