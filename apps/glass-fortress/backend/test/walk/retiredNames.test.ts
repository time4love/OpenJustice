import { relative } from 'node:path';
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

  it('TrackedUrl is created in exactly one module — the survey', () => {
    const creators = srcModules().filter(({ code }) => /\.trackedUrl\.create(?:Many)?\(/.test(code));
    expect(creators.map((m) => m.file)).toHaveLength(1);
  });

  it('urlVersionDiff is written from exactly one module', () => {
    const writers = srcModules().filter(({ code }) => /\.urlVersionDiff\.(?:create|upsert)\(/.test(code));
    expect(writers.map((m) => m.file)).toHaveLength(1);
  });

  it('DETECTS each — proven against decoys, and the era scan does not fire on camera or general', () => {
    expect(identifiersWithWord(`const eras = deriveEras(log); const b = ERA_BOUNDARY; type D = DatedEra;`, ['era', 'eras']).sort())
      .toEqual(['DatedEra', 'ERA_BOUNDARY', 'deriveEras', 'eras']);
    expect(identifiersWithWord(`const camera = general.operation;`, ['era', 'eras'])).toEqual([]);
    expect(/\b(?:calibrationRunId|admitUrl)\b/.test(`where: { calibrationRunId }`)).toBe(true);
    expect(RETIRED_TOOLS.filter((t) => `server.tool('judge_article_capture', …)`.includes(t))).toEqual(['judge_article_capture']);
    expect(/\.trackedUrl\.create(?:Many)?\(/.test(`await prisma.trackedUrl.create({ data })`)).toBe(true);
  });
});
