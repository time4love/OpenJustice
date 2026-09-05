import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// ONE ADMISSION PATH. A URL enters the corpus through admitUrl or not at all.
//
// The mission gate was built on POST /api/forensics/scan and nowhere else, while
// FOUR code paths could create a TrackedUrl:
//
//   forensicsRoutes POST /scan          gated
//   forensicsRoutes GET  /wayback       NOT gated (via analyzePageHistory)
//   MCP start_forensic_scan             NOT gated
//   MCP enrich_evidence_with_history    NOT gated
//
// So the admission check existed on the path THE WEBSITE uses and not on the
// paths THE RESEARCHER uses. The gate was the exception rather than the rule, and
// the ungated majority is the interface the investigation is actually conducted
// through — a control present in REST and absent from MCP, which is as broken as
// a capability present in REST and absent from MCP, and harder to notice because
// nothing fails.
//
// A BEHAVIOUR TEST CANNOT COVER THIS. It can only cover paths someone thought to
// test, and a fifth path added tomorrow is covered by nothing. Each named path
// is therefore held to import admitUrl.
//
// THE ONE-WRITER GROUP THIS FILE HELD — "trackedUrl.upsert and trackedUrl.create
// appear in admitUrl.ts and nowhere else" — was deleted at refactor step 2
// (docs/gf-refactor-plan.md §4, rule 3). The survey is a second, deliberate
// writer from step 2 to step 8: a page enters the corpus by survey, attributed,
// with no admission gate (docs/gf-interaction-flows.md Phase 0). The target
// form of the rule — exactly one writer, and it is the survey — is held by
// test/walk/retiredNames.test.ts, red until step 8 retires admitUrl and this
// file with it.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

describe('every admission path calls admitUrl', () => {
  // Named explicitly rather than discovered, so adding a route is a deliberate
  // act. Each of these could create a TrackedUrl before this change; three did so
  // with no relevance check and no recorded verdict.
  const ADMISSION_PATHS = [
    'routes/forensicsRoutes.ts',
    'services/WaybackScraper.ts',
    'mcp/tools/startForensicScan.ts',
    'mcp/tools/enrichEvidenceWithHistory.ts',
  ] as const;

  // The vacuity guard the deleted group carried, re-homed: a table that
  // enumerates zero paths must fail, not pass over nothing.
  it('names at least one admission path — a silent zero would make the group vacuous', () => {
    expect(ADMISSION_PATHS.length).toBeGreaterThan(0);
  });

  it.each(ADMISSION_PATHS)('%s routes through admitUrl', (rel) => {
    const source = readFileSync(join(SRC, rel), 'utf8');
    // Matched on the MODULE, not on one relative path: these files sit at
    // different depths, so `./admitUrl` and `../../services/admitUrl` are the
    // same import. Pinning one spelling would have failed for a reason that has
    // nothing to do with the property being asserted.
    expect(source).toMatch(/from\s+'(\.{1,2}\/)+(services\/)?admitUrl'/);
  });
});
