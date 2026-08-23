import { Prisma } from '@prisma/client';
import {
  describeFailure,
  measureLoss,
  simulateStatement,
  type SimulationClient,
  type SimulationTx,
  type TableCount,
} from '../src/services/dbSimulation';

// ---------------------------------------------------------------------------
// dbSimulation — the measurement behind `npm run db:simulate`.
//
// The property under test is not "it can detect a loss" — it is that it can
// NEVER report a verdict it did not measure, in either direction: no HIGH RISK
// from counts never taken, and no LOW RISK from a count that silently became
// zero. On 2026-08-23 a purely additive
// migration script was reported as "533 rows lost, every table dropped"
// because the statement never ran (PostgreSQL refuses multi-command prepared
// statements), the after-count was therefore never taken, and the failure
// was missed because Prisma's error message starts with a newline so its
// "first line" was ''. A simulator that cries wolf is one that gets ignored
// when it matters, so each way the statement can fail to run is asserted to
// produce a non-measured outcome, never a HIGH RISK verdict.
//
// Errors below are constructed with the exact shape Prisma 5 produces for a
// raw-query failure (P2010 wrapping the server's SQLSTATE and message),
// captured from a real run against staging.
// ---------------------------------------------------------------------------

const FULL_VAULT: TableCount[] = [
  { table: 'Evidence', rows: 9 },
  { table: 'Researcher', rows: 2 },
  { table: 'Thesis', rows: 0 },
];

function prismaRawError(sqlstate: string, message: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `\nInvalid \`prisma.$executeRawUnsafe()\` invocation:\n\n\nRaw query failed. Code: \`${sqlstate}\`. Message: \`${message}\``,
    { code: 'P2010', clientVersion: '5.22.0', meta: { code: sqlstate, message } },
  );
}

/** What the count query returns per table: a count, or NULL when one could not be taken. */
interface RawCount {
  table: string;
  rows: number | null;
}

/**
 * A client whose transaction behaves like Prisma's interactive transaction: the
 * callback's own throw (including the simulator's Rollback) propagates out.
 * `execute` decides what the statement does; `countsBefore`/`countsAfter` what
 * the count query sees on each side of it.
 */
function buildClient(opts: {
  execute: () => Promise<number>;
  countsBefore?: RawCount[];
  countsAfter?: RawCount[];
}): { client: SimulationClient; calls: string[] } {
  const calls: string[] = [];
  let executed = false;
  const tx: SimulationTx = {
    $queryRawUnsafe: async (sql) => {
      calls.push(executed ? 'count:after' : 'count:before');
      expect(sql).toContain('information_schema.tables');
      return executed ? (opts.countsAfter ?? FULL_VAULT) : (opts.countsBefore ?? FULL_VAULT);
    },
    $executeRawUnsafe: async () => {
      calls.push('execute');
      const affected = await opts.execute();
      executed = true;
      return affected;
    },
  };
  const client: SimulationClient = {
    $transaction: (fn) => fn(tx),
  };
  return { client, calls };
}

