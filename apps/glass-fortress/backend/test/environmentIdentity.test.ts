const readChainIdentity = jest.fn();

jest.mock('../src/lib/chainIdentity', () => ({
  ...jest.requireActual('../src/lib/chainIdentity'),
  readChainIdentity: (...args: unknown[]) => readChainIdentity(...args),
}));

const count = jest.fn().mockResolvedValue(0);
jest.mock('../src/lib/prisma', () => ({
  prisma: {
    trackedUrl: { count },
    urlSnapshot: { count },
    urlVersionDiff: { count },
    evidence: { count },
    thesis: { count },
    researchSession: { count },
  },
}));

import { describeEnvironment } from '../src/services/environmentIdentity';

// Fabricated project refs — never the real ones. This repo is public.
const REF = 'cccccccccccccccccccc';
const REGISTRY = '0x0000000000000000000000000000000000000abc';

const ORIGINAL_ENV = process.env;

function setEnv(appEnv: 'production' | 'staging', extra: Record<string, string> = {}): void {
  process.env = {
    DATABASE_URL: `postgresql://postgres.${REF}:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    DIRECT_URL: `postgresql://postgres.${REF}:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    SUPABASE_URL: `https://${REF}.supabase.co`,
    APP_ENV: appEnv,
    EXPECTED_SUPABASE_PROJECT_REF: REF,
    ...extra,
  };
}

const onChain = (chainId: number, registryDeployed = true) => ({
  reachable: true as const,
  chainId,
  registryAddress: REGISTRY,
  registryDeployed,
});

beforeEach(() => {
  readChainIdentity.mockReset();
  count.mockClear();
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('describeEnvironment', () => {
  it('CONFIRMS an environment whose database pin and chain agree', async () => {
    setEnv('production');
    readChainIdentity.mockResolvedValue(onChain(8453));

    const report = await describeEnvironment();

    expect(report.environment).toBe('production');
    expect(report.verdict).toBe('CONFIRMED');
    expect(report.warnings).toEqual([]);
    expect(report.chain).toMatchObject({ expectedChainId: 8453, matchesEnvironment: true });
  });

  it('CONFIRMS staging on its own chain', async () => {
    setEnv('staging');
    readChainIdentity.mockResolvedValue(onChain(84532));

    const report = await describeEnvironment();

    expect(report.environment).toBe('staging');
    expect(report.verdict).toBe('CONFIRMED');
  });

  it('reports CONFLICT when the label and the chain disagree', async () => {
    // The failure the tool exists for: a deployment calling itself production
    // while anchoring to a testnet, or holding staging credentials under a
    // production label. One wrong variable cannot move both axes, so a
    // disagreement means one of them is lying.
    setEnv('production');
    readChainIdentity.mockResolvedValue(onChain(84532));

    const report = await describeEnvironment();

    expect(report.verdict).toBe('CONFLICT');
    expect(report.warnings.join(' ')).toContain('CONTRADICTION');
    expect(report.chain.matchesEnvironment).toBe(false);
  });

  it('reports CONFLICT when the registry address holds no code', async () => {
    setEnv('production');
    readChainIdentity.mockResolvedValue(onChain(8453, false));

    const report = await describeEnvironment();

    expect(report.verdict).toBe('CONFLICT');
    expect(report.warnings.join(' ')).toContain('anchoring nothing');
  });

  it('is UNVERIFIED, not CONFIRMED, when the database identity is unpinned', async () => {
    // An unpinned APP_ENV is a self-declaration. It must not read as a checked
    // fact just because nothing contradicted it.
    setEnv('production', { EXPECTED_SUPABASE_PROJECT_REF: '' });
    readChainIdentity.mockResolvedValue(onChain(8453));

    const report = await describeEnvironment();

    expect(report.verdict).toBe('UNVERIFIED');
    expect(report.database.pinned).toBe(false);
    expect(report.warnings.join(' ')).toContain('self-declaration');
  });

  it('is UNVERIFIED when the chain cannot be read, and still names the environment', async () => {
    // A third-party RPC outage must degrade the answer, never withhold it —
    // failing closed would push the caller back to guessing from a connector name.
    setEnv('production');
    readChainIdentity.mockResolvedValue({
      reachable: false,
      registryAddress: REGISTRY,
      error: 'ECONNREFUSED',
    });

    const report = await describeEnvironment();

    expect(report.environment).toBe('production');
    expect(report.verdict).toBe('UNVERIFIED');
    expect(report.warnings.join(' ')).toContain('ECONNREFUSED');
  });

  it('never returns a project ref in full', async () => {
    setEnv('production');
    readChainIdentity.mockResolvedValue(onChain(8453));

    const report = await describeEnvironment();

    expect(report.database.projectRef).not.toBe(REF);
    expect(JSON.stringify(report)).not.toContain(REF);
  });
});
