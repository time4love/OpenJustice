/**
 * Approving the FIRST researcher in an environment that has none.
 *
 * Glass Fortress gates MCP write access on `Researcher.approved`, and the only
 * supported way to set it is `PATCH /api/auth/researchers/:id`, which is
 * ADMIN-only. That is correct for a running system and unsatisfiable in a fresh
 * one: an environment with zero researchers has zero admins, so nobody can
 * approve anybody. Registration succeeds, the account sits at approved=false,
 * and — because `findAccount` refuses unapproved accounts — even the OAuth flow
 * fails, surfacing as a confusing connector error rather than "you need
 * approval". Discovered the hard way while rebuilding staging after the
 * 2026-08-21 wipe; production has the same hole standing open today.
 *
 * The alternative considered and rejected was auto-approving the first
 * registrant inside POST /api/auth/register. It needs no tooling and is a land
 * grab: GF production is public and currently holds zero researchers, so that
 * code path would hand write access to whoever registered first.
 *
 * So the bootstrap lives in tooling, and is safe by construction rather than by
 * discipline: it REFUSES to act when any approved researcher already exists.
 * That single guard is what separates a bootstrap tool from a
 * privilege-escalation tool — in a populated environment this can do nothing at
 * all, no matter who runs it or what arguments they pass. A raw UPDATE offers
 * no such guarantee; it does whatever its WHERE clause says.
 *
 * Role is deliberately left untouched. Approval is what unblocks the
 * environment; granting ADMIN as well would over-privilege a working identity
 * for no benefit, and a dedicated admin account is the better answer when one
 * is actually needed.
 */

export type BootstrapOutcome =
  /** The named researcher was approved. */
  | { kind: 'approved'; handle: string; researcherId: string }
  /** Already approved — re-running changed nothing. Safe to repeat. */
  | { kind: 'already_approved'; handle: string; researcherId: string }
  /** An approved researcher exists, so this environment is not a fresh one. */
  | { kind: 'refused_not_fresh'; approvedHandles: string[] }
  /** No researcher with that handle — nothing to approve. */
  | { kind: 'no_such_handle'; handle: string; availableHandles: string[] };

/** The slice of PrismaClient this needs, so tests need not build a whole client. */
export interface ResearcherStore {
  researcher: {
    findMany: (args: {
      where?: { approved?: boolean };
      select: { id?: true; handle?: true; approved?: true };
    }) => Promise<{ id?: string; handle?: string; approved?: boolean }[]>;
    findUnique: (args: {
      where: { handle: string };
      select: { id: true; handle: true; approved: true };
    }) => Promise<{ id: string; handle: string; approved: boolean } | null>;
    update: (args: {
      where: { id: string };
      data: { approved: boolean };
      select: { id: true; handle: true; approved: true };
    }) => Promise<{ id: string; handle: string; approved: boolean }>;
  };
}

export type RevokeOutcome =
  /** Approval withdrawn. */
  | { kind: 'revoked'; handle: string; researcherId: string }
  /** Was not approved to begin with. Re-running changed nothing. */
  | { kind: 'not_approved'; handle: string; researcherId: string }
  /** No researcher with that handle. */
  | { kind: 'no_such_handle'; handle: string; availableHandles: string[] };

/**
 * Withdraws approval from a researcher.
 *
 * The inverse of bootstrapResearcher, and it exists for one specific failure:
 * bootstrapping the WRONG identity. That is easy to do and hard to see, because
 * the researcher must be registered under the same identity the MCP client
 * authenticates as — not merely an account the operator controls. Approving the
 * wrong one of your own Google accounts produces a working-looking environment
 * whose connector can never authenticate, and the only other way back is a
 * hand-typed UPDATE, which is what this whole script exists to avoid.
 *
 * Deliberately NOT guarded the way bootstrapping is. The freshness check on
 * approval exists because granting privilege in a populated environment is the
 * dangerous direction; revocation only ever removes privilege, so no arrangement
 * of arguments can turn it into an escalation. The worst case is locking
 * yourself out of an environment you can then re-bootstrap.
 */
export async function revokeResearcher(
  store: ResearcherStore,
  handle: string,
): Promise<RevokeOutcome> {
  const target = await store.researcher.findUnique({
    where: { handle },
    select: { id: true, handle: true, approved: true },
  });

  if (!target) {
    const all = await store.researcher.findMany({ select: { handle: true } });
    return {
      kind: 'no_such_handle',
      handle,
      availableHandles: all.map((r) => r.handle ?? '(unknown)'),
    };
  }

  if (!target.approved) {
    return { kind: 'not_approved', handle: target.handle, researcherId: target.id };
  }

  const updated = await store.researcher.update({
    where: { id: target.id },
    data: { approved: false },
    select: { id: true, handle: true, approved: true },
  });

  return { kind: 'revoked', handle: updated.handle, researcherId: updated.id };
}

/**
 * Approves `handle` if — and only if — the environment has no approved
 * researcher yet.
 *
 * The freshness check runs FIRST, before the handle is even looked up, so that
 * a populated environment refuses identically whether or not the caller named a
 * real account. Leaking "that handle exists but I won't approve it" would turn
 * this into an account-enumeration oracle for no gain.
 */
export async function bootstrapResearcher(
  store: ResearcherStore,
  handle: string,
): Promise<BootstrapOutcome> {
  const approved = await store.researcher.findMany({
    where: { approved: true },
    select: { handle: true },
  });

  if (approved.length > 0) {
    return {
      kind: 'refused_not_fresh',
      approvedHandles: approved.map((r) => r.handle ?? '(unknown)'),
    };
  }

  const target = await store.researcher.findUnique({
    where: { handle },
    select: { id: true, handle: true, approved: true },
  });

  if (!target) {
    const all = await store.researcher.findMany({ select: { handle: true } });
    return {
      kind: 'no_such_handle',
      handle,
      availableHandles: all.map((r) => r.handle ?? '(unknown)'),
    };
  }

  // Unreachable while the freshness check above holds, but stated explicitly:
  // re-running must never be an error, so a repeat invocation is a no-op rather
  // than a second write.
  if (target.approved) {
    return { kind: 'already_approved', handle: target.handle, researcherId: target.id };
  }

  const updated = await store.researcher.update({
    where: { id: target.id },
    data: { approved: true },
    select: { id: true, handle: true, approved: true },
  });

  return { kind: 'approved', handle: updated.handle, researcherId: updated.id };
}
