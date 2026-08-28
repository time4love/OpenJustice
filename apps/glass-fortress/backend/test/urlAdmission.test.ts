import { readdirSync, readFileSync, statSync } from 'node:fs';
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
// test, and a fifth path added tomorrow is covered by nothing. The source scan
// asserts the property directly: `trackedUrl.upsert` and `trackedUrl.create`
// appear in admitUrl.ts and nowhere else, so a new admission route either goes
// through the gate or fails here.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/** The one file permitted to create a TrackedUrl. */
const ADMISSION_MODULE = 'services/admitUrl.ts';

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Files containing a TrackedUrl WRITE, as paths relative to src/. */
function trackedUrlWriters(): string[] {
  return tsFiles(SRC)
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      // Comments are stripped first. admitUrl.ts documents the rule in prose and
      // would otherwise match itself for the wrong reason — and a scan that fires
      // on prose is not testing the code.
      const code = source
        .split('\n')
        .filter((l) => {
          const t = l.trimStart();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
      return /\btrackedUrl\.(upsert|create)\s*\(/.test(code);
    })
    .map((file) => file.slice(SRC.length + 1));
}

describe('a URL enters the corpus through admitUrl or not at all', () => {
  const writers = trackedUrlWriters();

  it('finds a TrackedUrl writer at all — a silent zero would make this vacuous', () => {
    // If the pattern stops matching, every assertion below passes over an empty
    // set and the guard reports success for a check it never ran.
    expect(writers.length).toBeGreaterThan(0);
  });

  it('has exactly one, and it is the admission module', () => {
    expect(writers).toEqual([ADMISSION_MODULE]);
  });
});

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

  it.each(ADMISSION_PATHS)('%s routes through admitUrl', (rel) => {
    const source = readFileSync(join(SRC, rel), 'utf8');
    // Matched on the MODULE, not on one relative path: these files sit at
    // different depths, so `./admitUrl` and `../../services/admitUrl` are the
    // same import. Pinning one spelling would have failed for a reason that has
    // nothing to do with the property being asserted.
    expect(source).toMatch(/from\s+'(\.{1,2}\/)+(services\/)?admitUrl'/);
  });
});
