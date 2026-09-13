import type * as PrismaRuntime from '@prisma/client/runtime/library';

// ---------------------------------------------------------------------------
// NO UNIT TEST READS A `.env` FILE — on a laptop exactly as in CI. Registered
// in test/setupEnv.ts; held by test/noEnvFileLoaded.test.ts.
//
// The generated Prisma client (5.22) dotenv-loads `backend/.env` twice: AT
// IMPORT (`warnEnvConflicts`), and in the PrismaClient constructor — which
// `src/lib/prisma.ts` runs at import too. Both write every key in the file into
// `process.env`. CI has no `.env`, so CI never saw them; a laptop's unit run saw
// all of them — DATABASE_URL naming the staging database, the paid API keys,
// the chain. A test that forgot to mock `lib/prisma` or an LLM client would
// reach them from a laptop and still pass in CI.
//
// Both loads go through this one runtime module, and both take their paths
// from the generated config, which `prisma generate` fixes at generate time.
// The seam hands Prisma the paths a checkout WITHOUT a `.env` generates — CI's
// — so its loader still runs and finds nothing, as in CI. That is prevention,
// not cleanup: a load that never happens has no moment to be missed at, and
// the keys a test sets on purpose are never touched. Deleting the file's keys
// in root hooks instead would have to be timed against every load, and would
// clobber the keys tests set in their own `beforeAll`.
//
// It leans on two details of this Prisma version: the `warnEnvConflicts`
// export, and `getPrismaClient(config).relativeEnvPaths`. The guard fails if
// the generated client stops routing through either, or if Prisma's own loader
// stops loading — Prisma 7 drops `.env` loading altogether, and this file goes
// with it.
// ---------------------------------------------------------------------------

type PrismaRuntimeModule = typeof PrismaRuntime;
export type PrismaClientConfig = Parameters<PrismaRuntimeModule['getPrismaClient']>[0];

/** What `prisma generate` writes when it finds no `.env` — a clean checkout's, and so CI's. */
const NO_ENV_FILE: PrismaClientConfig['relativeEnvPaths'] = { rootEnvPath: null };

/**
 * What reached the seam, so the guard can prove the generated client routes
 * through it — in CI too, where there is no `.env` for the seam to withhold.
 */
export const intercepted: { importTimeLoads: unknown[]; clientConfigs: PrismaClientConfig[] } = {
  importTimeLoads: [],
  clientConfigs: [],
};

export function withoutEnvFiles(actual: PrismaRuntimeModule): PrismaRuntimeModule {
  return {
    ...actual,
    warnEnvConflicts(envPaths: unknown): void {
      intercepted.importTimeLoads.push(envPaths);
      actual.warnEnvConflicts(NO_ENV_FILE);
    },
    getPrismaClient(config: PrismaClientConfig) {
      intercepted.clientConfigs.push(config);
      return actual.getPrismaClient({ ...config, relativeEnvPaths: NO_ENV_FILE });
    },
  };
}
