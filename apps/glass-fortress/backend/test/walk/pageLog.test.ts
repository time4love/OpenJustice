import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { appendDecisions, StaleSequenceError, type DecisionEntry } from '../../src/walk/pageLog';
import { T14 } from './fixtures';
import { BACKEND, WALK, tsFiles, readCode, balanced, codeOf } from './scan';

// ---------------------------------------------------------------------------
// A7 — CONCURRENCY AND ATTRIBUTION. "Every write tool is one transaction. The
// page's decision sequence is the compare-and-set: a write that finds the
// sequence moved REFUSES with STALE_SEQUENCE and the researcher re-reads. Two
// researchers on one page serialise on it; nothing else is locked. Every
// decision carries the researcher who made it."
//
// The tool files assert one transaction and STALE_SEQUENCE at each tool's
// surface. This file holds the MECHANISM they share, once: the page-log
// writer — the legacy `sequencedWrite` and `appendCalibrationDecision`
// re-homed from the run to the page (as-built map, "the log", TRANSFORM) —
// and A2's REQUIRED fields as loud guards. One rule, one implementation; the
// source scans at the end hold that it stays one.
//
//   appendDecisions(tx, trackedUrlId, entries)
//     reads the page's last sequence inside the CALLER's transaction, numbers
//     the entries contiguously after it, inserts them, and throws
//     StaleSequenceError when the unique index on (trackedUrlId, sequence)
//     rejects the write. Every tool maps that one error to STALE_SEQUENCE.
//
// RED until step 3 builds `src/walk/pageLog`.
// ---------------------------------------------------------------------------

const TRACKED = 'page-1';
const RESEARCHER = 'researcher-1';

function fakeTx(lastSequence: number | null) {
  const pageDecision = {
    findFirst: jest.fn(async () => (lastSequence === null ? null : { sequence: lastSequence })),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `d${String(data['sequence'])}`, ...data })),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  return { pageDecision };
}
type Tx = ReturnType<typeof fakeTx>;

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`trackedUrlId`,`sequence`)', {
    code: 'P2002',
    clientVersion: 'test',
  });

const accepted = (extra: Partial<DecisionEntry> = {}): DecisionEntry => ({
  type: 'CAPTURE_ACCEPTED',
  researcherId: RESEARCHER,
  waybackTimestamp: T14,
  rulesetId: 'e3b0c442',
  ...extra,
});

const created = (tx: Tx) => tx.pageDecision.create.mock.calls.map(([call]) => call.data);

describe('appendDecisions — the compare-and-set', () => {
  it('numbers entries from the page’s last sequence, contiguously, in the order given', async () => {
    const tx = fakeTx(2);
    const written = await appendDecisions(tx, TRACKED, [
      { type: 'RULESET_CORRECTED', researcherId: RESEARCHER, waybackTimestamp: T14 },
      { type: 'RULE_TRUSTED', researcherId: RESEARCHER, waybackTimestamp: T14, ruleId: 'r1' },
      accepted(),
    ]);
    expect(created(tx).map((d) => d['sequence'])).toEqual([3, 4, 5]);
    expect(created(tx).map((d) => d['type'])).toEqual(['RULESET_CORRECTED', 'RULE_TRUSTED', 'CAPTURE_ACCEPTED']);
    expect(written.map((d: { sequence: number }) => d.sequence)).toEqual([3, 4, 5]);
  });

  it('starts at 1 on a page with no decision', async () => {
    const tx = fakeTx(null);
    await appendDecisions(tx, TRACKED, [accepted()]);
    expect(created(tx).map((d) => d['sequence'])).toEqual([1]);
  });

  it('turns a unique violation on the insert into StaleSequenceError, naming the page and the sequence it expected', async () => {
    const tx = fakeTx(2);
    tx.pageDecision.create.mockRejectedValueOnce(uniqueViolation());
    const attempt = appendDecisions(tx, TRACKED, [accepted()]);
    await expect(attempt).rejects.toBeInstanceOf(StaleSequenceError);
    await expect(attempt).rejects.toThrow(TRACKED);
    await expect(attempt).rejects.toThrow('3');
  });

  it('propagates any other error unchanged — never as a stale sequence', async () => {
    const tx = fakeTx(2);
    const outage = new Error('connection reset');
    tx.pageDecision.create.mockRejectedValueOnce(outage);
    await expect(appendDecisions(tx, TRACKED, [accepted()])).rejects.toBe(outage);
  });

  // TWO RESEARCHERS ON ONE PAGE. Both read sequence 2; the first insert lands
  // at 3; the second's insert at 3 is rejected by the index, and the writer
  // does not retry — the researcher re-reads, which is A7's whole protocol.
  it('two writers racing for one sequence: the first lands, the second is stale, nothing is retried', async () => {
    const shared = { taken: new Set<number>() };
    const writer = () => {
      const tx = fakeTx(2);
      tx.pageDecision.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const sequence = data['sequence'] as number;
        if (shared.taken.has(sequence)) throw uniqueViolation();
        shared.taken.add(sequence);
        return { id: `d${String(sequence)}`, ...data };
      });
      return tx;
    };
    const first = writer();
    const second = writer();
    await expect(appendDecisions(first, TRACKED, [accepted()])).resolves.toHaveLength(1);
    await expect(appendDecisions(second, TRACKED, [accepted()])).rejects.toBeInstanceOf(StaleSequenceError);
    expect(second.pageDecision.create).toHaveBeenCalledTimes(1);
  });
});

