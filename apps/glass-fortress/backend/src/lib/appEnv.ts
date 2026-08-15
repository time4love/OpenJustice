// ---------------------------------------------------------------------------
// Environment identity guard
//
// The failure this exists to prevent: for months local development and the
// production deployment shared one DATABASE_URL, so every test scan wrote to the
// live vault. Duplicating the Railway environment reproduced the same hazard —
// the staging services came up holding production credentials.
//
// A label (`APP_ENV`) is not enough on its own, because prod and staging sit
// behind the *same* Supabase pooler host (`aws-0-eu-central-1.pooler.supabase.com`)
// and are told apart only by the project ref embedded in the connection user.
// So the guard checks identity, not hostname:
//
//   1. DATABASE_URL, DIRECT_URL and SUPABASE_URL must all name the same Supabase
//      project. Always enforced — this catches a half-overwritten environment.
//   2. If EXPECTED_SUPABASE_PROJECT_REF is set, that project must be the one
//      configured. This is the explicit per-environment pin, and the only thing
//      that catches an environment whose credentials were copied wholesale.
//
// Project refs are credentials-adjacent for a public repo, so they are never
// hardcoded here — the pin lives in the deployment's environment variables, and
// failure messages never print a ref in full.
// ---------------------------------------------------------------------------

export type AppEnv = 'production' | 'staging';

const APP_ENVS: readonly AppEnv[] = ['production', 'staging'];

type EnvSource = Record<string, string | undefined>;

/**
 * Reads `APP_ENV`. Unset means production, matching the frontend: the variable
 * is deliberately absent from the production Railway services. An unrecognised
 * value throws rather than falling back, so a typo fails loudly.
 */
export function getAppEnv(env: EnvSource = process.env): AppEnv {
  const raw = env['APP_ENV'];
  if (raw === undefined || raw === '') return 'production';
  if (!APP_ENVS.includes(raw as AppEnv)) {
    throw new Error(
      `APP_ENV must be one of ${APP_ENVS.join(' | ')} (or unset for production), got '${raw}'`,
    );
  }
  return raw as AppEnv;
}

/**
 * The Supabase project ref a Postgres connection string points at.
 *
 * Two shapes are in use:
 *   pooler — postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *   direct — postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
 *
 * Returns null for anything else (a local Postgres, for instance), which the
 * caller treats as "nothing to compare" rather than as a mismatch.
 */
export function projectRefFromPostgresUrl(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }

  const directMatch = /^db\.([a-z0-9]+)\.supabase\.(co|com)$/.exec(url.hostname);
  if (directMatch?.[1]) return directMatch[1];

  if (url.hostname.endsWith('.pooler.supabase.com')) {
    const user = decodeURIComponent(url.username);
    const poolerMatch = /^postgres\.([a-z0-9]+)$/.exec(user);
    if (poolerMatch?.[1]) return poolerMatch[1];
  }

  return null;
}

/** The Supabase project ref a `SUPABASE_URL` points at. */
export function projectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return null;
  }
  const match = /^([a-z0-9]+)\.supabase\.(co|com)$/.exec(url.hostname);
  return match?.[1] ?? null;
}

/** Never print a project ref in full — this repo, and its logs, are public. */
function mask(ref: string): string {
  return `${ref.slice(0, 4)}…${ref.slice(-2)}`;
}

export interface EnvironmentIdentity {
  appEnv: AppEnv;
  projectRef: string | null;
  /** True when EXPECTED_SUPABASE_PROJECT_REF was set and matched. */
  pinned: boolean;
}

/**
 * Throws when the configured database does not match the declared environment.
 * Called at startup, before the server listens — a mismatch must stop the
 * process, not degrade it.
 */
export function assertEnvironmentIdentity(env: EnvSource = process.env): EnvironmentIdentity {
  const appEnv = getAppEnv(env);

  const refs: { name: string; ref: string | null }[] = [
    { name: 'DATABASE_URL', ref: parse(env['DATABASE_URL'], projectRefFromPostgresUrl) },
    { name: 'DIRECT_URL', ref: parse(env['DIRECT_URL'], projectRefFromPostgresUrl) },
    { name: 'SUPABASE_URL', ref: parse(env['SUPABASE_URL'], projectRefFromSupabaseUrl) },
  ];

  const identified = refs.filter((r): r is { name: string; ref: string } => r.ref !== null);
  const distinct = [...new Set(identified.map((r) => r.ref))];

  if (distinct.length > 1) {
    const detail = identified.map((r) => `${r.name}→${mask(r.ref)}`).join(', ');
    throw new Error(
      `Environment '${appEnv}' is half-configured: its Supabase variables name different ` +
        `projects (${detail}). Overwrite all of DATABASE_URL, DIRECT_URL and SUPABASE_URL ` +
        `together, then restart.`,
    );
  }

  const projectRef = distinct[0] ?? null;
  const expected = env['EXPECTED_SUPABASE_PROJECT_REF'];

  if (expected !== undefined && expected !== '') {
    if (projectRef === null) {
      throw new Error(
        `Environment '${appEnv}' pins EXPECTED_SUPABASE_PROJECT_REF, but no Supabase project ` +
          `could be read from DATABASE_URL, DIRECT_URL or SUPABASE_URL.`,
      );
    }
    if (projectRef !== expected) {
      throw new Error(
        `Environment '${appEnv}' is pointed at the wrong database: expected project ` +
          `${mask(expected)}, got ${mask(projectRef)}. Refusing to start — this is how ` +
          `development writes end up in the production vault.`,
      );
    }
    return { appEnv, projectRef, pinned: true };
  }

  return { appEnv, projectRef, pinned: false };
}

function parse(
  value: string | undefined,
  extract: (raw: string) => string | null,
): string | null {
  if (value === undefined || value === '') return null;
  return extract(value);
}

/**
 * Startup wrapper: asserts identity and logs the result. Returns the identity so
 * the caller can log or expose it; throws to stop the boot on a mismatch.
 */
export function verifyEnvironmentIdentityAtStartup(env: EnvSource = process.env): EnvironmentIdentity {
  const identity = assertEnvironmentIdentity(env);
  const where = identity.projectRef === null ? 'a non-Supabase database' : mask(identity.projectRef);

  if (identity.pinned) {
    console.log(`[startup] Environment: ${identity.appEnv} → ${where} (pinned)`);
  } else {
    console.warn(
      `[startup] Environment: ${identity.appEnv} → ${where}. ` +
        `EXPECTED_SUPABASE_PROJECT_REF is not set, so the database identity is unverified. ` +
        `Set it on this deployment to make a wrong-database boot impossible.`,
    );
  }

  return identity;
}
