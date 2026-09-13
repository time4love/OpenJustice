import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SRC, tsFiles, readCode } from './walk/scan';

// ---------------------------------------------------------------------------
// A PRISMA WRITE MAY NAME ONLY COLUMNS THE SCHEMA HAS.
//
// TypeScript does not hold this. Measured 2026-09-12, not assumed: adding
// `zzzBogusField: 1` to `urlVersionDiff.upsert`'s `create` payload compiled
// clean under `tsc --noEmit`. Prisma's `SelectSubset` constrains the TOP-LEVEL
// argument keys (where / create / update / select); the payload nested inside
// `create` is inferred FROM the literal, so an unknown column is not an excess
// property against anything — there is nothing to be excess to.
//
// WHAT THAT COST. Evidence step 11b dropped `beforeDate`, `afterDate` and
// `snapshotUrl` from `UrlVersionDiff` on 2026-09-08; `recordDiff` went on
// writing all three. `tsc`, 1,526 unit tests and CI stayed green for four days,
// because the write site is reached ONLY by an acquisition that has a
// PREDECESSOR — walla's diffs predate the migration and rtmag holds one capture.
// The first walk to acquire a second capture on a page threw
// `Unknown argument 'beforeDate'` against staging, mid-flow, after the snapshot
// was stored and anchored on chain and before the diff was written.
//
// CLAUDE.md names this exact class first — "schema fields being dropped" — and
// asks for a guard rather than a fix for the symptom. This is the guard.
//
// WHAT IT COVERS, stated so nobody trusts it further than it goes: the top-level
// keys of a `data:` / `create:` / `update:` payload on `.create()`, `.upsert()`
// and `.update()`, for models it can resolve. It skips spreads and computed
// keys, which it cannot resolve, and it does not descend into nested writes.
// Code only, and it carries a DECOY.
// ---------------------------------------------------------------------------

const SCHEMA = join(SRC, '..', 'prisma', 'schema.prisma');

/** Every model's field names, keyed by the delegate name Prisma Client exposes. */
function modelFields(schema: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const models = schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);
  for (const [, name, body] of models) {
    if (name === undefined || body === undefined) continue;
    const fields = new Set<string>();
    for (const line of body.split('\n')) {
      const bare = line.replace(/\/\/.*$/, '').replace(/\/\/\/.*$/, '').trim();
      if (bare === '' || bare.startsWith('@@')) continue;
      const field = /^(\w+)\s+\S/.exec(bare);
      if (field?.[1] !== undefined) fields.add(field[1]);
    }
    out.set(`${name.charAt(0).toLowerCase()}${name.slice(1)}`, fields);
  }
  return out;
}

/** The substring from `open` to its matching `}`, or null when unbalanced. */
function block(code: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return null;
}

/** Top-level `key:` and shorthand `key,` names of an object body. */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === '' || trimmed.startsWith('...')) continue;
    const named = /^(\w+)\s*:/.exec(trimmed) ?? /^(\w+)$/.exec(trimmed);
    if (named?.[1] !== undefined) keys.push(named[1]);
  }
  return keys;
}

/** Every unknown column a file's Prisma writes name, as `delegate.field`. */
export function unknownColumns(code: string, fields: Map<string, Set<string>>): string[] {
  const bad: string[] = [];
  for (const call of code.matchAll(/\.(\w+)\.(create|upsert|update)\s*\(\s*\{/g)) {
    const delegate = call[1];
    if (delegate === undefined) continue;
    const known = fields.get(delegate);
    if (known === undefined) continue;
    const argsAt = code.indexOf('{', call.index + call[0].length - 1);
    const args = block(code, argsAt);
    if (args === null) continue;
    for (const payload of args.matchAll(/\b(data|create|update)\s*:\s*\{/g)) {
      const at = args.indexOf('{', payload.index + payload[0].length - 1);
      const body = block(args, at);
      if (body === null) continue;
      for (const key of topLevelKeys(body)) {
        if (!known.has(key)) bad.push(`${delegate}.${key}`);
      }
    }
  }
  return bad;
}

describe('a Prisma write names only columns the schema has', () => {
  const fields = modelFields(readFileSync(SCHEMA, 'utf8'));

  it('parsed the schema at all — the vacuity check', () => {
    expect(fields.get('urlVersionDiff')).toBeDefined();
    expect(fields.get('urlVersionDiff')?.has('beforeSnapshotId')).toBe(true);
    expect(fields.get('urlVersionDiff')?.has('beforeDate')).toBe(false);
  });

  it('holds across every module under src/', () => {
    const offenders = tsFiles(SRC)
      .map((file) => ({ file: relative(SRC, file), bad: unknownColumns(readCode(file), fields) }))
      .filter(({ bad }) => bad.length > 0);

    expect(offenders).toEqual([]);
  });

  it('catches the column that was dropped and still written — the decoy', () => {
    const decoy = `await client.urlVersionDiff.upsert({
      where: { x },
      create: { trackedUrlId, beforeSnapshotId, afterSnapshotId, beforeDate: a, afterDate: b },
      update: {},
    });`;
    expect(unknownColumns(decoy, fields)).toEqual(['urlVersionDiff.beforeDate', 'urlVersionDiff.afterDate']);
  });

  it('does not fire on a payload that is entirely legitimate', () => {
    const good = `await client.urlVersionDiff.upsert({
      where: { x },
      create: { trackedUrlId, beforeSnapshotId, afterSnapshotId },
      update: {},
    });`;
    expect(unknownColumns(good, fields)).toEqual([]);
  });
});
