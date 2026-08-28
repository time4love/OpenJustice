import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// AN UNCHANGED CAPTURE GETS NO DIFF — AT EVERY SITE THAT WRITES ONE.
//
// FOUND BY REAL MATERIAL, not by a test. The rtmag scan on staging wrote a row
// whose `beforeSnapshotId` and `afterSnapshotId` were the same capture: dates
// said 2022-10-11 -> 2022-10-17, the FKs said one snapshot. 1939 tests and 26
// killed mutations did not catch it.
//
// THE CAUSE. `recordCapture` does not store a capture text-identical to its
// predecessor — that novelty rule is correct and preserves same-day revert
// material — and on that outcome it returns THE PREDECESSOR'S id. The scraper
// already documents this at the CDX-linking site ("DO NOT LINK ON AN UNCHANGED
// OUTCOME"), and the diff paths resolved `stored?.id` on both sides without ever
// asking. `recordArchivedCapture` had consumed the outcome and discarded it, so
// the diff paths could not have honoured a distinction their input did not carry.
//
// WHY A SOURCE SCAN. There are TWO diff-creation sites in this file — the direct
// `analyzePageHistory` path and the resumable job loop — and they had the same
// omission. One rule, two implementations, is this repository's dominant defect
// shape; a behaviour test covers only the path someone thought of, and a third
// site added tomorrow is covered by nothing.
// ---------------------------------------------------------------------------

const SCRAPER = join(__dirname, '..', 'src', 'services', 'WaybackScraper.ts');
const source = readFileSync(SCRAPER, 'utf8');

/** Code only — a rule satisfied by a comment mentioning it is not a rule. */
const code = source
  .split('\n')
  .filter((line) => {
    const t = line.trimStart();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('every diff-creation site skips an UNCHANGED capture', () => {
  const recordDiffCalls = code.match(/await recordDiff\(/g) ?? [];
  const unchangedGuards = code.match(/\.outcome === 'UNCHANGED'/g) ?? [];

  it('still writes diffs from this file — a silent zero would make this vacuous', () => {
    expect(recordDiffCalls.length).toBeGreaterThan(0);
  });

  it('guards the outcome in both diff paths, and in the CDX linker', () => {
    // Three: the CDX link that already existed, plus one per diff site. If a
    // fourth diff path appears without a guard this count no longer matches.
    expect(unchangedGuards.length).toBe(3);
  });

  it('carries the outcome out of recordArchivedCapture at all', () => {
    // The root cause was that it did not. A guard cannot fire on a field the
    // caller never receives.
    expect(code).toMatch(/outcome: recorded\.outcome/);
    expect(code).toMatch(/interface StoredCapture/);
  });

  it('derives from the OUTCOME, never from id equality, in the scan paths', () => {
    // Equality is the symptom. Skipping on it here would silently swallow a
    // future bug that produced equal ids for a different reason — recordDiff
    // throws on that case instead, so the two guards catch different things.
    expect(code).not.toMatch(/beforeSnapshotId === afterSnapshotId/);
  });

  it('the job loop uses a BRANCH, not an early continue', () => {
    // Continuing there would skip the loop tail — `processedCount++` and the job
    // progress write — so a capture would be fetched while the job reported no
    // progress for it. The same defect was found and fixed once already.
    const jobGuard = code.indexOf("currentSnapshot.outcome === 'UNCHANGED'");
    expect(jobGuard).toBeGreaterThan(-1);
    const branch = code.slice(jobGuard, code.indexOf('} else if', jobGuard + 1));
    expect(branch).not.toContain('continue;');
  });
});
