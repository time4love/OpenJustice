// ---------------------------------------------------------------------------
// WHERE AN OPERATIONAL SCRIPT MAY RUN, AND WHAT IT MUST AGREE WITH FIRST.
//
// The 2026-08-29 incident, made unconstructible. A local run read PRODUCTION's
// database and STAGING's chain and wrote 91 integrity verdicts into production
// that do not mean what they say.
//
// TWO SEPARATE PROPERTIES ARE UNDER TEST, and conflating them is how the old
// rule came to look sufficient:
//
//   1. The environment arrives WHOLE. Without RAILWAY_DEPLOYMENT_ID nothing
//      runs, so there is no partial credential file for dotenv to fill the gaps
//      around — the incident's shape cannot be assembled.
//   2. The environment is STATED TWICE and cross-examined. `railway ssh
//      --environment X` is still a human assertion; `--env` is the second one,
//      and every axis the container knows about itself gets to disagree with it.
//
// The final case replays the incident against this guard. It is the one that
// matters: every axis but the chain agreed, so a check on any single axis —
// including the database confirmation that WAS performed, correctly, on every
// run — passes it.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/chainIdentity', () => {
  const actual = jest.requireActual('../src/lib/chainIdentity') as Record<string, unknown>;
  return { ...actual, readChainIdentity: jest.fn() };
});

import { readChainIdentity, type ChainIdentity } from '../src/lib/chainIdentity';
import { KNOWN_ENVIRONMENTS } from '../src/lib/dbEnvironment';
import type { AppEnv } from '../src/lib/appEnv';
import {
  OperationalContextError,
  assertOperationalContext,
  withoutEnvFlag,
} from '../src/lib/operationalContext';

const chain = readChainIdentity as jest.MockedFunction<typeof readChainIdentity>;

// NO PROJECT REF IS WRITTEN DOWN HERE. `dbEnvironment` is the one place in the
// codebase that names the two projects; every extra literal copy is both a
// second source of truth and another ref committed to a public repository. These
// are read from it, and the vacuity guard below is what stops a lookup that
// silently finds nothing from turning the cases into passes that prove nothing.
function refFor(environment: AppEnv): string {
  const ref = Object.keys(KNOWN_ENVIRONMENTS).find((r) => KNOWN_ENVIRONMENTS[r] === environment);
  if (ref === undefined) throw new Error(`no known project ref for ${environment}`);
  return ref;
}

const PROD_REF = refFor('production');
const STAGING_REF = refFor('staging');
const MAINNET_REGISTRY = '0x0e21561bbfbb8716713bd60cd21ec5730a4d0d22';

