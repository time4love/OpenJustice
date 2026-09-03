import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SRC, WALK, tsFiles, readCode, codeOf, writesTo, columnsWritten, importSpecifiers } from './scan';

// ---------------------------------------------------------------------------
// THE TEN INVARIANTS OF docs/gf-architecture-target.md §6 — "true after every
// step, not only at the end" — as checks that run on any step.
//
// Nine are source scans over src/walk, each with a DECOY proving the scan sees
// what it scans for, and each with a VACUITY GUARD: the module it scans must
// exist, so every one is RED today and turns green at its own step, rather
// than passing on an empty directory. The tenth — `textHash` is the novelty
// key — is behavioural and is held by A5's scan_captures file, not repeated.
//
// The last group is the walk-scope import scan the refactor plan §1 requires
// from step 0: nothing under src/walk imports a retired module.
// ---------------------------------------------------------------------------

const walkFile = (name: string) => join(WALK, `${name}.ts`);
const walkModules = () => tsFiles(WALK).map((file) => ({ file: basename(file), code: readCode(file) }));

/** Modules whose write payloads on `delegate` name any of `columns`. */
function writersOf(delegate: string, columns: readonly string[]) {
  return walkModules().filter(({ code }) =>
    writesTo(code, delegate).some((region) => columnsWritten(region).some((c) => columns.includes(c))),
  );
}

describe('the walk exists — the guard every scan below rests on', () => {
  it('src/walk holds at least one module', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
  });
});

describe('I1 · fullText and contentHash are never written by any rule or any walk', () => {
  const IDENTITY = ['fullText', 'contentHash'];

  it('no write payload under src/walk names either column', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
    const offenders = walkModules().filter(({ code }) =>
      ['urlSnapshot', 'cdxIndexEntry', 'textVersion'].some((delegate) =>
        writesTo(code, delegate).some((region) => columnsWritten(region).some((c) => IDENTITY.includes(c))),
      ),
    );
    expect(offenders.map((m) => m.file)).toEqual([]);
  });

  it('DETECTS such a write — proven against a decoy', () => {
    const decoy = `await prisma.urlSnapshot.update({ where: { id }, data: { text, contentHash: h } });`;
    expect(writesTo(decoy, 'urlSnapshot').flatMap(columnsWritten)).toEqual(expect.arrayContaining(['contentHash']));
  });
});

