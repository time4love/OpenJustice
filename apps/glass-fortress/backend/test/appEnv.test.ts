// Fabricated project refs — never the real ones. This repo is public.
const PROD = 'aaaaaaaaaaaaaaaaaaaa';
const STAGING = 'bbbbbbbbbbbbbbbbbbbb';

// The ref→environment lookup is STATED here rather than imported, so this file
// keeps its promise above and every ref in it stays fabricated. That also makes
// these cases about the RULE — a recognised database overrules an absent label —
// rather than about which two projects happen to exist today. The real wiring is
// covered where the real refs already appear: `operationalContext.test.ts` and
// `stagingAccess.test.ts`.
jest.mock('../src/lib/dbEnvironment', () => ({
  environmentOfProjectRef: (ref: string) =>
    ({ aaaaaaaaaaaaaaaaaaaa: 'production', bbbbbbbbbbbbbbbbbbbb: 'staging' })[ref] ?? null,
}));

import {
  assertEnvironmentIdentity,
  getAppEnv,
  projectRefFromPostgresUrl,
  projectRefFromSupabaseUrl,
} from '../src/lib/appEnv';

const pooler = (ref: string, port = 6543) =>
  `postgresql://postgres.${ref}:pw@aws-0-eu-central-1.pooler.supabase.com:${port}/postgres?pgbouncer=true`;
const direct = (ref: string) => `postgresql://postgres:pw@db.${ref}.supabase.co:5432/postgres`;
const supabase = (ref: string) => `https://${ref}.supabase.co`;

const envFor = (ref: string, extra: Record<string, string | undefined> = {}) => ({
  DATABASE_URL: pooler(ref),
  DIRECT_URL: pooler(ref, 5432),
  SUPABASE_URL: supabase(ref),
  ...extra,
});

describe('getAppEnv', () => {
  it('treats an unset APP_ENV as production', () => {
    expect(getAppEnv({})).toBe('production');
    expect(getAppEnv({ APP_ENV: '' })).toBe('production');
  });

  it('reads the two valid values', () => {
    expect(getAppEnv({ APP_ENV: 'production' })).toBe('production');
    expect(getAppEnv({ APP_ENV: 'staging' })).toBe('staging');
  });

  it('throws on an unrecognised value rather than silently defaulting', () => {
    expect(() => getAppEnv({ APP_ENV: 'stagng' })).toThrow(/APP_ENV must be one of/);
  });
});

describe('projectRefFromPostgresUrl', () => {
  it('reads the ref from the pooler connection user', () => {
    // Prod and staging share the pooler HOSTNAME, so the user is the only signal.
    expect(projectRefFromPostgresUrl(pooler(PROD))).toBe(PROD);
    expect(projectRefFromPostgresUrl(pooler(STAGING, 5432))).toBe(STAGING);
  });

  it('reads the ref from a direct connection hostname', () => {
    expect(projectRefFromPostgresUrl(direct(PROD))).toBe(PROD);
  });

  it('returns null for a non-Supabase database', () => {
    expect(projectRefFromPostgresUrl('postgresql://postgres:pw@localhost:5432/postgres')).toBeNull();
  });

  it('returns null for an unparseable value', () => {
    expect(projectRefFromPostgresUrl('not a url')).toBeNull();
  });
});

describe('projectRefFromSupabaseUrl', () => {
  it('reads the ref from the project URL', () => {
    expect(projectRefFromSupabaseUrl(supabase(STAGING))).toBe(STAGING);
  });

  it('returns null for anything else', () => {
    expect(projectRefFromSupabaseUrl('https://example.com')).toBeNull();
    expect(projectRefFromSupabaseUrl('')).toBeNull();
  });
});

