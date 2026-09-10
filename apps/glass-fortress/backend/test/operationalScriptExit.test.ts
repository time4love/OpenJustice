// ---------------------------------------------------------------------------
// THE EXIT CODE IS THE VERDICT — observed as a PROCESS, not only as a return.
//
// `forensics:audit-theses` exits 0 · 2 · 1, and its cases assert `exitCodeFor`.
// That is the NUMBER. What turns the number into the process's exit is one line
// of `runOperationalScript` — "A NUMBER is taken as the exit code" — and nothing
// observed it: replacing that line with `void code` left the unit and evidence
// suites exactly at baseline. An instrument whose verdict never reaches the shell
// reports 0 on every run, which is the reassuring direction and the worst one.
//
// A NEW FILE, AND THAT IS DECLARED. `operationalScriptsGuarded.test.ts` is KEEP
// and a source scan; `operationalContext.test.ts` holds the guard's refusals.
// This is the one behaviour between them — what happens AFTER the guard passes —
// and it reuses that file's own chain mock and consistent-container shape rather
// than inventing a second double of the environment.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/chainIdentity', () => {
  const actual = jest.requireActual('../src/lib/chainIdentity') as Record<string, unknown>;
  return { ...actual, readChainIdentity: jest.fn() };
});

import { EXPECTED_CHAIN_ID, readChainIdentity } from '../src/lib/chainIdentity';
import { KNOWN_ENVIRONMENTS } from '../src/lib/dbEnvironment';
import { runOperationalScript } from '../src/lib/operationalContext';

const chain = readChainIdentity as jest.MockedFunction<typeof readChainIdentity>;

// NO PROJECT REF IS WRITTEN DOWN HERE — read from the one module that names them,
// as `operationalContext.test.ts` does, and for the same public-repository reason.
const PROD_REF = Object.keys(KNOWN_ENVIRONMENTS).find((r) => KNOWN_ENVIRONMENTS[r] === 'production');
if (PROD_REF === undefined) throw new Error('no known production project ref');
const pooler = (ref: string): string =>
  `postgresql://postgres.${ref}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;

/** A production container that agrees with itself on every axis, so the body runs. */
const CONTAINER: NodeJS.ProcessEnv = {
  RAILWAY_DEPLOYMENT_ID: 'dep-1',
  RAILWAY_ENVIRONMENT_NAME: 'production',
  RAILWAY_GIT_COMMIT_SHA: 'abc1234def',
  DATABASE_URL: pooler(PROD_REF),
  DIRECT_URL: pooler(PROD_REF),
  SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
  EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
};

let exit: jest.SpyInstance;
let listenersBefore: ((...args: unknown[]) => void)[];

beforeEach(() => {
  jest.clearAllMocks();
  chain.mockResolvedValue({
    reachable: true,
    chainId: EXPECTED_CHAIN_ID.production,
    registryAddress: '0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22',
    registryDeployed: true,
  });
  // `process.exit` is observed, never taken: a real exit would end the worker.
  exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  listenersBefore = process.listeners('exit') as ((...args: unknown[]) => void)[];
});

afterEach(() => {
  // The guard registers its ledger emission on the process's `exit` EVENT. Left
  // registered, it would write a ledger line when the jest worker exits — so the
  // listeners this case added are removed, and only those.
  for (const listener of process.listeners('exit')) {
    if (!listenersBefore.includes(listener as (...args: unknown[]) => void)) {
      process.removeListener('exit', listener as (...args: unknown[]) => void);
    }
  }
  jest.restoreAllMocks();
});

describe('the number a body resolves to IS the process exit', () => {
  it('a body resolving to 2 makes runOperationalScript call process.exit(2)', async () => {
    await runOperationalScript(() => Promise.resolve(2), ['--env', 'production'], CONTAINER);
    expect(exit).toHaveBeenCalledWith(2);
  });

  it('and 1 — the gate-did-not-hold exit reaches the shell as 1, not as a clean run', async () => {
    await runOperationalScript(() => Promise.resolve(1), ['--env', 'production'], CONTAINER);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('a body resolving to NOTHING exits by finishing — no code is invented for it', async () => {
    // "Anything else means the script had none to give and a clean run exits 0."
    // The non-firing control: an exit with a number here would be the guard
    // deciding a verdict the script never gave.
    await runOperationalScript(() => Promise.resolve(undefined), ['--env', 'production'], CONTAINER);
    expect(exit).not.toHaveBeenCalled();
  });
});
