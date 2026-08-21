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
const KNOWN_ENVIRONMENTS: Record<string, string | undefined> = {
  fqmczumacfbunffgodlo: 'PRODUCTION',
  elwsznbcfmbmkldpntae: 'staging',
};

export interface DatabaseEnvironment {
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
  const known = KNOWN_ENVIRONMENTS[ref];
  return {
    label: known ?? `UNRECOGNISED (${ref})`,
    isProduction: known === 'PRODUCTION',
    ref,
    isUnrecognised: known === undefined,
  };
}