function pooler(ref: string): string {
  return `postgresql://postgres.${ref}:x@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
}

/** A container that is internally consistent, so each case can break one thing. */
function deployment(over: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    RAILWAY_DEPLOYMENT_ID: 'dep-1',
    RAILWAY_ENVIRONMENT_NAME: 'production',
    RAILWAY_GIT_COMMIT_SHA: 'abc1234def',
    // APP_ENV is deliberately absent on the production services — unset means
    // production, and a test that set it would not be testing production.
    DATABASE_URL: pooler(PROD_REF),
    DIRECT_URL: pooler(PROD_REF),
    SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
    EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
    ...over,
  };
}

const MAINNET: ChainIdentity = {
  reachable: true,
  chainId: 8453,
  registryAddress: MAINNET_REGISTRY,
  registryDeployed: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  chain.mockResolvedValue(MAINNET);
});

/** The message of the refusal, or a failure if the call did not refuse at all. */
async function refusal(argv: string[], env: NodeJS.ProcessEnv): Promise<string> {
  try {
    await assertOperationalContext(argv, env);
  } catch (err) {
    expect(err).toBeInstanceOf(OperationalContextError);
    return (err as OperationalContextError).message;
  }
  throw new Error('expected a refusal, and the guard allowed the run');
}

describe('an operational script runs only inside a deployment', () => {
  it('refuses on a laptop, and says how to run it properly', async () => {
    // RAILWAY_DEPLOYMENT_ID is set only inside a running deployment: absent
    // locally, and absent under `railway run` — which is the whole point, since
    // `railway run` injects the variables into a LOCAL process and is exactly
    // the shape that let a partial env file survive.
    const env = deployment();
    delete env.RAILWAY_DEPLOYMENT_ID;

    const message = await refusal(['--env', 'production'], env);
    expect(message).toContain('Operational scripts run only inside a deployment.');
    expect(message).toContain('railway ssh --environment <env> --service <svc>');
  });

  it('refuses before it looks at anything else — an empty id is not an id', async () => {
    const message = await refusal([], deployment({ RAILWAY_DEPLOYMENT_ID: '' }));
    expect(message).toContain('Operational scripts run only inside a deployment.');
    // Not the --env refusal: the location is decided first, and it is a
    // different conversation from which environment you meant.
    expect(message).not.toContain('--env is required');
  });
});

describe('the environment is stated twice', () => {
  it('refuses without --env rather than defaulting to anything', async () => {
    // A default would make the second statement agree with whatever the
    // container said, which is the one thing it is not for.
    const message = await refusal([], deployment());
    expect(message).toContain('--env is required');
  });

  it('refuses a flag with no value, rather than swallowing the next flag', async () => {
    const message = await refusal(['--env', '--dry-run'], deployment());
    expect(message).toContain('--env is required');
  });

  it('refuses an environment that does not exist', async () => {
    expect(await refusal(['--env', 'prod'], deployment())).toContain("got 'prod'");
  });

  it('accepts --env=production as well as --env production', async () => {
    const context = await assertOperationalContext(['--env=production'], deployment());
    expect(context.env).toBe('production');
  });
});

describe('every axis gets to disagree with the operator', () => {
  it('refuses when Railway names a different environment', async () => {
    const message = await refusal(
      ['--env', 'production'],
      deployment({ RAILWAY_ENVIRONMENT_NAME: 'staging' }),
    );
    expect(message).toContain("RAILWAY_ENVIRONMENT_NAME says 'staging'");
  });

  it('refuses when APP_ENV names a different environment', async () => {
    const message = await refusal(
      ['--env', 'production'],
      deployment({
        APP_ENV: 'staging',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
        DATABASE_URL: pooler(STAGING_REF),
        DIRECT_URL: pooler(STAGING_REF),
        SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
        EXPECTED_SUPABASE_PROJECT_REF: STAGING_REF,
      }),
    );
    expect(message).toContain("says 'staging'");
  });

  it('refuses when the database names a different environment from APP_ENV', async () => {
    // The database is the one voice that does not pass through APP_ENV, and so
    // the only configuration axis that can contradict it.
    const message = await refusal(
      ['--env', 'production'],
      deployment({
        DATABASE_URL: pooler(STAGING_REF),
        DIRECT_URL: pooler(STAGING_REF),
        SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
      }),
    );
    // Both voices report, and they name the same thing: the deployment calls
    // itself production and is holding staging's project. `--env production`
    // does not get to break the tie.
    expect(message).toContain('connected to the staging database');
    expect(message).toContain("DATABASE_URL project ref says 'staging'");
  });

  it('refuses an unpinned database — a label nobody checked is a self-declaration', async () => {
    const env = deployment();
    delete env.EXPECTED_SUPABASE_PROJECT_REF;

    const message = await refusal(['--env', 'production'], env);
    expect(message).toContain('EXPECTED_SUPABASE_PROJECT_REF is not set');
  });

  it('refuses a database this codebase has no name for', async () => {
    const unknown = 'abcdefghijklmnopqrst';
    const message = await refusal(
      ['--env', 'production'],
      deployment({
        DATABASE_URL: pooler(unknown),
        DIRECT_URL: pooler(unknown),
        SUPABASE_URL: `https://${unknown}.supabase.co`,
        EXPECTED_SUPABASE_PROJECT_REF: unknown,
      }),
    );
    expect(message).toContain('DATABASE_URL project ref cannot say');
  });

  it('never prints a project ref in full — this repository and its logs are public', async () => {
    const unknown = 'abcdefghijklmnopqrst';
    const message = await refusal(
      ['--env', 'production'],
      deployment({
        DATABASE_URL: pooler(unknown),
        DIRECT_URL: pooler(unknown),
        SUPABASE_URL: `https://${unknown}.supabase.co`,
        EXPECTED_SUPABASE_PROJECT_REF: unknown,
      }),
    );
    expect(message).not.toContain(unknown);
    expect(message).toContain('abcd…st');
  });
});

