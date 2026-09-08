import { dirname, posix, relative } from 'node:path';
import { SRC, tsFiles, readCode, identifiersWithWord } from './scan';

// ---------------------------------------------------------------------------
// EXPECTED RED UNTIL STEP 8 — THE SWITCH.
//
// Refactor plan §4: "after step 8 no file under src names era,
// calibrationRunId, admitUrl or any retired tool; TrackedUrl is created in
// exactly one module; urlVersionDiff is written from exactly one site."
//
// Written at step 0 and RED on purpose until the commit that retires the old
// path. It is in its own file so that, once every other walk file is green, the
// one expected red is the one CI shows. A RETIRE-tagged module still present
// after step 8 is a defect in step 8, and this is the test that says so.
//
// `era` is matched as a WORD of an identifier — deriveEras, eraForDate,
// ERA_BOUNDARY, DatedEra — never as a substring, so `camera` and `general` do
// not fire. Each scan carries a decoy.
// ---------------------------------------------------------------------------

const srcModules = () => tsFiles(SRC).map((file) => ({ file: relative(SRC, file), code: readCode(file) }));

const TRACKED_URL_WRITE = /\.trackedUrl\.(?:create|createMany|upsert)\s*\(/;

/**
 * Every module `file` imports, as a path relative to `src/` — never a name in prose.
 *
 * RESOLVED, NOT MATCHED. The first spelling of this required a `../` prefix, and
 * a sibling import — `from './diffInput'` inside `src/services/` — passed every
 * case while naming exactly what the scan exists to forbid. A regex over the
 * SPECIFIER cannot know where the importing file sits; only resolving against its
 * directory can. The decoy in the DETECTS case is that sibling form, so this
 * cannot regress to the prefix rule silently.
 */
function importedModules(file: string, code: string): string[] {
  const dir = dirname(file);
  return [...code.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) =>
    // POSIX-normalised: `resolve` on a relative pair gives a path with no leading
    // slash and no `..` left, which is the form RETIRED_EVIDENCE_MODULES is
    // written in — one spelling for the comparison, as `relative(SRC, file)` is.
    posix.normalize(posix.join(dir, m[1])),
  );
}

// EVIDENCE STEP 11a — the retired names of evidence flows A4, added to the scan
// the factual layer's step 0 already runs (evidence A7: "the retired-names scan
// the factual layer's step 0 already runs, extended by this list").
//
// TOOLS the MCP surface must not name again, and MODULES no file may import.
// Both halves are needed and neither implies the other: a tool can be
// unregistered while its service still compiles, and a service can be deleted
// while a description still names its tool — the first is how a retired concept
// keeps a live code path, the second is how it keeps a live promise.
//
// `enrich_evidence_with_history` is on A4's retired list and has never existed
// under src/ in this tree. It is listed anyway: this scan holds a name absent,
// and a name that was never present is held absent at no cost. What it must not
// become is a name nobody wrote down because nobody found it.
const RETIRED_EVIDENCE_TOOLS = [
  'search_evidence',
  'get_forensic_timeline',
  'get_scan_findings',
  'promote_scan_findings',
  'promote_evidence',
  'create_evidence_from_url',
  'delete_evidence',
  'enrich_evidence_with_history',
  'open_diff_debate',
  'respond_in_diff_debate',
  'promote_from_diff_debate',
  'get_diff_debate',
];

// THE NINE OPERATIONAL SCRIPTS RETIRED WITH THOSE MODULES, AS npm ENTRY NAMES.
//
// A THIRD HALF, AND IT CATCHES WHAT NEITHER OTHER HALF CAN. A retired tool is a
// name on the MCP surface; a retired module is an import. This is neither: it is
// a SENTENCE a live surface says to a person — "run npm run forensics:backfill-
// survival to re-derive it" — pointing at a command that no longer exists. The
// reviewer found three in one round: a STALE survival reason, the CONSISTENT
// verdict's explanation, and a tool description. Each compiled, each passed every
// other case, and each was a live promise the platform could not keep.
//
// MATCHED IN STRINGS, WHICH IS THE POINT: `readCode` has already stripped block
// and line comments, so a paragraph explaining why a script left does not fire,
// and a message telling a reader to run it does.
const RETIRED_SCRIPT_NAMES = [
  'forensics:reclassify',
  'forensics:resummarize',
  'forensics:rehash-evidence',
  'forensics:rediff',
  'forensics:measure-divergence',
  'forensics:audit-survival',
  'forensics:backfill-survival',
  'forensics:confirm-anchors',
  'forensics:measure-gate5',
];