describe('appendDecisions — A2’s REQUIRED fields, as loud guards', () => {
  const complete: Record<DecisionEntry['type'], DecisionEntry> = {
    RULESET_CORRECTED: { type: 'RULESET_CORRECTED', researcherId: RESEARCHER, waybackTimestamp: T14 },
    CAPTURE_ACCEPTED: accepted(),
    CAPTURE_SKIPPED: { type: 'CAPTURE_SKIPPED', researcherId: RESEARCHER, waybackTimestamp: T14, rulesetId: 'e3b0c442', reason: 'truncated' },
    RULE_TRUSTED: { type: 'RULE_TRUSTED', researcherId: RESEARCHER, waybackTimestamp: T14, ruleId: 'r1' },
    RULE_ENDED: { type: 'RULE_ENDED', researcherId: RESEARCHER, waybackTimestamp: T14, ruleId: 'r1' },
    RULE_RETIRED: { type: 'RULE_RETIRED', researcherId: RESEARCHER, waybackTimestamp: T14, ruleId: 'r1' },
    RULE_EXTENDED: { type: 'RULE_EXTENDED', researcherId: RESEARCHER, waybackTimestamp: T14, ruleId: 'r1' },
    RESET: { type: 'RESET', researcherId: RESEARCHER, reason: 'the calibration is garbage' },
  };
  const TYPES = Object.keys(complete) as DecisionEntry['type'][];

  /** The fields A2 requires per type, beyond `type` itself. */
  const required: Record<DecisionEntry['type'], (keyof DecisionEntry)[]> = {
    RULESET_CORRECTED: ['researcherId', 'waybackTimestamp'],
    CAPTURE_ACCEPTED: ['researcherId', 'waybackTimestamp', 'rulesetId'],
    CAPTURE_SKIPPED: ['researcherId', 'waybackTimestamp', 'rulesetId', 'reason'],
    RULE_TRUSTED: ['researcherId', 'waybackTimestamp', 'ruleId'],
    RULE_ENDED: ['researcherId', 'waybackTimestamp', 'ruleId'],
    RULE_RETIRED: ['researcherId', 'waybackTimestamp', 'ruleId'],
    RULE_EXTENDED: ['researcherId', 'waybackTimestamp', 'ruleId'],
    RESET: ['researcherId', 'reason'],
  };

  it('a complete entry of every type is written', async () => {
    for (const type of TYPES) {
      const tx = fakeTx(0);
      await appendDecisions(tx, TRACKED, [complete[type]]);
      expect({ type, written: created(tx).length }).toEqual({ type, written: 1 });
    }
  });

  it('every type throws before writing when a required field is missing, naming the field', async () => {
    for (const type of TYPES) {
      for (const field of required[type]) {
        const tx = fakeTx(0);
        const entry = { ...complete[type] };
        delete entry[field];
        await expect(appendDecisions(tx, TRACKED, [entry])).rejects.toThrow(String(field));
        expect({ type, field, written: created(tx).length }).toEqual({ type, field, written: 0 });
      }
    }
  });

  it('a blank reason counts as missing on CAPTURE_SKIPPED and RESET', async () => {
    for (const type of ['CAPTURE_SKIPPED', 'RESET'] as const) {
      const tx = fakeTx(0);
      await expect(appendDecisions(tx, TRACKED, [{ ...complete[type], reason: '   ' }])).rejects.toThrow('reason');
      expect(created(tx)).toHaveLength(0);
    }
  });

  it('a RESET carries no capture, no rule and no ruleset', async () => {
    const tx = fakeTx(0);
    await appendDecisions(tx, TRACKED, [complete.RESET]);
    const written = created(tx).at(0) ?? {};
    expect(written['waybackTimestamp'] ?? null).toBeNull();
    expect(written['ruleId'] ?? null).toBeNull();
    expect(written['rulesetId'] ?? null).toBeNull();
  });
});

