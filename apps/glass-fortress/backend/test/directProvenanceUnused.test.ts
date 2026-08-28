import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// NOTHING WRITES A `DIRECT` CAPTURE, AND UNTIL SAVE PAGE NOW EXISTS IT MUST NOT.
//
// §2 defines DIRECT as "we fetched it and the Archive has not (yet) indexed it" —
// a TRANSIENT precursor, or permanent only for a page the Archive genuinely
// cannot take. Both readings require that archiving was ATTEMPTED.
//
// Save Page Now does not exist yet, so an attempt is not achievable. Writing a
// DIRECT capture when CDX returns zero rows would therefore mean "we did not
// ask", wearing the label that says "archiving is impossible" — a provenance
// asserting an attempt that never happened, on the axis a reader uses to judge
// whether a stranger can re-check the evidence.
//
// So a zero-row CDX answer REFUSES the submission. The refusal is not silent: the
// `CdxQuery` row with `rowCount: 0` is its record, written by Phase A precisely
// so that "the Archive holds none" is an observation rather than an inference.
//
// WHY A SOURCE SCAN. The rule is about code that does not exist yet. No behaviour
// test can cover a writer nobody has written; this fails the moment one appears,
// which is the point at which the SPN question has to be answered rather than
// worked around.
//
// rtmag's existing capture is grandfathered — it predates this and already
// carries `independentlyRecheckable: false` through the list_captures partition.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/**
 * Files legitimately naming DIRECT without writing one.
 *
 * EMPTY, and measured rather than assumed: `archivedCaptures.ts` scopes on
 * WAYBACK, so it never names DIRECT at all. The value is one to add to
 * deliberately, not a placeholder — a file appearing here should be a decision.
 */
const DECLARATIONS_AND_SCOPES: string[] = [];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Files that name DIRECT in CODE, comments stripped. */
function directMentions(): string[] {
  return tsFiles(SRC)
    .filter((file) => {
      const code = readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => {
          const t = l.trimStart();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
      return /CaptureProvenance\.DIRECT|provenance:\s*['"]DIRECT['"]/.test(code);
    })
    .map((f) => f.slice(SRC.length + 1));
}

describe('CaptureProvenance.DIRECT has no writers', () => {
  const mentions = directMentions();

  it('finds the capture write path at all — a silent zero would make this vacuous', () => {
    // The scan below proves an ABSENCE, and an absence is exactly what a broken
    // pattern also produces. Anchor it on something that must be present: the one
    // write path, naming the enum it does write.
    const recordCapture = readFileSync(join(SRC, 'services', 'recordCapture.ts'), 'utf8');
    expect(recordCapture).toContain('CaptureProvenance.WAYBACK');
  });

  it('is named nowhere in src — no writer, and no reader assuming one', () => {
    expect(mentions).toEqual(DECLARATIONS_AND_SCOPES);
  });

  it('detects a DIRECT writer when one exists — proving the scan is not vacuous', () => {
    // The assertion above proves an ABSENCE, and a broken pattern produces the
    // same result. This exercises the matcher against the exact shapes a writer
    // would use, so "no writers" means the scan looked rather than that it failed.
    const asEnum = 'provenance: CaptureProvenance.DIRECT,';
    const asLiteral = "provenance: 'DIRECT',";
    const pattern = /CaptureProvenance\.DIRECT|provenance:\s*['"]DIRECT['"]/;
    expect(pattern.test(asEnum)).toBe(true);
    expect(pattern.test(asLiteral)).toBe(true);
    expect(pattern.test('provenance: CaptureProvenance.WAYBACK,')).toBe(false);
  });
});