// The modules those tools stood on, plus the readers that existed only to read
// the legacy columns evidence A2 removes. Matched as an IMPORT PATH, not as a
// word: `promoteEvidence` is also a sentence in three descriptions, and a scan
// that fired on prose would be unfixable without lying in a comment.
const RETIRED_EVIDENCE_MODULES = [
  'services/promoteForensicDiff',
  'services/promoteEvidence',
  'services/deleteEvidence',
  'services/diffDebate',
  'services/ForensicPromotionAssessorAgent',
  'services/forensicEvidence',
  'services/evidenceOnChain',
  'services/rehashEvidence',
  'services/confirmAnchors',
  'services/reclassifyDiffs',
  'services/resummarizeDiffs',
  'services/rediffFromSnapshots',
  'services/auditDiffSurvival',
  'services/backfillDiffSurvival',
  'services/computeDiffSurvival',
  'services/diffInput',
  'services/diffLookup',
  'services/measureGate5',
  'services/measureExtractionDivergence',
];

const RETIRED_TOOLS = [
  'calibrate_article_rules',
  'correct_article_rules',
  'open_article_capture',
  'next_article_capture',
  'judge_article_capture',
  'resolve_era_boundary',
  'check_ruleset_survival',
  'commit_article_rules',
  'abandon_article_rules',
];

