/**
 * dbSimulation — run a statement for real inside a transaction, measure what it
 * destroys, roll it back. The CLI in scripts/dbSimulate.ts is a thin wrapper.
 *
 * The outcome is a discriminated union, deliberately. The 2026-08-23 false
 * alarm (an additive migration script reported as "533 rows lost, every table
 * dropped") happened because failure was signalled by a string that could be
 * empty: Prisma's error message begins with a newline, so its "first line" was
 * '', the failure branch was skipped, and a never-populated after-count was
 * read as "every table ceased to exist". A simulator that cries wolf on a typo
 * is ignored when it matters, so "measured" and "failed" are now different
 * shapes, and a loss can only be reported from the measured one.
 */

export interface TableCount {
  table: string;
  rows: number;
}

export interface TableLoss {
  table: string;
  before: number;
  /** undefined when the table no longer exists afterwards. */
  after: number | undefined;
  dropped: boolean;
  lost: number;
}

export type SimulationOutcome =
  | {
      kind: 'measured';
      affected: number;
      losses: TableLoss[];
      totalLost: number;
      droppedTables: string[];
    }
  | {
      /**
       * At least one table's row count could not be taken, on the named side(s).
       * No verdict is possible: a NULL before-count coerced to 0 would report
       * real destruction as rows gained, and a NULL after-count as rows lost.
       * "Could not measure" and "measured zero" license opposite decisions.
       */
      kind: 'uncountable';
      before: string[];
      after: string[];
    }
  | {
      /**
       * PostgreSQL refused the input as more than one command. Prisma sends
       * raw SQL through the prepared-statement protocol, which accepts exactly
       * one command per string — so nothing ran and nothing was measured.
       */
      kind: 'multi-statement';
    }
  | { kind: 'failed'; reason: string };

export interface SimulationTx {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
  $executeRawUnsafe: (sql: string) => Promise<number>;
}

export interface SimulationClient {
  $transaction: <T>(fn: (tx: SimulationTx) => Promise<T>) => Promise<T>;
}

/** Thrown to force the transaction to roll back. Never escapes this module. */
class Rollback extends Error {}

/** Every table in `public`, split into those that could be counted and those that could not. */
export interface TableCensus {
  counts: TableCount[];
  uncountable: string[];
}

/**
 * Row counts for every table in `public`, in one round trip. query_to_xml is
 * the standard trick for counting dynamically-named tables without issuing a
 * statement per table — it matters here because this runs twice inside the
 * transaction and must not itself become the slow part.
 *
 * A NULL count is reported as uncountable, never as zero. count(*) always
 * yields a row, so a NULL here means the count was not taken, and a simulator
 * that renders "not taken" as 0 can under-report destruction.
 */
export async function countAllTables(tx: SimulationTx): Promise<TableCensus> {
  const rows = (await tx.$queryRawUnsafe(`
    SELECT table_name AS table,
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM %I.%I', 'public', table_name),
                               false, true, '')))[1]::text::int AS rows
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)) as Array<{ table: string; rows: unknown }>;

  const census: TableCensus = { counts: [], uncountable: [] };
  for (const r of rows) {
    const n = typeof r.rows === 'number' ? r.rows : r.rows === null ? NaN : Number(r.rows);
    if (Number.isInteger(n)) {
      census.counts.push({ table: r.table, rows: n });
    } else {
      census.uncountable.push(r.table);
    }
  }
  return census;
}

export function measureLoss(before: TableCount[], after: TableCount[]): TableLoss[] {
  const afterByTable = new Map(after.map((t) => [t.table, t.rows]));
  return before
    .map((b) => {
      const afterRows = afterByTable.get(b.table);
      // A table absent afterwards was dropped — every row is gone, not zero rows changed.
      const dropped = afterRows === undefined;
      return {
        table: b.table,
        before: b.rows,
        after: afterRows,
        dropped,
        lost: dropped ? b.rows : Math.max(0, b.rows - afterRows),
      };
    })
    .filter((r) => r.lost > 0 || r.dropped);
}

/** PostgreSQL's SQLSTATE for "cannot insert multiple commands into a prepared statement". */
const SYNTAX_ERROR_SQLSTATE = '42601';
const MULTIPLE_COMMANDS = /multiple commands/i;

/**
 * Reads the driver-level error Prisma wraps in P2010. Checked structurally
 * (SQLSTATE + the server's own text) rather than by parsing the SQL ourselves:
 * a semicolon inside a string literal is one command, and only the server is
 * authoritative on where a command ends.
 */
function isMultipleCommandsError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return false;
  const { code, message } = meta as { code?: unknown; message?: unknown };
  return code === SYNTAX_ERROR_SQLSTATE && typeof message === 'string' && MULTIPLE_COMMANDS.test(message);
}

/**
 * Always a non-empty, single-line description — the guarantee the previous
 * `message.split('\n')[0]` did not give. Prefers the server's own message when
 * Prisma carries one, because that is the line a person can act on.
 */
export function describeFailure(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const meta = (err as { meta?: { message?: unknown } }).meta;
    if (meta && typeof meta.message === 'string' && meta.message.trim()) {
      return meta.message.trim();
    }
  }
  const text = err instanceof Error ? err.message : String(err);
  const firstLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine ?? (err instanceof Error ? err.name : 'unknown error');
}

interface Measurement {
  before: TableCensus;
  affected: number;
  after: TableCensus;
}

export async function simulateStatement(
  client: SimulationClient,
  sql: string,
): Promise<SimulationOutcome> {
  const taken: { measurement?: Measurement } = {};

  try {
    await client.$transaction(async (tx) => {
      const before = await countAllTables(tx);
      const affected = await tx.$executeRawUnsafe(sql);
      const after = await countAllTables(tx);
      taken.measurement = { before, affected, after };
      // Everything above really ran. This is what un-runs it.
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) {
      return isMultipleCommandsError(err)
        ? { kind: 'multi-statement' }
        : { kind: 'failed', reason: describeFailure(err) };
    }
  }

  // Rollback is only thrown after the measurement is taken, so this branch is
  // unreachable through this module's own code. It exists because a loss must
  // never be computed from counts that were not taken — the exact mistake that
  // produced the 2026-08-23 false alarm.
  if (!taken.measurement) {
    return { kind: 'failed', reason: 'transaction ended without taking measurements' };
  }
  const { before, affected, after } = taken.measurement;
  if (before.uncountable.length > 0 || after.uncountable.length > 0) {
    return { kind: 'uncountable', before: before.uncountable, after: after.uncountable };
  }
  const losses = measureLoss(before.counts, after.counts);
  return {
    kind: 'measured',
    affected,
    losses,
    totalLost: losses.reduce((sum, r) => sum + r.lost, 0),
    droppedTables: losses.filter((r) => r.dropped).map((r) => r.table),
  };
}
