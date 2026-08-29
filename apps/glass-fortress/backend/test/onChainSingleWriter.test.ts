import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// LEVEL 3a — EVERY PATH THAT ANCHORS ALSO CHECKS, AND CHECKS IN ONE PLACE.
//
// Two source-level rules, both of which a behaviour test cannot hold:
//
//   1. An IntegrityCheck row is written by ONE module. A second writer would be
//      a second definition of what a verdict commits to, and the two would
//      drift — the shape that gave this repository eight diff writers, five
//      copies of the evidence-visibility rule and three of the MCP tool
//      classification.
//
//   2. Every module that registers a hash on-chain records a check. This is the
//      rule the first draft of Level 3a broke: two promotion services were
//      wired and two further anchoring paths — the /confirm route and the
//      rehash tool — were not, so the level would have shipped with the same
//      "one rule, an implementation that opted out" hole it was closing.
//
// A behaviour test covers the paths someone thought of. A fifth anchoring path
// added tomorrow is covered by nothing; this fails the moment one appears.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/** The one module permitted to write an IntegrityCheck row. */
const CHECK_WRITER = 'services/onChainVerification.ts';

/**
 * Modules that send a registration to the EvidenceRegistry, and are therefore
 * required to record a check.
 *
 * `evidenceOnChain.ts` is the shared registration helper and is deliberately
 * absent from the required set: it registers on behalf of a caller and does not
 * know which subject the registration belongs to, so the check belongs to the
 * caller. Listing it here would push the subject identity into a function that
 * has no business knowing it.
 */
const REGISTRATION_HELPER = 'services/evidenceOnChain.ts';

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Source with comment lines removed, so prose about a rule is not the rule. */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

function filesMatching(pattern: RegExp): string[] {
  return tsFiles(SRC)
    .filter((file) => pattern.test(codeOf(file)))
    .map((f) => f.slice(SRC.length + 1));
}

describe('an integrity check is written in one place', () => {
  it('only onChainVerification.ts creates an IntegrityCheck row', () => {
    expect(filesMatching(/prisma\.integrityCheck\.(create|createMany|upsert)\s*\(/)).toEqual([
      CHECK_WRITER,
    ]);
  });

  it('nothing updates or deletes one — the table is append-only', () => {
    // History across re-checks is the reason the plan chose a table over
    // columns. Overwriting the last verdict would destroy the only record that
    // the answer ever changed, which on this level is the record that an anchor
    // stopped verifying.
    expect(filesMatching(/prisma\.integrityCheck\.(update|updateMany|delete|deleteMany)\s*\(/))
      .toEqual([]);
  });
});

describe('every anchoring path records a check', () => {
  it('has at least one registering module, so this suite is not vacuous', () => {
    // VACUITY GUARD. If the registration call is ever renamed, the pattern below
    // matches nothing and every assertion in this block passes by describing an
    // empty set — a green suite proving the opposite of what it claims.
    expect(filesMatching(/\.registerEvidenceHash\s*\(/).length).toBeGreaterThan(0);
  });

  it('records a check wherever it registers', () => {
    const registers = filesMatching(/\.registerEvidenceHash\s*\(/).filter(
      (f) => f !== REGISTRATION_HELPER,
    );
    const records = new Set(filesMatching(/recordOnChainCheck(NeverThrowing)?\s*\(/));

    const missing = registers.filter((f) => !records.has(f));
    expect(missing).toEqual([]);
  });

  it('records a check wherever it calls the shared registration helper', () => {
    // The helper's callers are anchoring paths too — they simply anchor through
    // one function rather than reaching for the contract themselves.
    const callers = filesMatching(/registerEvidenceOnChain\s*\(/).filter(
      (f) => f !== REGISTRATION_HELPER,
    );
    expect(callers.length).toBeGreaterThan(0);

    const records = new Set(filesMatching(/recordOnChainCheck(NeverThrowing)?\s*\(/));
    expect(callers.filter((f) => !records.has(f))).toEqual([]);
  });
});
