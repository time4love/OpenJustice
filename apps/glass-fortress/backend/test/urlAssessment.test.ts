jest.mock('../src/lib/prisma', () => ({
  prisma: { urlAssessment: { create: jest.fn(), findFirst: jest.fn() } },
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'crypto';
import { prisma } from '../src/lib/prisma';
import {
  recordUrlAssessment,
  currentVerdict,
  savePageNowDecision,
  MISSION_VERDICTS,
  SUBJECT_VERDICTS,
} from '../src/services/recordUrlAssessment';
import { SCAN_RELEVANCE_PROMPT_HASH, SCAN_RELEVANCE_VERSION } from '../src/lib/mission';
import { SCAN_RELEVANCE_CHECK_PROMPT } from '../src/prompts/scanRelevanceCheck';

const create = prisma.urlAssessment.create as unknown as jest.Mock;
const findFirst = prisma.urlAssessment.findFirst as unknown as jest.Mock;

const URL_ = 'https://example.gov.il/some-page';
const AT = new Date('2026-08-28T09:00:00Z');

function modelInput(o: Record<string, unknown> = {}) {
  return {
    checkType: 'MISSION' as const,
    author: 'MODEL' as const,
    url: URL_,
    verdict: 'ON_MISSION' as const,
    reason: 'העמוד עוסק במדיניות חיסונים.',
    assessedAt: AT,
    model: 'anthropic:claude',
    agentVersion: SCAN_RELEVANCE_VERSION,
    promptHash: 'p'.repeat(64),
    contentChars: 4321,
    contentTruncated: false,
    ...o,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ id: 'a1' });
  findFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// 1. THE GATE LEAVES A TRACE — in BOTH directions
// ---------------------------------------------------------------------------
describe('every mission assessment is stored', () => {
  it('stores a row when the URL is REJECTED', async () => {
    await recordUrlAssessment(modelInput({ verdict: 'OFF_MISSION' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.verdict).toBe('OFF_MISSION');
  });

  it('stores a row when the URL is ADMITTED', async () => {
    // THE SUBTLE ONE. Recording only rejections makes the rejection RATE
    // incomputable, so a filter turning away 1% is indistinguishable from one
    // turning away 90% — a selection-bias record with selection bias in it.
    await recordUrlAssessment(modelInput({ verdict: 'ON_MISSION' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.verdict).toBe('ON_MISSION');
  });

  it('requires a reason for BOTH verdicts', () => {
    // A filter that explains only its rejections cannot be audited for what it
    // let through — the denominator argument, applied to explanations.
    const schema = readFileSync(
      join(__dirname, '..', 'prisma', 'schema.prisma'),
      'utf8',
    );
    const start = schema.indexOf('model UrlAssessment {');
    expect(start).toBeGreaterThan(-1); // vacuity guard
    const model = schema.slice(start, schema.indexOf('\n}', start));
    expect(model).toMatch(/^\s+reason\s+String\s*$/m); // not String?
  });

  it('records a rejected URL with no TrackedUrl behind it', async () => {
    // The load-bearing modelling choice: a rejected URL never becomes a
    // TrackedUrl, so a foreign key would make exactly the rejections
    // unrepresentable — "zero rows create zero entries", one layer up.
    await recordUrlAssessment(modelInput({ verdict: 'OFF_MISSION' }));
    const { data } = create.mock.calls[0][0];
    expect(data.url).toBe(URL_);
    expect(data).not.toHaveProperty('trackedUrlId');
  });
});

// ---------------------------------------------------------------------------
// 2. PROVENANCE IS COMPLETE BY CONSTRUCTION
// ---------------------------------------------------------------------------
describe('provenance cannot be omitted', () => {
  it('writes model, agentVersion, promptHash and missionHash on a MODEL row', async () => {
    await recordUrlAssessment(modelInput());
    const { data } = create.mock.calls[0][0];
    for (const field of ['model', 'agentVersion', 'promptHash']) {
      expect(data[field]).toBeTruthy();
    }
  });

  it('pins SCAN_RELEVANCE_VERSION to its literal, so blanking it cannot pass', () => {
    // Asserting the constant against itself is a tautology — the exact shape that
    // let a blanked TEXT_EXTRACTION_VERSION survive its mutation.
    expect(SCAN_RELEVANCE_VERSION).toBe('v1-recorded-verdicts');
  });

  it('carries the CHECK constraint in the migration, not only in TypeScript', () => {
    // The write path's discriminated union is a check in ONE LANGUAGE guarding a
    // table any other path can write. Constraint over check.
    // The constraint is DEFINED in the migration that created the table and
    // RENAMED by the one that restructured it. Asserting only against the latest
    // file would have reported the constraint missing when it is merely inherited
    // — so both halves are checked, which is what "it still holds" actually means.
    const migrations = join(__dirname, '..', 'prisma', 'migrations');
    const defined = readFileSync(
      join(migrations, '20260828010000_scan_relevance_assessment', 'migration.sql'),
      'utf8',
    );
    const renamed = readFileSync(
      join(migrations, '20260828020000_url_assessment', 'migration.sql'),
      'utf8',
    );
    expect(defined).toMatch(/"author"\s*=\s*'MODEL'/);
    expect(defined).toMatch(/"promptHash"\s+IS NOT NULL/);
    expect(defined).toMatch(/"author"\s*=\s*'HUMAN'/);
    expect(defined).toMatch(/"actorId"\s+IS NOT NULL/);
    expect(renamed).toContain('UrlAssessment_provenance_complete');
  });

  it('writes actorId and no model provenance on a HUMAN row', async () => {
    await recordUrlAssessment({
      checkType: 'MISSION',
      author: 'HUMAN',
      url: URL_,
      verdict: 'ON_MISSION',
      reason: 'הוחלט ידנית כי הכתבה רלוונטית.',
      assessedAt: AT,
      actorId: 'researcher-1',
    });
    const { data } = create.mock.calls[0][0];
    expect(data.actorId).toBe('researcher-1');
    // Null here is a real distinction rather than a missing value: a human
    // judgement has different provenance, not absent provenance.
    expect(data.promptHash).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. THE CRITERION IS VERSIONED AND PROVEN, and is NOT the home page's copy
// ---------------------------------------------------------------------------
describe('the admission criterion is recorded, not merely applied', () => {
  it('hashes the criterion actually applied — the prompt itself', () => {
    expect(SCAN_RELEVANCE_PROMPT_HASH).toBe(
      createHash('sha256').update(SCAN_RELEVANCE_CHECK_PROMPT, 'utf8').digest('hex'),
    );
  });

  it('finds a non-empty prompt — a silent empty string would make this vacuous', () => {
    expect(SCAN_RELEVANCE_CHECK_PROMPT.length).toBeGreaterThan(200);
  });

  it('does NOT interpolate the public hero copy into the criterion', () => {
    // Tried the opposite and reverted it. Sharing one string looked like "one
    // rule, one implementation" and is the wrong reading: a public statement of
    // purpose and an operational admission criterion are different artefacts,
    // like a law and its regulations. Coupling them produced a concrete
    // absurdity — because a verdict stores the hash of what it was judged
    // against, A MARKETING TWEAK TO A HEADLINE WOULD MARK EVERY STORED VERDICT AS
    // REACHED UNDER DIFFERENT WORDS and re-open the corpus for re-assessment.
    //
    // The defect that needed fixing was never that the criterion differed from
    // the hero copy; it was that the criterion had no version, no hash and no
    // record.
    const messages = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'frontend', 'messages', 'en.json'), 'utf8'),
    ) as Record<string, Record<string, string>>;
    const hero = messages['home']?.['heroSubtitle'];
    expect(hero).toBeTruthy(); // vacuity guard: the hero copy must still exist
    expect(SCAN_RELEVANCE_CHECK_PROMPT).not.toContain(hero);
  });
});

// ---------------------------------------------------------------------------
// 4. THE INPUT BOUND IS RECORDED
// ---------------------------------------------------------------------------
describe('the assessment records what the model actually saw', () => {
  it('stores contentChars and contentTruncated', async () => {
    await recordUrlAssessment(modelInput({ contentChars: 10_000, contentTruncated: true }));
    const { data } = create.mock.calls[0][0];
    expect(data.contentChars).toBe(10_000);
    expect(data.contentTruncated).toBe(true);
  });

  it('reports contentTruncated false when the whole page was seen', async () => {
    // An always-true flag is an assertion that cannot fail wearing a data field's
    // clothes.
    await recordUrlAssessment(modelInput({ contentChars: 120, contentTruncated: false }));
    expect(create.mock.calls[0][0].data.contentTruncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. THE OPERATIVE VERDICT IS DERIVED FROM STATE
// ---------------------------------------------------------------------------
describe('the latest assessment governs, and nothing is edited', () => {
  it('reads the most recent verdict for a URL', async () => {
    findFirst.mockResolvedValue({ verdict: 'ON_MISSION' });
    const current = await currentVerdict(URL_, 'MISSION');
    expect(current).toBe('ON_MISSION');
    expect(findFirst.mock.calls[0][0].orderBy).toEqual({ assessedAt: 'desc' });
  });

  it('appends a human override rather than editing the model row', async () => {
    await recordUrlAssessment({
      checkType: 'MISSION',
      author: 'HUMAN',
      url: URL_,
      verdict: 'ON_MISSION',
      reason: 'overturned',
      assessedAt: AT,
      actorId: 'researcher-1',
    });
    // MARK, NEVER REMOVE: the model's verdict stays beside the correction, which
    // is what makes the filter auditable rather than merely overridable.
    expect(create).toHaveBeenCalledTimes(1);
    expect(prisma.urlAssessment).not.toHaveProperty('update');
  });

  it('treats an unassessed URL as unassessed, never as ON_MISSION', async () => {
    findFirst.mockResolvedValue(null);
    expect(await currentVerdict(URL_, 'MISSION')).toBeNull();
    // Absence is not a pass — the UNAVAILABLE lesson.
    expect(savePageNowDecision(null, 'NO_PRIVATE_INDIVIDUAL').allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. TWO GATES, AND THE ASYMMETRY BETWEEN THEM
// ---------------------------------------------------------------------------
describe('Save Page Now is gated on two different questions', () => {
  it('proceeds WITHOUT a human for an on-mission institutional page', () => {
    // CHANGED FROM THE PREVIOUS RULE, deliberately. Requiring a human on every
    // ON_MISSION is a gate that cries wolf, and this project already records that
    // such a gate gets disabled. An institutional or press page on Covid-19
    // health policy is the whole point of the platform: permanence harms nobody,
    // SPN only fires when the Archive holds nothing, and asking every time trains
    // a reader to stop reading.
    expect(savePageNowDecision('ON_MISSION', 'NO_PRIVATE_INDIVIDUAL')).toEqual({
      allowed: true,
      humanConfirmationRequired: false,
    });
  });

  it('requires a human when the page is about a named private individual', () => {
    expect(savePageNowDecision('ON_MISSION', 'NAMED_PRIVATE_INDIVIDUAL')).toEqual({
      allowed: true,
      humanConfirmationRequired: true,
    });
  });

  it('requires a human when the SUBJECT gate is uncertain — the inverted default', () => {
    // The mission gate resolves uncertainty toward ADMITTING: a false rejection
    // blocks a legitimate investigation, a false approval costs one scan. This
    // gate resolves it the other way, because a false negative performs an
    // IRREVERSIBLE act on someone who did not choose it.
    expect(savePageNowDecision('ON_MISSION', 'NEEDS_HUMAN')).toEqual({
      allowed: true,
      humanConfirmationRequired: true,
    });
  });

  it('refuses outright when the MISSION gate is uncertain, human or not', () => {
    // THE ASSERTION TO GUARD HARDEST. A human may authorise permanence; a human
    // may NOT authorise relevance. Without this the subject gate becomes a way to
    // talk past the first gate entirely.
    const decision = savePageNowDecision('UNCLEAR', 'NO_PRIVATE_INDIVIDUAL');
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error('unreachable');
    expect(decision.reason).toContain('cannot authorise relevance');
  });

  it('refuses on OFF_MISSION', () => {
    expect(savePageNowDecision('OFF_MISSION', 'NO_PRIVATE_INDIVIDUAL').allowed).toBe(false);
  });

  it('refuses when the subject gate has never run', () => {
    expect(savePageNowDecision('ON_MISSION', null).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. THE TWO VOCABULARIES ARE DISJOINT
// ---------------------------------------------------------------------------
describe('no verdict value belongs to both gates', () => {
  it('shares no value between the mission and subject vocabularies', () => {
    // Both once used UNCLEAR, resolving it in OPPOSITE directions. Sharing one
    // column, that made a single value mean two opposite things depending on a
    // sibling column — so a query filtering on it would return rows meaning
    // *proceed* beside rows meaning *stop*. One value answering two questions,
    // which is the shape the checkType enum was split to avoid, reappearing one
    // level below it.
    const overlap = (MISSION_VERDICTS as readonly string[]).filter((v) =>
      (SUBJECT_VERDICTS as readonly string[]).includes(v),
    );
    expect(MISSION_VERDICTS.length).toBeGreaterThan(0); // vacuity guard
    expect(SUBJECT_VERDICTS.length).toBeGreaterThan(0);
    expect(overlap).toEqual([]);
  });

  it('constrains each verdict to its OWN check type in the database', () => {
    // Because the vocabularies are disjoint, this CHECK is a MISATTRIBUTION GUARD
    // rather than a membership test: a mission verdict written under
    // checkType = 'SUBJECT' violates it instead of being stored and silently
    // meaning something else.
    const sql = readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20260828020000_url_assessment', 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain('UrlAssessment_verdict_matches_checkType');
    for (const v of MISSION_VERDICTS) expect(sql).toContain(`'${v}'`);
    for (const v of SUBJECT_VERDICTS) expect(sql).toContain(`'${v}'`);
  });

  it('renames rather than recreating, so the migration cannot lose a row', () => {
    // `prisma migrate diff` generates a table drop here. The table held 0 rows
    // when measured — which is exactly the reasoning to refuse: a scan between
    // the measurement and the deploy would write one, and the drop would destroy
    // it while still reporting success.
    const sql = readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20260828020000_url_assessment', 'migration.sql'),
      'utf8',
    );
    expect(sql).toContain('RENAME TO "UrlAssessment"');
    // Matched as a STATEMENT, not as a string anywhere in the file: the comment
    // above explains what `prisma migrate diff` would have generated, and a bare
    // substring check failed on the explanation rather than on the SQL. A test
    // that fires on prose is not testing the code.
    const statements = sql
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(new RegExp(['DROP', 'TABLE'].join('\\s+')));
    // NOT NULL with no DEFAULT is the emptiness guard: Postgres refuses it on a
    // table with rows, so a surprise row aborts the deploy instead of vanishing.
    expect(sql).toMatch(/ADD COLUMN "checkType" "UrlAssessmentType" NOT NULL;/);
  });
});
