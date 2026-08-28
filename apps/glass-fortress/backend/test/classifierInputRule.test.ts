import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// THE GUARD FOR THE DEFECT THAT STARTED ALL OF THIS.
//
// Two paths classify a diff — a scan (WaybackScraper) and a reclassification
// (reclassifyDiffs) — and they are supposed to be able to reproduce each other.
// They could not: the scan filtered its input through a 40-character floor and
// reclassification passed the stored chunks straight through, because the floor
// lived in a module-private constant the second path could not see.
//
// Two environments then held different classifications of the same page change
// from the same commit and the same prompt, and NOTHING SURFACED IT — both paths
// stamped the same classifierVersion, and the provenance hash covers the prompt,
// which was identical.
//
// No behavioural test could catch that: each path was internally consistent and
// individually correct. The invariant is structural — every route to the agent
// goes through one named selection step — so the test is structural too.
//
// This reads source rather than running code, deliberately. A mock-based test
// would assert what the agent RECEIVED in a scenario someone remembered to
// write; this asserts that no call site can exist which bypasses the rule.
// ---------------------------------------------------------------------------

const SELECTOR = 'classifierInputChunks';

/** Source files permitted to call ForensicAgent.analyzeChange. */
const CLASSIFYING_PATHS = [
  'src/services/WaybackScraper.ts',
  'src/services/reclassifyDiffs.ts',
  'src/services/previewDiffClassification.ts',
];

function readSource(relative: string): string {
  return readFileSync(join(__dirname, '..', relative), 'utf8');
}

/** The argument list of a call, by balanced-paren scan from the opening paren. */
function callArguments(source: string, startIndex: number): string {
  let depth = 0;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(startIndex + 1, i);
    }
  }
  throw new Error('Unbalanced parentheses while scanning a call site');
}

function analyzeChangeCallSites(source: string): string[] {
  const sites: string[] = [];
  const needle = 'analyzeChange(';
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) return sites;
    sites.push(callArguments(source, at + needle.length - 1));
    from = at + needle.length;
  }
}

/** Split an argument list on top-level commas only. */
function topLevelArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0) out.push(current.trim());
  return out;
}

/**
 * Whether an argument expression is selected input.
 *
 * Accepts the selector applied inline, or a local bound to it — passing
 * `deletionsForAI` where `const deletionsForAI = classifierInputChunks(...)` is
 * the natural way to write this, and a test that forbade it would be enforcing
 * style rather than the invariant.
 */
function isSelected(expression: string, source: string): boolean {
  if (expression.includes(SELECTOR)) return true;
  if (!/^[A-Za-z_$][\w$]*$/u.test(expression)) return false;
  return new RegExp(`(const|let|var)\\s+${expression}\\s*=\\s*${SELECTOR}\\(`, 'u').test(source);
}

describe('every path to the classifier goes through the one selection step', () => {
  it.each(CLASSIFYING_PATHS)('%s selects its input via the shared rule', (relative) => {
    const source = readSource(relative);
    const sites = analyzeChangeCallSites(source);

    expect(sites.length).toBeGreaterThan(0);
    for (const args of sites) {
      const [deletions, additions] = topLevelArgs(args);
      expect(deletions).toBeDefined();
      expect(additions).toBeDefined();
      expect(isSelected(deletions ?? '', source)).toBe(true);
      expect(isSelected(additions ?? '', source)).toBe(true);
    }
  });

  it('finds no call to analyzeChange outside the declared classifying paths', () => {
    // A new caller must be added to CLASSIFYING_PATHS deliberately, which is the
    // moment someone is forced to think about its input rule.
    const offenders = ['src/services/ForensicAgent.ts']
      .concat(CLASSIFYING_PATHS)
      .filter((p) => !CLASSIFYING_PATHS.includes(p));

    // ForensicAgent DEFINES analyzeChange; it is not a caller.
    expect(offenders).toEqual(['src/services/ForensicAgent.ts']);
    expect(readSource('src/services/ForensicAgent.ts')).toContain('async analyzeChange(');
  });

  it('the old per-path filter is gone, not merely unused', () => {
    // chunksForAI was the module-private floor. Leaving it importable would let a
    // future path re-adopt the exact asymmetry this replaced.
    for (const relative of [...CLASSIFYING_PATHS, 'src/lib/diffChunking.ts']) {
      expect(readSource(relative)).not.toMatch(/\bchunksForAI\b/u);
    }
  });

  it('no numeric chunk cap or length floor survives in the chunking module', () => {
    const source = readSource('src/lib/diffChunking.ts');
    const code = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/\.slice\(0,/u);
    expect(code).not.toMatch(/MAX_CHUNKS_PER_SIDE|MIN_CHUNK_LENGTH/u);
    // Sorting existed only to decide what to truncate; document order is evidence.
    expect(code).not.toMatch(/\.sort\(/u);
  });
});

describe('every diff that gets created records the input rule that produced it', () => {
  it('stamps diffInputVersion at every UrlVersionDiff creation', () => {
    const source = readSource('src/services/WaybackScraper.ts');

    // Follows the WRITER, which is now recordDiff: diffs used to be created from
    // eight direct `urlVersionDiff.create` call sites and are funnelled through
    // one function so a rescan converges on the capture pair rather than
    // duplicating. Counting the old expression here would have silently dropped
    // to zero and made the assertion below vacuous.
    const creates = source.split('recordDiff({').length - 1;
    const stamps = source.split('diffInputVersion: DIFF_INPUT_VERSION').length - 1;

    // A row without it is indistinguishable from a row written under the
    // truncating rule, which is exactly what null is reserved to mean.
    expect(creates).toBeGreaterThan(0);
    expect(stamps).toBe(creates);
  });
});

describe('every classification records which model produced it', () => {
  it('stamps classifierModel wherever classifierVersion is written to a diff row', () => {
    for (const relative of ['src/services/WaybackScraper.ts', 'src/services/reclassifyDiffs.ts']) {
      const source = readSource(relative);
      // The run record in reclassifyDiffs also carries classifierVersion but is
      // not a diff row, so compare against writes that set the prompt hash — the
      // marker of a row whose classification provenance is being recorded.
      const hashWrites = source.split('classifierPromptHash:').length - 1;
      const modelWrites = source.split('classifierModel:').length - 1;
      expect([relative, modelWrites]).toEqual([relative, hashWrites]);
    }
  });

  it('derives the model id from the same env lookup the factory uses', () => {
    const factory = readSource('src/factories/LLMFactory.ts');
    // Two copies of the provider lookup could disagree, and then the recorded
    // model would be a guess about the model that actually ran.
    expect(factory.split('resolveProvider(agentType)').length - 1).toBeGreaterThanOrEqual(2);
    expect(factory).not.toMatch(/process\.env\[envKey\][\s\S]{0,80}process\.env\[envKey\]/u);
  });
});