describe('simulateStatement', () => {
  // "Could not count" and "counted zero" license opposite decisions — the same
  // distinction as CHAIN_UNAVAILABLE vs registered:false in check_on_chain_status.
  // The under-reporting case comes first because it is the one that matters:
  // a NULL before-count coerced to 0 turns real destruction into "rows gained".
  it('refuses a verdict when a BEFORE count is null — never reports rows gained or LOW RISK', async () => {
    const { client } = buildClient({
      execute: async () => 9,
      countsBefore: [
        { table: 'Evidence', rows: null },
        { table: 'Researcher', rows: 2 },
      ],
      countsAfter: [
        { table: 'Evidence', rows: 0 },
        { table: 'Researcher', rows: 2 },
      ],
    });

    const outcome = await simulateStatement(client, 'a statement that empties Evidence');

    expect(outcome).toEqual({
      kind: 'uncountable',
      before: ['Evidence'],
      after: [],
    });
  });

  it('refuses a verdict when an AFTER count is null — never reports it as rows lost', async () => {
    const { client } = buildClient({
      execute: async () => 0,
      countsAfter: [
        { table: 'Evidence', rows: null },
        { table: 'Researcher', rows: 2 },
        { table: 'Thesis', rows: 0 },
      ],
    });

    const outcome = await simulateStatement(client, 'SELECT 1');

    expect(outcome).toEqual({
      kind: 'uncountable',
      before: [],
      after: ['Evidence'],
    });
  });

  it('reads a genuine zero-row table as zero, with no refusal', async () => {
    const { client } = buildClient({ execute: async () => 0 });

    const outcome = await simulateStatement(client, 'SELECT 1');

    expect(outcome.kind).toBe('measured');
  });

  it('measures a statement that runs and removes nothing, and always rolls back', async () => {
    const { client, calls } = buildClient({ execute: async () => 0 });

    const outcome = await simulateStatement(client, 'SELECT 1');

    expect(outcome).toEqual({
      kind: 'measured',
      affected: 0,
      losses: [],
      totalLost: 0,
      droppedTables: [],
    });
    expect(calls).toEqual(['count:before', 'execute', 'count:after']);
  });

  it('reports a measured loss, including a table that ceased to exist', async () => {
    const { client } = buildClient({
      execute: async () => 4,
      countsAfter: [
        { table: 'Evidence', rows: 5 },
        { table: 'Thesis', rows: 0 },
      ],
    });

    const outcome = await simulateStatement(client, 'a destructive statement');

    expect(outcome).toMatchObject({
      kind: 'measured',
      affected: 4,
      totalLost: 6,
      droppedTables: ['Researcher'],
    });
    if (outcome.kind !== 'measured') throw new Error('expected a measurement');
    expect(outcome.losses).toEqual([
      { table: 'Evidence', before: 9, after: 5, dropped: false, lost: 4 },
      { table: 'Researcher', before: 2, after: undefined, dropped: true, lost: 2 },
    ]);
  });

  it('refuses a multi-statement input as NOT SIMULATED rather than as a loss', async () => {
    const { client, calls } = buildClient({
      execute: async () => {
        throw prismaRawError(
          '42601',
          'ERROR: cannot insert multiple commands into a prepared statement',
        );
      },
    });

    const outcome = await simulateStatement(client, 'SELECT 1; SELECT 2');

    expect(outcome).toEqual({ kind: 'multi-statement' });
    // The after-count was never taken — and must not be needed to say so.
    expect(calls).toEqual(['count:before', 'execute']);
  });

  it('reports any other failure with the server message, never as a loss', async () => {
    const { client } = buildClient({
      execute: async () => {
        throw prismaRawError('42P01', 'ERROR: relation "NoSuchTable" does not exist');
      },
    });

    const outcome = await simulateStatement(client, 'SELECT * FROM "NoSuchTable"');

    expect(outcome).toEqual({
      kind: 'failed',
      reason: 'ERROR: relation "NoSuchTable" does not exist',
    });
  });

  it('reports a failure whose message has no usable first line as a failure', async () => {
    const { client } = buildClient({
      execute: async () => {
        throw new Error('\n\n');
      },
    });

    const outcome = await simulateStatement(client, 'whatever');

    expect(outcome).toEqual({ kind: 'failed', reason: 'Error' });
  });

  it('never computes a loss when the transaction ends without a measurement', async () => {
    // A client that swallows the callback's throw would leave the simulator
    // with a before-count and no after-count — exactly the 2026-08-23 shape.
    const client: SimulationClient = {
      $transaction: async (fn) => {
        const tx: SimulationTx = {
          $queryRawUnsafe: async () => FULL_VAULT,
          $executeRawUnsafe: async () => {
            throw new Error('');
          },
        };
        try {
          return await fn(tx);
        } catch {
          return undefined as never;
        }
      },
    };

    const outcome = await simulateStatement(client, 'whatever');

    expect(outcome.kind).toBe('failed');
  });
});

describe('measureLoss', () => {
  it('treats an absent table as dropped with every row lost, and ignores growth', () => {
    expect(
      measureLoss(FULL_VAULT, [
        { table: 'Evidence', rows: 12 },
        { table: 'Thesis', rows: 0 },
      ]),
    ).toEqual([{ table: 'Researcher', before: 2, after: undefined, dropped: true, lost: 2 }]);
  });
});

describe('describeFailure', () => {
  it('prefers the server message Prisma carries in meta', () => {
    expect(describeFailure(prismaRawError('42601', 'ERROR: syntax error at or near "FRM"'))).toBe(
      'ERROR: syntax error at or near "FRM"',
    );
  });

  it('skips leading blank lines — the gap the original first-line split fell through', () => {
    expect(describeFailure(new Error('\nInvalid invocation:\n\nsomething real'))).toBe(
      'Invalid invocation:',
    );
  });

  it('is never empty', () => {
    expect(describeFailure(new Error(''))).toBe('Error');
    expect(describeFailure('')).toBe('unknown error');
    expect(describeFailure(null)).toBe('null');
  });
});