describe('I2 · no UrlSnapshot is ever deleted, and no anchor is ever rewritten', () => {
  const ANCHOR_MODULE = join(SRC, 'services', 'anchorSnapshots.ts');
  /** The anchor columns, read from the module that owns them, so the list cannot drift. */
  const anchorColumns = writesTo(readCode(ANCHOR_MODULE), 'urlSnapshot').flatMap(columnsWritten);

  it('the anchoring module still names its columns — the list is not empty', () => {
    expect(anchorColumns).toEqual(expect.arrayContaining(['onChainTxHash', 'anchoredHash']));
  });

  it('nothing under src deletes a UrlSnapshot', () => {
    const offenders = tsFiles(SRC).filter((file) => /\.urlSnapshot\.delete(?:Many)?\(/.test(readCode(file)));
    expect(offenders).toEqual([]);
  });

  it('nothing under src/walk writes an anchor column — anchoring is reached through anchorSnapshots', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
    expect(writersOf('urlSnapshot', anchorColumns).map((m) => m.file)).toEqual([]);
  });

  it('DETECTS both — proven against decoys', () => {
    expect(/\.urlSnapshot\.delete(?:Many)?\(/.test(`await prisma.urlSnapshot.deleteMany({ where })`)).toBe(true);
    const decoy = `await prisma.urlSnapshot.update({ where: { id }, data: { onChainTxHash: tx } });`;
    expect(writesTo(decoy, 'urlSnapshot').flatMap(columnsWritten)).toContain('onChainTxHash');
  });
});

describe('I3 · a stored capture’s text changes only by a versioned supersession that keeps what it replaces', () => {
  const TEXT = ['text', 'textHash', 'textExtractionVersion'];

  it('exactly one module under src/walk writes text onto a snapshot, and it also creates a TextVersion', () => {
    const writers = writersOf('urlSnapshot', TEXT);
    expect(writers.map((m) => m.file)).toHaveLength(1);
    const [supersession] = writers;
    expect(/\.textVersion\.create(?:Many)?\(/.test(supersession?.code ?? '')).toBe(true);
  });

  it('DETECTS a text write without a version — proven against a decoy', () => {
    const decoy = `await prisma.urlSnapshot.update({ where: { id }, data: { text: t, textHash: h } });`;
    expect(writesTo(decoy, 'urlSnapshot').flatMap(columnsWritten)).toEqual(expect.arrayContaining(['text', 'textHash']));
    expect(/\.textVersion\.create(?:Many)?\(/.test(decoy)).toBe(false);
  });
});

describe('I4 · the decision log is append-only, and every decision names the researcher who made it', () => {
  it('nothing under src updates or deletes a PageDecision', () => {
    const offenders = tsFiles(SRC).filter((file) =>
      /\.pageDecision\.(?:update|updateMany|delete|deleteMany)\(/.test(readCode(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('every PageDecision create under src/walk carries researcherId — and there is at least one', () => {
    const creates = walkModules().flatMap(({ file, code }) =>
      writesTo(code, 'pageDecision').map((region) => ({ file, columns: columnsWritten(region) })),
    );
    expect(creates.length).toBeGreaterThan(0);
    const unattributed = creates.filter((c) => !c.columns.includes('researcherId'));
    expect(unattributed).toEqual([]);
  });

  it('DETECTS an unattributed create — proven against a decoy', () => {
    const decoy = `await tx.pageDecision.create({ data: { trackedUrlId, sequence, type: 'RESET', reason } });`;
    const columns = writesTo(decoy, 'pageDecision').flatMap(columnsWritten);
    expect(columns).toContain('sequence');
    expect(columns).not.toContain('researcherId');
  });
});

describe('I5 · existence is recorded from the archive’s index before any rule is consulted', () => {
  it('exactly one module under src/walk creates work-list rows — the survey; the walk only updates them', () => {
    const creators = walkModules().filter(({ code }) => /\.cdxIndexEntry\.create(?:Many)?\(/.test(code));
    expect(creators.map((m) => m.file)).toHaveLength(1);
  });

  it('DETECTS a second creator — proven against a decoy', () => {
    expect(/\.cdxIndexEntry\.create(?:Many)?\(/.test(`await prisma.cdxIndexEntry.createMany({ data })`)).toBe(true);
  });
});

describe('I6 · no capture is stored under rules a gate has doubted', () => {
  // The stop leaving the capture unstored is held behaviourally by gateOrder.
  // Here: the store is reached through the reused recordCapture module, from
  // exactly one site, in the walk — so there is one place a capture can be
  // stored and it is the one that runs after evaluateCapture returns null.
  it('no module under src/walk creates a UrlSnapshot directly', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
    const offenders = walkModules().filter(({ code }) => /\.urlSnapshot\.create\(/.test(code));
    expect(offenders.map((m) => m.file)).toEqual([]);
  });

  it('exactly one module under src/walk imports the store from recordCapture', () => {
    const importers = walkModules().filter(({ code }) =>
      importSpecifiers(code).some((s) => s.endsWith('/recordCapture')),
    );
    expect(importers.map((m) => m.file)).toHaveLength(1);
  });

  it('DETECTS a direct create and a second importer — proven against decoys', () => {
    expect(/\.urlSnapshot\.create\(/.test(`prisma.urlSnapshot.create({ data })`)).toBe(true);
    expect(importSpecifiers(`import { storeCapture } from '../services/recordCapture';`)).toEqual([
      '../services/recordCapture',
    ]);
  });
});

// I7 · `textHash` means "the derived text under the ruleset in force for this
// timestamp", and novelty is keyed on it. Behavioural: held by A5's
// scan_captures file (DUPLICATE when it equals the predecessor's, ACQUIRED when
// it does not). Not repeated here.

describe('I8 · no threshold decides anything; every stop is a gate, and every gate calls a human', () => {
  const GATE_MODULES = ['gates', 'evaluate'];
  /** A relational comparison against a numeric literal other than a bare 0, on either side. */
  const THRESHOLD = /(?:[<>]=?\s*(?!0(?![\d.]))\d+(?:\.\d+)?)|(?:(?<![\w.])(?!0(?![\d.]))\d+(?:\.\d+)?\s*[<>]=?)/;
  const NUMERIC_EXPORT = /\bexport\s+const\s+\w+\s*=\s*\d/;

  it.each(GATE_MODULES)('%s.ts exists, and compares nothing against a number other than 0', (name) => {
    const file = walkFile(name);
    expect(existsSync(file)).toBe(true);
    const code = existsSync(file) ? readCode(file) : '';
    expect(code.match(THRESHOLD)).toBeNull();
    expect(code.match(NUMERIC_EXPORT)).toBeNull();
  });

  it('DETECTS a threshold — proven against decoys, and does not fire on the contract’s own zero', () => {
    expect(THRESHOLD.test(`if (matchRate < 0.85) return stop;`)).toBe(true);
    expect(THRESHOLD.test(`if (3 <= consecutiveClean) confirmed = true;`)).toBe(true);
    expect(NUMERIC_EXPORT.test(`export const CONFIRM_AFTER_CLEAN = 3;`)).toBe(true);
    expect(THRESHOLD.test(`matchedNodes > 0 && matchedOnCurrent === 0`)).toBe(false);
  });
});

describe('I9 · the marking page decides nothing and applies nothing', () => {
  const DRAFT = ['draftCapture', 'draftSelectors', 'draftTrusted', 'draftReturnedAt'];
  const DECIDING = ['pageDecision', 'rule', 'ruleMatch', 'cdxIndexEntry', 'urlSnapshot', 'textVersion', 'urlVersionDiff'];

  it('routes.ts exists and writes nothing but the draft fields on the page', () => {
    const file = walkFile('routes');
    expect(existsSync(file)).toBe(true);
    const code = existsSync(file) ? readCode(file) : '';
    for (const delegate of DECIDING) expect({ delegate, writes: writesTo(code, delegate) }).toEqual({ delegate, writes: [] });
    const pageColumns = writesTo(code, 'trackedUrl').flatMap(columnsWritten);
    expect(pageColumns.filter((c) => !DRAFT.includes(c))).toEqual([]);
  });

  it('DETECTS a route that records a decision — proven against a decoy', () => {
    const decoy = `await prisma.pageDecision.create({ data: { type: 'CAPTURE_ACCEPTED', researcherId } });`;
    expect(writesTo(decoy, 'pageDecision')).toHaveLength(1);
  });
});

describe('I10 · nothing about a page closes', () => {
  const CLOSING = /\brunId\b|\bCLOSED\b|\bCOMMIT(?:TED)?\b/;

  it('nothing under src/walk writes a status onto the page, and no identifier names a run, a close or a commit', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
    const statusWriters = writersOf('trackedUrl', ['status']);
    expect(statusWriters.map((m) => m.file)).toEqual([]);
    const closers = walkModules().filter(({ code }) => CLOSING.test(code));
    expect(closers.map((m) => m.file)).toEqual([]);
  });

  it('DETECTS both — proven against decoys', () => {
    const decoy = `await prisma.trackedUrl.update({ where: { id }, data: { status: 'SCANNING' } });`;
    expect(writesTo(decoy, 'trackedUrl').flatMap(columnsWritten)).toContain('status');
    expect(CLOSING.test(`const run = await readCalibrationRun(runId);`)).toBe(true);
  });
});

describe('the walk imports no retired module — refactor plan §1, from step 0', () => {
  /** Basenames of every module the as-built doc §7 tags RETIRE, plus the four the plan names outright. */
  const RETIRED = [
    'calibrationRun',
    'rulesetForCapture',
    'calibrationFold',
    'admitUrl',
    'eraDetectors',
    'nextCapture',
    'timelineSample',
    'rulesetSurvival',
    'runCoverage',
    'recoverMissingCaptures',
    'reconcileAgainstCdx',
    'ScanRelevanceAgent',
    'recordUrlAssessment',
    'fetchContentForRelevanceCheck',
  ];
  const JOB_METHODS = /\.(?:processJob|runFullScan|createJob|analyzePageHistory)\(/;

  const importsRetired = (code: string) =>
    importSpecifiers(code).filter((s) => RETIRED.some((r) => s === r || s.endsWith(`/${r}`)));

  it('no file under src/walk imports a retired module', () => {
    expect(tsFiles(WALK).length).toBeGreaterThan(0);
    const offenders = walkModules()
      .map(({ file, code }) => ({ file, retired: importsRetired(code) }))
      .filter((m) => m.retired.length > 0);
    expect(offenders).toEqual([]);
  });

  it('a file under src/walk that imports WaybackScraper calls none of its job methods', () => {
    const offenders = walkModules()
      .filter(({ code }) => importSpecifiers(code).some((s) => s.endsWith('/WaybackScraper')))
      .filter(({ code }) => JOB_METHODS.test(code));
    expect(offenders.map((m) => m.file)).toEqual([]);
  });

  it('DETECTS a retired import and a job call — proven against decoys', () => {
    const decoy = codeOf(`import { governingEras } from '../services/rulesetForCapture';\n// import { admitUrl } from '../services/admitUrl';`);
    expect(importsRetired(decoy)).toEqual(['../services/rulesetForCapture']);
    expect(JOB_METHODS.test(`await scraper.runFullScan(trackedUrlId, url);`)).toBe(true);
  });
});