describe('EXPECTED RED UNTIL STEP 8 — no file under src names a retired concept or tool', () => {
  it('no identifier has the word era', () => {
    const offenders = srcModules()
      .map(({ file, code }) => ({ file, identifiers: identifiersWithWord(code, ['era', 'eras']) }))
      .filter((m) => m.identifiers.length > 0);
    expect(offenders).toEqual([]);
  });

  it('no identifier is calibrationRunId or admitUrl', () => {
    const offenders = srcModules().filter(({ code }) => /\b(?:calibrationRunId|admitUrl)\b/.test(code));
    expect(offenders.map((m) => m.file)).toEqual([]);
  });

  it('no file names a retired tool', () => {
    const offenders = srcModules()
      .map(({ file, code }) => ({ file, tools: RETIRED_TOOLS.filter((t) => code.includes(t)) }))
      .filter((m) => m.tools.length > 0);
    expect(offenders).toEqual([]);
  });

  // WRITERS, not creators by verb: admitUrl brings a page in with `upsert`, and
  // a scan that counted `create` alone saw zero writers today and would have
  // seen one at step 2 — the survey — while admitUrl still existed beside it.
  // test/urlAdmission.test.ts counts the same writers and pins the one to
  // admitUrl, which is TODAY's rule; this pins it to the survey, the TARGET's.
  // Between step 2 and step 8 the true count is two.
  it('TrackedUrl is written from exactly one module, and it is under src/walk — the survey', () => {
    const writers = srcModules().filter(({ code }) => TRACKED_URL_WRITE.test(code));
    expect(writers.map((m) => m.file)).toHaveLength(1);
    expect(writers.at(0)?.file.startsWith('walk/')).toBe(true);
  });

  it('urlVersionDiff is written from exactly one module', () => {
    const writers = srcModules().filter(({ code }) => /\.urlVersionDiff\.(?:create|upsert)\(/.test(code));
    expect(writers.map((m) => m.file)).toHaveLength(1);
  });

  it('no file names a retired EVIDENCE tool', () => {
    const offenders = srcModules()
      .map(({ file, code }) => ({ file, tools: RETIRED_EVIDENCE_TOOLS.filter((t) => code.includes(t)) }))
      .filter((m) => m.tools.length > 0);
    expect(offenders).toEqual([]);
  });

  it('no file imports a retired EVIDENCE module', () => {
    const offenders = srcModules()
      .map(({ file, code }) => ({
        file,
        modules: RETIRED_EVIDENCE_MODULES.filter((m) => importedModules(file, code).includes(m)),
      }))
      .filter((m) => m.modules.length > 0);
    expect(offenders).toEqual([]);
  });

  // ONE FILE MAY NAME THEM, AND IT IS NAMED HERE RATHER THAN MATCHED AROUND.
  //
  // The registry ledger's whole subject is what PRODUCED the entries on a frozen
  // contract — "over the inputs as they stood before forensics:rehash-evidence
  // re-derived them" is a fact about history, committed to git as the public
  // explanation of an index nobody can re-derive. It is the one place where
  // naming a retired tool is the point rather than a broken promise, and evidence
  // §8 requires the explanation to be complete.
  //
  // AN ALLOW-LIST OF ONE, PINNED TO ONE. A rule that tried to tell an imperative
  // from a past tense would be a rule with a bypass in it: "see forensics:rediff"
  // reads as history and works as an instruction. So the exception is a file, it
  // is visible, and the length assertion below stops it growing by habit.
  const LEDGER = 'services/registryLedger.ts';

  it('the ledger exception is one file, and it exists', () => {
    expect(srcModules().map((m) => m.file)).toContain(LEDGER);
  });

  it('no file promises a retired operational script', () => {
    const offenders = srcModules()
      .filter(({ file }) => file !== LEDGER)
      .map(({ file, code }) => ({
        file,
        scripts: RETIRED_SCRIPT_NAMES.filter((n) => code.includes(n)),
      }))
      .filter((m) => m.scripts.length > 0);
    expect(offenders).toEqual([]);
  });

  it('DETECTS each — proven against decoys, and the era scan does not fire on camera or general', () => {
    expect(identifiersWithWord(`const eras = deriveEras(log); const b = ERA_BOUNDARY; type D = DatedEra;`, ['era', 'eras']).sort())
      .toEqual(['DatedEra', 'ERA_BOUNDARY', 'deriveEras', 'eras']);
    expect(identifiersWithWord(`const camera = general.operation;`, ['era', 'eras'])).toEqual([]);
    expect(/\b(?:calibrationRunId|admitUrl)\b/.test(`where: { calibrationRunId }`)).toBe(true);
    expect(RETIRED_TOOLS.filter((t) => `server.tool('judge_article_capture', …)`.includes(t))).toEqual(['judge_article_capture']);
    expect(TRACKED_URL_WRITE.test(`await prisma.trackedUrl.create({ data })`)).toBe(true);
    expect(TRACKED_URL_WRITE.test(`const page = await prisma.trackedUrl.upsert({ where, create, update });`)).toBe(true);
    expect(TRACKED_URL_WRITE.test(`createdAt: trackedUrl.createdAt,`)).toBe(false);
    // The evidence halves, each against the shape it exists to catch.
    expect(RETIRED_EVIDENCE_TOOLS.filter((t) => `server.tool('promote_scan_findings', …)`.includes(t)))
      .toEqual(['promote_scan_findings']);
    expect(importedModules('mcp/tools/x.ts', `import { d } from '../../services/diffInput';`))
      .toContain('services/diffInput');
    // THE SIBLING FORM, and the one the first spelling of this scan let through:
    // no `../` prefix, and the importing file's own directory supplies the rest.
    expect(importedModules('services/x.ts', `import { d } from './diffInput';`))
      .toContain('services/diffInput');
    // PROSE IS NOT AN IMPORT: the descriptions still explain why diffInput left.
    expect(importedModules('services/x.ts', `// services/diffInput was retired at step 11a`))
      .toEqual([]);
    // The script half, against the shape the reviewer found three times.
    expect(RETIRED_SCRIPT_NAMES.filter((n) => `Run npm run forensics:backfill-survival to fix it.`.includes(n)))
      .toEqual(['forensics:backfill-survival']);
  });
});