describe('appendDecisions — the writes', () => {
  it('writes every row with the page, its sequence and the entry’s fields', async () => {
    const tx = fakeTx(4);
    await appendDecisions(tx, TRACKED, [accepted({ rulesetId: 'abcd1234' })]);
    expect(created(tx).at(0)).toEqual(
      expect.objectContaining({ trackedUrlId: TRACKED, sequence: 5, type: 'CAPTURE_ACCEPTED', researcherId: RESEARCHER, waybackTimestamp: T14, rulesetId: 'abcd1234' }),
    );
  });

  it('calls nothing on the log but create — never update or delete', async () => {
    const tx = fakeTx(4);
    await appendDecisions(tx, TRACKED, [accepted()]);
    expect(tx.pageDecision.update).not.toHaveBeenCalled();
    expect(tx.pageDecision.updateMany).not.toHaveBeenCalled();
    expect(tx.pageDecision.delete).not.toHaveBeenCalled();
    expect(tx.pageDecision.deleteMany).not.toHaveBeenCalled();
  });
});

describe('one implementation — by source scan', () => {
  const modulesWith = (needle: string | RegExp) =>
    tsFiles(WALK)
      .filter((file) => (typeof needle === 'string' ? readCode(file).includes(needle) : needle.test(readCode(file))))
      .map((file) => file.slice(WALK.length + 1));

  it('pageDecision.create appears in exactly one module under src/walk — the page log', () => {
    expect(modulesWith(/\.pageDecision\.create(?:Many)?\(/)).toEqual(['pageLog.ts']);
  });

  it('the STALE_SEQUENCE code and the P2002 mapping each live in exactly one module', () => {
    expect(modulesWith("'STALE_SEQUENCE'")).toHaveLength(1);
    expect(modulesWith("'P2002'")).toEqual(['pageLog.ts']);
  });

  // Every write handler is one transaction, and nothing writes outside it.
  // RULED 2026-09-05 (Q2 of step 3): the tool surface is a DIRECTORY, one
  // file per tool with an index — landed at step 2 — so the property is held
  // over src/walk/tools/*.ts: five write handlers across the tool files, each
  // write-tool file holding exactly one $transaction, and no file under tools/
  // reaching the database through `prisma.<delegate>.<write>` directly — every
  // write goes through `tx.` inside the callback. RED on the count of five
  // until step 5 lands scan_captures, by construction.
  it('the tool files hold five write handlers, one $transaction each, and no direct prisma write', () => {
    const toolFiles = tsFiles(join(WALK, 'tools')).filter((f) => !f.endsWith('/index.ts'));
    expect(toolFiles.length).toBeGreaterThan(0);
    const handlerOf = (code: string) => code.match(/export async function (\w+Handler)\(/g) ?? [];
    const isWriteHandler = (handler: string) => !/get\w*Handler|list\w*Handler/.test(handler);
    const writeFiles = toolFiles.filter((f) => handlerOf(readCode(f)).some(isWriteHandler));
    const writeHandlers = writeFiles.flatMap((f) => handlerOf(readCode(f)).filter(isWriteHandler));
    expect(writeHandlers).toHaveLength(5);
    for (const file of writeFiles) {
      const transactions = (readCode(file).match(/\$transaction\(/g) ?? []).length;
      expect({ file: file.slice(WALK.length + 1), transactions }).toEqual({ file: file.slice(WALK.length + 1), transactions: 1 });
    }
    for (const file of toolFiles) {
      expect({ file: file.slice(WALK.length + 1), direct: readCode(file).match(/\bprisma\.\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/) }).toEqual({
        file: file.slice(WALK.length + 1),
        direct: null,
      });
    }
  });

  it('DETECTS a direct write and a second create site — proven against decoys', () => {
    expect(/\bprisma\.\w+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(`await prisma.rule.update({ where, data })`)).toBe(true);
    expect(/\.pageDecision\.create(?:Many)?\(/.test(codeOf(`await tx.pageDecision.create({ data }); // pageDecision.create( in a comment`))).toBe(true);
    expect(/\.pageDecision\.create(?:Many)?\(/.test(codeOf(`// await tx.pageDecision.create({ data })`))).toBe(false);
  });

  // The compare-and-set IS the index. Red until step 1's migration.
  it('the schema declares the unique index on (trackedUrlId, sequence) for PageDecision', () => {
    const schema = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');
    const start = schema.indexOf('model PageDecision ');
    expect(start).toBeGreaterThan(-1);
    const block = start > -1 ? balanced(schema, schema.indexOf('{', start)) : '';
    expect(block.replace(/\s+/g, '')).toContain('@@unique([trackedUrlId,sequence])');
  });
});
