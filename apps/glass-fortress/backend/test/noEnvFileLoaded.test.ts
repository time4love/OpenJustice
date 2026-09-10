import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as runtime from '@prisma/client/runtime/library';
// Constructs a PrismaClient at import, as the application does — so the
// generated client's import-time load AND its class are both exercised here.
import '../src/lib/prisma';
import { intercepted, type PrismaClientConfig } from './prismaEnvFile';

// ---------------------------------------------------------------------------
// The guard for test/prismaEnvFile.ts.
//
// It cannot lean on the developer's `.env`: CI has none, so a guard that
// imported `@prisma/client` and looked would pass there having tested nothing.
// So it proves three things that hold with or without one:
//   - the generated client — the one every unit test imports — sends both its
//     loads through the seam;
//   - Prisma's OWN loader, handed a throwaway `.env`, does write it into
//     `process.env` — so the last claim is not vacuous;
//   - through the seam, that same file reaches nothing a case can see.
// ---------------------------------------------------------------------------

type PrismaRuntimeModule = typeof runtime;
const actual = jest.requireActual<PrismaRuntimeModule>('@prisma/client/runtime/library');

// Inert, and named like the real thing so a leak behaves like the real hazard:
// the staging database, a paid API, the chain.
const PLANTED = {
  DATABASE_URL: 'postgresql://planted:planted@127.0.0.1:9/planted',
  DIRECT_URL: 'postgresql://planted:planted@127.0.0.1:9/planted',
  ANTHROPIC_API_KEY: 'planted-anthropic-key',
  RPC_URL: 'http://127.0.0.1:9',
} as const;
const PLANTED_KEYS = Object.keys(PLANTED) as (keyof typeof PLANTED)[];

// Counted before this file calls the seam itself, so it is the generated
// client's own calls.
const reachedTheSeamAtImport = {
  importTimeLoads: intercepted.importTimeLoads.length,
  clientConfigs: intercepted.clientConfigs.length,
};

const envDir = mkdtempSync(join(tmpdir(), 'gf-no-env-file-'));
const envFile = join(envDir, '.env');
writeFileSync(envFile, PLANTED_KEYS.map((name) => `${name}=${PLANTED[name]}`).join('\n'));

afterAll(() => {
  rmSync(envDir, { recursive: true, force: true });
});

// This file's `process.env` is its own copy (jest's sandbox). Clearing the
// planted names means a value exported by the shell cannot mask a load, nor be
// mistaken for one.
for (const name of PLANTED_KEYS) {
  delete process.env[name];
}

/** The planted keys whose planted value is in `process.env`. */
function plantedKeysVisible(): string[] {
  return PLANTED_KEYS.filter((name) => process.env[name] === PLANTED[name]);
}

/** The planted keys `load` made visible; `process.env` is restored exactly afterwards. */
function plantedKeysVisibleAfter(load: () => void): string[] {
  const before = { ...process.env };
  try {
    load();
    return plantedKeysVisible();
  } finally {
    process.env = before;
  }
}

/** The generated client's own config, naming the planted `.env` instead of its own. */
function configNamingThePlantedFile(): PrismaClientConfig {
  const config = intercepted.clientConfigs.at(0);
  if (config === undefined) {
    throw new Error('the generated client never reached the seam — nothing to build a client from');
  }
  return { ...config, relativeEnvPaths: { rootEnvPath: null, schemaEnvPath: envFile } };
}

// The load the generated client makes at import, handed the planted file, while
// this file is being imported — the moment a laptop's `.env` used to arrive.
runtime.warnEnvConflicts({ rootEnvPath: null, schemaEnvPath: envFile });

describe('the generated client, which every unit test imports', () => {
  it('sent its import-time .env load through the seam', () => {
    expect(reachedTheSeamAtImport.importTimeLoads).toBe(1);
  });

  it('built its PrismaClient class through the seam', () => {
    expect(reachedTheSeamAtImport.clientConfigs).toBe(1);
  });
});

describe("Prisma's own loader, handed the planted .env — so what follows is not vacuous", () => {
  it('writes every key into process.env at import', () => {
    expect(
      plantedKeysVisibleAfter(() => {
        actual.warnEnvConflicts({ rootEnvPath: null, schemaEnvPath: envFile });
      }),
    ).toEqual(PLANTED_KEYS);
  });

  it('writes every key into process.env when a client is constructed', () => {
    const Client = actual.getPrismaClient(configNamingThePlantedFile());
    expect(plantedKeysVisibleAfter(() => new Client())).toEqual(PLANTED_KEYS);
  });
});

describe('through the seam, the planted .env reaches nothing', () => {
  it.each(PLANTED_KEYS)(
    '%s is not visible to a case, though the import-time load was handed it',
    (name) => {
      expect(process.env[name]).toBeUndefined();
    },
  );

  it('nor after a client is constructed from a config naming it', () => {
    const Client = runtime.getPrismaClient(configNamingThePlantedFile());
    expect(plantedKeysVisibleAfter(() => new Client())).toEqual([]);
  });
});
