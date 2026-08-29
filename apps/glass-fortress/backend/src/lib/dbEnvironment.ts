import type { AppEnv } from './appEnv';

/**
 * Which database is DATABASE_URL actually pointing at?
 *
 * Extracted from scripts/dbSimulate.ts so that every tool capable of changing
 * data can name its target the same way. The point is not convenience: the one
 * question you must be able to answer before running anything against a live
 * database is "which environment is this?", and a connection string does not
 * answer it under pressure — decoding a project ref out of a pooler hostname is
 * exactly the kind of step that gets skipped at the wrong moment.
 *
 * Keep this the single source of truth. A second copy that drifts would be
 * worse than none, because it would still look authoritative while naming the
 * wrong environment.
 */

/**
 * Supabase project refs, so a report can name the environment rather than leave
 * the reader to decode a connection string. Anything not listed is reported as
 * UNRECOGNISED — deliberately not treated as safe, since an unknown database is
 * precisely when a destructive or privilege-granting step should stop.
 */
// Typed as possibly-undefined on purpose: a plain Record<string, string> would
// claim every lookup succeeds, which is exactly the case this function exists to
// handle. Letting the type lie here would make the "unknown ref" branch look
// like dead code.
//
// EXPORTED so that nothing else has to write a project ref down. This module is
// the one place in the codebase that names the two projects, and every extra
// literal copy is both a second source of truth and another ref in a public
// repository. A caller that needs one reads it from here.
export const KNOWN_ENVIRONMENTS: Record<string, AppEnv | undefined> = {
  fqmczumacfbunffgodlo: 'production',
  elwsznbcfmbmkldpntae: 'staging',
};

/** How each known environment is written in a report. */
const LABELS: Readonly<Record<AppEnv, string>> = {
  production: 'PRODUCTION',
  staging: 'staging',
};

/**
 * WHICH ENVIRONMENT A PROJECT REF NAMES — the database speaking for itself.
 *
 * Exported because it is the one voice that cannot go missing. `APP_ENV` is a
 * label and a label can be lost; `DATABASE_URL` cannot be, because without it
 * nothing runs at all. `assertEnvironmentIdentity` uses this to make the label
 * non-optional exactly where losing it would remove a gate.
 */
export function environmentOfProjectRef(ref: string | null): AppEnv | null {
  // NULLABLE INPUT ON PURPOSE. A connection string with no Supabase project in
  // it — a local Postgres — is "nothing to compare", and making every caller
  // guard for that is how one of them ends up not guarding. `noUncheckedIndexedAccess`
  // is not yet on for this project (see the ratchet), so the caller's own type
  // for a project ref is `string` even where it can be null at runtime.
  if (ref === null) return null;
  return KNOWN_ENVIRONMENTS[ref] ?? null;
}

export interface DatabaseEnvironment {
  /**
   * WHICH ENVIRONMENT THE DATABASE ITSELF NAMES, read from the project ref
   * inside DATABASE_URL and from nothing else.
   *
   * This is the value that makes the database an independent VOICE rather than
   * an echo: every other configuration axis passes through APP_ENV at some
   * point, so only this one can contradict it. Null for an unrecognised ref,
   * which is a refusal and never a default — an unknown database is exactly
   * when a destructive or privilege-granting step should stop.
   */
  appEnv: AppEnv | null;
  /** Human-readable label: 'PRODUCTION', 'staging', or 'UNRECOGNISED (ref)'. */
  label: string;
  /** True only for a positively identified production ref — never for unknown. */
  isProduction: boolean;
  /** The 20-character Supabase project ref, or 'unknown'. */
  ref: string;
  /** True when the ref matched no known environment. */
  isUnrecognised: boolean;
}

export function identifyEnvironment(env: NodeJS.ProcessEnv = process.env): DatabaseEnvironment {
  const url = env.DATABASE_URL ?? '';
  const match =
    /postgres(?:ql)?:\/\/[^@]*?\.?([a-z]{20})[.:@]/.exec(url) ?? /postgres\.([a-z]{20})/.exec(url);
  const ref = match?.[1] ?? 'unknown';
  const known = environmentOfProjectRef(ref);
  return {
    appEnv: known,
    label: known === null ? `UNRECOGNISED (${ref})` : LABELS[known],
    isProduction: known === 'production',
    ref,
    isUnrecognised: known === null,
  };
}
