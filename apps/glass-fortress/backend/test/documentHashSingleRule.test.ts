import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// ONE RULE, ONE IMPLEMENTATION: every write to `documentHash` is sha256Bytes.
//
// `documentHash` has four writers — recordCapture, reconcileAgainstCdx,
// rehashDocuments and backfillDocumentBytes. Three of them were right and the
// fourth wrote `cdxDigestOf(payload)`, base32(SHA-1), into a column schema.prisma
// defines as SHA-256 and Level 3 will anchor. It ran on every write action rather
// than only on a repair, so it corrupted all 83 captures in BOTH environments.
//
// It survived because the wrong function had less friction than the right one:
// cdxDigestOf was already in scope from a neighbouring import, sha256Bytes was
// not imported at all.
//
// WHY A SOURCE SCAN AND NOT A BEHAVIOUR TEST. Behaviour tests already covered
// that writer — and one of them ASSERTED the defect, because it checked
// membership in the parameter bag rather than binding a value to a column name.
// A behaviour test can only cover writers someone thought to write a test for; a
// fifth writer added tomorrow is covered by nothing. The runtime guard
// (verifyAgainstCdx's internal axis) catches it too, but only AFTER the data is
// written and only when somebody runs the verifier. This catches it at build.
//
// Precedent in this codebase: mcpToolClassification.test.ts parses mcpServer.ts
// to assert every registered tool is classified.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** The substring from `open` to its matching close brace. */
function balanced(source: string, from: number): string {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  return source.slice(from);
}

/**
 * The regions of a file that WRITE columns, as opposed to reading or filtering
 * them: a Prisma `data: { … }` payload, and the SET clause of a raw UPDATE.
 *
 * Scoping to these is what keeps `where: { documentHash: … }` — the
 * never-silently-overwrite guard in rehashDocuments, which deliberately carries
 * the STALE value — from being read as a write and failing this test wrongly.
 */
function writeRegions(source: string): string[] {
  const regions: string[] = [];
  for (const match of source.matchAll(/\bdata:\s*\{/g)) {
    regions.push(balanced(source, match.index + match[0].length - 1));
  }
  for (const match of source.matchAll(/\bSET\b([\s\S]*?)\bWHERE\b/g)) {
    if (match[1] !== undefined) regions.push(match[1]);
  }
  return regions;
}

/** Every expression assigned to `documentHash` inside a write region. */
function documentHashWrites(source: string): string[] {
  const written: string[] = [];
  for (const region of writeRegions(source)) {
    // Raw SQL:            "documentHash" = ${expr}
    for (const m of region.matchAll(/"documentHash"\s*=\s*\$\{([^}]+)\}/g)) {
      if (m[1] !== undefined) written.push(m[1].trim());
    }
    // Object property:    documentHash: expr
    for (const m of region.matchAll(/(?<!")\bdocumentHash:\s*([^,\n}]+)/g)) {
      if (m[1] !== undefined) written.push(m[1].trim());
    }
    // Object shorthand:   documentHash,
    for (const m of region.matchAll(/(?<!["\w.])documentHash\s*,/g)) {
      if (m[0] !== undefined) written.push('documentHash');
    }
  }
  return written;
}

/**
 * Does this expression compute SHA-256 of the payload?
 *
 * Resolves one level of indirection: three of the four writers bind the hash to
 * a local const and write the identifier, so checking the expression alone would
 * pass them vacuously.
 */
function isSha256Bytes(expression: string, source: string): boolean {
  if (expression.includes('sha256Bytes(')) return true;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(expression)) return false;
  const binding = new RegExp(`\\bconst\\s+${expression}\\s*=\\s*([^;\\n]+)`).exec(source);
  return binding?.[1]?.includes('sha256Bytes(') ?? false;
}

describe('every write to documentHash routes through sha256Bytes', () => {
  const writers = tsFiles(SRC)
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .map(({ file, source }) => ({ file, source, writes: documentHashWrites(source) }))
    .filter((w) => w.writes.length > 0);

  it('finds the writers at all — a silent zero would make this vacuous', () => {
    // Four are known. Fewer means the patterns above stopped matching, which
    // would turn every assertion below into a pass that proves nothing.
    expect(writers.length).toBeGreaterThanOrEqual(4);
  });

  it.each(
    writers.flatMap((w) =>
      w.writes.map((expression) => ({
        name: `${w.file.slice(SRC.length + 1)} <- ${expression}`,
        expression,
        source: w.source,
      })),
    ),
  )('$name', ({ expression, source }) => {
    expect(isSha256Bytes(expression, source)).toBe(true);
  });
});
