import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { warnEnvConflicts } from '@prisma/client/runtime/library';
import { readChainIdentity } from '../src/lib/chainIdentity';
import { CHAIN_VARIABLES } from './chainIsolation';

// ---------------------------------------------------------------------------
// The guard for test/setupNoRealChain.ts, run against the loader that defeated
// the deletion it replaced.
//
// It cannot lean on the developer's `.env`: CI has none, so a guard that
// imported `@prisma/client` and looked would pass there having tested nothing.
// Instead it hands PRISMA'S OWN import-time loader — the exact call the
// generated client makes, `warnEnvConflicts({ rootEnvPath, schemaEnvPath })` —
// a throwaway file defining the chain variables, at the two moments a laptop's
// `.env` arrives: while the test file is being imported, and inside a hook.
// Each load is checked to have landed, so the guard cannot pass because the
// loader quietly did nothing.
// ---------------------------------------------------------------------------

// Inert, and shaped like the real thing so a leak behaves like the real hazard.
const PLANTED: Record<(typeof CHAIN_VARIABLES)[number], string> = {
  RPC_URL: 'http://127.0.0.1:9',
  REGISTRAR_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
  EVIDENCE_REGISTRY_ADDRESS: `0x${'9'.repeat(40)}`,
};

const envDir = mkdtempSync(join(tmpdir(), 'gf-chain-isolation-'));
const envFile = join(envDir, '.env');
writeFileSync(envFile, CHAIN_VARIABLES.map((name) => `${name}=${PLANTED[name]}`).join('\n'));

afterAll(() => {
  rmSync(envDir, { recursive: true, force: true });
});

/** Prisma's import-time `.env` load, on a file of our making. True if it landed. */
function loadLikePrismaDoes(): boolean {
  warnEnvConflicts({ rootEnvPath: null, schemaEnvPath: envFile });
  return CHAIN_VARIABLES.every((name) => process.env[name] === PLANTED[name]);
}

const landedAtImport = loadLikePrismaDoes();

describe('a .env loaded while the test file is being imported', () => {
  it('landed — so what follows is not vacuous', () => {
    expect(landedAtImport).toBe(true);
  });

  it.each(CHAIN_VARIABLES)('%s is gone by the time a case runs', (name) => {
    expect(process.env[name]).toBeUndefined();
  });

  it('so the chain-identity read answers without opening a provider', async () => {
    // The incident's own shape: this read raced a live RPC for 8 s inside
    // jest's 5 s budget.
    await expect(readChainIdentity()).resolves.toMatchObject({
      reachable: false,
      error: expect.stringContaining('RPC_URL') as unknown,
    });
  });
});

describe('a .env loaded by a hook, after the root beforeAll has run', () => {
  let landedInHook = false;

  beforeAll(() => {
    landedInHook = loadLikePrismaDoes();
  });

  it('landed — so what follows is not vacuous', () => {
    expect(landedInHook).toBe(true);
  });

  it.each(CHAIN_VARIABLES)('%s is gone by the time a case runs', (name) => {
    expect(process.env[name]).toBeUndefined();
  });
});