describe('assertEnvironmentIdentity', () => {
  it('accepts an environment whose Supabase variables agree', () => {
    expect(assertEnvironmentIdentity({ APP_ENV: 'staging', ...envFor(STAGING) })).toEqual({
      appEnv: 'staging',
      projectRef: STAGING,
      pinned: false,
    });
  });

  it('rejects a half-overwritten environment', () => {
    // The Railway duplication failure: SUPABASE_URL was swapped to staging but
    // DATABASE_URL still carried production credentials.
    const env = {
      APP_ENV: 'staging',
      DATABASE_URL: pooler(PROD),
      DIRECT_URL: pooler(PROD, 5432),
      SUPABASE_URL: supabase(STAGING),
    };
    expect(() => assertEnvironmentIdentity(env)).toThrow(/half-configured/);
  });

  it('never prints a project ref in full', () => {
    const env = {
      APP_ENV: 'staging',
      DATABASE_URL: pooler(PROD),
      SUPABASE_URL: supabase(STAGING),
    };
    const message = (() => {
      try {
        assertEnvironmentIdentity(env);
        return '';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    })();
    expect(message).not.toContain(PROD);
    expect(message).not.toContain(STAGING);
    expect(message).toContain('aaaa…aa');
  });

  it('accepts a matching pin', () => {
    const env = { APP_ENV: 'staging', ...envFor(STAGING), EXPECTED_SUPABASE_PROJECT_REF: STAGING };
    expect(assertEnvironmentIdentity(env)).toEqual({
      appEnv: 'staging',
      projectRef: STAGING,
      pinned: true,
    });
  });

  it('rejects a wholesale-copied environment via the pin', () => {
    // Every variable is internally consistent, and the project is one this
    // codebase has no name for — so the ref→environment check below has nothing
    // to say and the PIN is the only thing left that can catch it. That is why
    // the pin still earns its place after that check exists.
    const unknown = 'cccccccccccccccccccc';
    const env = { APP_ENV: 'staging', ...envFor(unknown), EXPECTED_SUPABASE_PROJECT_REF: STAGING };
    expect(() => assertEnvironmentIdentity(env)).toThrow(/pointed at the wrong database/);
  });

  it('rejects production pointed at the staging database, before the pin is consulted', () => {
    // The same disagreement, now caught EARLIER and diagnosed better: a
    // recognised project ref names its own environment, so this no longer
    // depends on the pin having been set. It refused before; it refuses for a
    // stronger reason, and it would still refuse with no pin at all.
    const env = { APP_ENV: 'production', ...envFor(STAGING), EXPECTED_SUPABASE_PROJECT_REF: PROD };
    expect(() => assertEnvironmentIdentity(env)).toThrow(/connected to the staging database/);

    const unpinned = { APP_ENV: 'production', ...envFor(STAGING) };
    expect(() => assertEnvironmentIdentity(unpinned)).toThrow(/connected to the staging database/);
  });

  it('rejects a pin it cannot check', () => {
    const env = {
      APP_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/postgres',
      EXPECTED_SUPABASE_PROJECT_REF: STAGING,
    };
    expect(() => assertEnvironmentIdentity(env)).toThrow(/no Supabase project could be read/);
  });

  // -------------------------------------------------------------------------
  // A LOST LABEL AND A DELIBERATELY ABSENT ONE ARE THE SAME THING, until the
  // database is asked.
  //
  // `APP_ENV` unset means production, which is correct for the production
  // services — the variable really is absent there. On staging that default is
  // indistinguishable from the variable having been DROPPED, and dropping it
  // removed `requireStagingAccess` entirely, leaving the public Railway URL
  // open. The database cannot go missing the same way: without DATABASE_URL
  // nothing runs at all.
  // -------------------------------------------------------------------------
  it('refuses to start when the label was lost on a staging database', () => {
    expect(() => assertEnvironmentIdentity(envFor(STAGING))).toThrow(
      /connected to the staging database/,
    );
  });

  it('refuses even with no pin to fall back on', () => {
    // The pin is the check this would otherwise rely on, and it is another
    // variable that the same accident drops.
    const env = envFor(STAGING);
    expect(Object.keys(env)).not.toContain('EXPECTED_SUPABASE_PROJECT_REF');
    expect(() => assertEnvironmentIdentity(env)).toThrow(/connected to the staging database/);
  });

  it('accepts the staging database once the label agrees', () => {
    expect(assertEnvironmentIdentity({ APP_ENV: 'staging', ...envFor(STAGING) }).appEnv).toBe(
      'staging',
    );
  });

  it('accepts production unlabelled, which is how the production services run', () => {
    expect(assertEnvironmentIdentity(envFor(PROD)).appEnv).toBe('production');
  });

  it('refuses a label that names the OTHER environment, not merely a missing one', () => {
    expect(() => assertEnvironmentIdentity({ APP_ENV: 'staging', ...envFor(PROD) })).toThrow(
      /connected to the production database/,
    );
  });

  it('does not refuse an unrecognised project — that is an outage, not a mismatch', () => {
    // Failing closed here would take the production API down over a renamed
    // Supabase project. An unknown ref is not evidence of a disagreement.
    expect(assertEnvironmentIdentity(envFor('cccccccccccccccccccc')).appEnv).toBe('production');
  });

  it('does not print a project ref in full when it refuses', () => {
    const message = (() => {
      try {
        assertEnvironmentIdentity(envFor(STAGING));
        return '';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    })();
    expect(message).not.toContain(STAGING);
    expect(message).toContain('bbbb…bb');
  });

  it('allows a local database when nothing is pinned', () => {
    const env = { DATABASE_URL: 'postgresql://postgres:pw@localhost:5432/postgres' };
    expect(assertEnvironmentIdentity(env)).toEqual({
      appEnv: 'production',
      projectRef: null,
      pinned: false,
    });
  });

  it('tolerates DIRECT_URL being unset', () => {
    const env = { APP_ENV: 'staging', DATABASE_URL: pooler(STAGING), SUPABASE_URL: supabase(STAGING) };
    expect(assertEnvironmentIdentity(env).projectRef).toBe(STAGING);
  });
});