describe('the axis the incident turned on', () => {
  it('refuses when the RPC reports the other chain — the 2026-08-29 failure', async () => {
    // THE REPLAY. Production's database, staging's chain. Every configuration
    // axis agrees; the run confirmed the database BY DATA, correctly, and wrote
    // 91 verdicts anyway. Only the chain can catch this, and only if it is asked.
    chain.mockResolvedValue({
      reachable: true,
      chainId: 84532,
      registryAddress: MAINNET_REGISTRY,
      registryDeployed: true,
    });

    const message = await refusal(['--env', 'production'], deployment());
    expect(message).toContain('the RPC reports chain 84532');
    expect(message).toContain("'production' anchors to 8453");
  });

  it('refuses when the registry address holds no code', async () => {
    // A transaction to a codeless address SUCCEEDS and returns a valid hash
    // while anchoring nothing — a real transaction, a real hash, fabricated
    // chain of custody.
    chain.mockResolvedValue({ ...MAINNET, registryDeployed: false });

    expect(await refusal(['--env', 'production'], deployment())).toContain('no contract exists');
  });

  it('refuses when the chain cannot be read at all — silence is not agreement', async () => {
    chain.mockResolvedValue({
      reachable: false,
      registryAddress: MAINNET_REGISTRY,
      error: 'RPC did not respond within 8000ms.',
    });

    const message = await refusal(['--env', 'production'], deployment());
    expect(message).toContain('the chain axis could not be read');
  });

  it('reports EVERY disagreement at once, not just the first', async () => {
    // A guard that stops at the first problem turns one wrong deployment into
    // several rounds of fixing and re-running, and the second round is where
    // attention has already moved on.
    chain.mockResolvedValue({ ...MAINNET, chainId: 84532 });

    const message = await refusal(
      ['--env', 'production'],
      deployment({ RAILWAY_ENVIRONMENT_NAME: 'staging' }),
    );
    expect(message).toContain('RAILWAY_ENVIRONMENT_NAME');
    expect(message).toContain('the RPC reports chain 84532');
  });
});

describe('a coherent deployment is allowed through', () => {
  it('agrees, and reports what produced the run', async () => {
    const context = await assertOperationalContext(['--env', 'production'], deployment());

    expect(context).toEqual({
      env: 'production',
      deploymentId: 'dep-1',
      commitSha: 'abc1234def',
    });
  });

  it('a missing commit sha is a gap in provenance, never a refusal', async () => {
    // By this point the environment is already whole. Refusing here would stop
    // real work over a label, which is how a guard earns being switched off.
    const env = deployment();
    delete env.RAILWAY_GIT_COMMIT_SHA;

    expect((await assertOperationalContext(['--env', 'production'], env)).commitSha).toBeNull();
  });

  it('agrees for staging too — the rule has no per-environment exception', async () => {
    chain.mockResolvedValue({ ...MAINNET, chainId: 84532 });
    const context = await assertOperationalContext(
      ['--env', 'staging'],
      deployment({
        APP_ENV: 'staging',
        RAILWAY_ENVIRONMENT_NAME: 'staging',
        DATABASE_URL: pooler(STAGING_REF),
        DIRECT_URL: pooler(STAGING_REF),
        SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
        EXPECTED_SUPABASE_PROJECT_REF: STAGING_REF,
      }),
    );
    expect(context.env).toBe('staging');
  });
});

describe('the declaration does not become part of the work', () => {
  it('strips --env in both spellings, and its value', () => {
    // db:simulate joins everything after `--` into the statement it simulates,
    // so an un-stripped declaration would be executed as part of the SQL.
    expect(withoutEnvFlag(['--env', 'production', 'SELECT 1'])).toEqual(['SELECT 1']);
    expect(withoutEnvFlag(['--env=production', 'SELECT 1'])).toEqual(['SELECT 1']);
    expect(withoutEnvFlag(['SELECT 1'])).toEqual(['SELECT 1']);
  });
});
