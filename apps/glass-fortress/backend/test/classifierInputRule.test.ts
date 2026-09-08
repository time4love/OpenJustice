import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// THE GUARD FOR THE DEFECT THAT STARTED ALL OF THIS.
//
// Two paths classify a diff — the walk's Gate 5 (scanCaptures, through the
// `ClassifierDiff` that gates.ts builds) and a reclassification (reclassifyDiffs)
// — and they are supposed to be able to reproduce each other.
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
  'src/walk/tools/scanCaptures.ts',
  // `reclassifyDiffs` left this list at evidence step 11a with the legacy
  // columns it rewrote; `previewDiffClassification` is retired by thesis A4 and
  // leaves in 11a-thesis. The rule is unchanged and the list shrinks toward the
  // one path the design has: the walk classifies once, at acquisition.
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
  // The walk's Gate 5 hands the classifier a `ClassifierDiff` — `diff.removed`
  // and `diff.added` — built in ONE place, gates.ts's `classifierDiffOf`, from
  // the selector. The member is selected iff that builder is.
  if (/^diff\.(?:removed|added)$/u.test(expression)) {
    const gates = readSource('src/walk/gates.ts');
    const builder = gates.slice(gates.indexOf('export function classifierDiffOf('));
    return builder.slice(0, builder.indexOf('\n}')).includes(`${SELECTOR}(`);
  }
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

// ---------------------------------------------------------------------------
// THE ONE DIFF SITE RECORDS DIFF_VERSION — the successor of "every diff
// creation stamps the input version", deleted at the switch with the eight
// scan-job sites it scanned. Under docs/gf-evidence-flows.md A2 a diff's
// content is a version keyed by DIFF_VERSION — the differ and the classifier
// named together — and the walk reaches the writer from exactly one site
// (test/walk/diffOneSite.test.ts). So the rule has one place to hold: the
// writer stamps `diffVersion: DIFF_VERSION` on the version it creates, and
// the constant it stamps is composed from the two it names.
// ---------------------------------------------------------------------------
describe('the walk’s one diff site records DIFF_VERSION', () => {
  it('the writer stamps DIFF_VERSION on the content version, in the create itself', () => {
    const writer = readSource('src/services/recordDiff.ts');
    const create = writer.slice(writer.indexOf('diffContentVersion.createMany('));
    const statement = create.slice(0, create.indexOf('skipDuplicates'));
    expect(statement).toContain('diffVersion: DIFF_VERSION');
    expect(writer).toMatch(/import \{ DIFF_VERSION \} from '\.\.\/lib\/diffVersion'/u);
  });

  it('DIFF_VERSION is composed from the input rule and the classifier version, never typed beside them', () => {
    const module = readSource('src/lib/diffVersion.ts');
    expect(module).toMatch(/export const DIFF_VERSION = `\$\{DIFF_INPUT_VERSION\}\+\$\{CLASSIFIER_VERSION\}`/u);
  });

  it('the walk hands the writer the classification it drew, from its one site', () => {
    const walk = readSource('src/walk/tools/scanCaptures.ts');
    expect(walk.split('recordDiff(').length - 1).toBe(1);
    expect(walk).toMatch(/import \{ recordDiff, type DiffClassification \} from '\.\.\/\.\.\/services\/recordDiff'/u);
  });
});

describe('every classification records which model produced it', () => {
  it('stamps classifierModel wherever classifierVersion is written to a classification', () => {
    // THE SUBJECT MOVED AT EVIDENCE STEP 11a. It was `reclassifyDiffs`, which
    // wrote provenance onto a diff ROW; that tool and those columns are gone,
    // and the one writer of a classification is now the walk's, which writes it
    // as the OPINION register of a `DiffContentVersion` (evidence A2). The RULE
    // is unchanged — a recorded version must be recorded with the model that
    // produced it, or two rows carry byte-identical provenance for two models.
    for (const relative of ['src/walk/tools/scanCaptures.ts']) {
      const source = readSource(relative);
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
