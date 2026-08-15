/**
 * Which deployment this process is serving.
 *
 * Server-only — `APP_ENV` is not a `NEXT_PUBLIC_*` variable, so it is readable
 * from `proxy.ts` and server components but never from the browser bundle.
 */
export type AppEnv = 'production' | 'staging';

const APP_ENVS: readonly AppEnv[] = ['production', 'staging'];

/**
 * Reads `APP_ENV`.
 *
 * An unset value means production: `APP_ENV` is deliberately absent from the
 * production Railway service, and a missing variable must never be able to put
 * the public site behind a password. Non-production environments must set it
 * explicitly.
 *
 * An unrecognised value throws rather than falling back, so that a typo
 * (`stagng`) fails loudly instead of silently un-gating the environment.
 */
export function getAppEnv(): AppEnv {
  const raw = process.env.APP_ENV;
  if (raw === undefined || raw === '') return 'production';
  if (!APP_ENVS.includes(raw as AppEnv)) {
    throw new Error(
      `APP_ENV must be one of ${APP_ENVS.join(' | ')} (or unset for production), got '${raw}'`,
    );
  }
  return raw as AppEnv;
}

export function isProduction(): boolean {
  return getAppEnv() === 'production';
}

/**
 * Demo mode hides the staging banner so it is not on screen during a
 * journalist meeting. It does **not** relax the access gate.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}
