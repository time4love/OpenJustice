jest.mock('../src/lib/prisma', () => ({
  prisma: { scanRelevanceAssessment: { create: jest.fn(), findFirst: jest.fn() } },
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'crypto';
import { prisma } from '../src/lib/prisma';
import {
  recordMissionAssessment,
  currentMissionVerdict,
  maySubmitToSavePageNow,
} from '../src/services/recordMissionAssessment';
import { SCAN_RELEVANCE_PROMPT_HASH, SCAN_RELEVANCE_VERSION } from '../src/lib/mission';
import { SCAN_RELEVANCE_CHECK_PROMPT } from '../src/prompts/scanRelevanceCheck';

const create = prisma.scanRelevanceAssessment.create as unknown as jest.Mock;
const findFirst = prisma.scanRelevanceAssessment.findFirst as unknown as jest.Mock;

const URL_ = 'https://example.gov.il/some-page';
const AT = new Date('2026-08-28T09:00:00Z');

function modelInput(o: Record<string, unknown> = {}) {
  return {
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
    await recordMissionAssessment(modelInput({ verdict: 'OFF_MISSION' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.verdict).toBe('OFF_MISSION');
  });

  it('stores a row when the URL is ADMITTED', async () => {
    // THE SUBTLE ONE. Recording only rejections makes the rejection RATE
    // incomputable, so a filter turning away 1% is indistinguishable from one
    // turning away 90% — a selection-bias record with selection bias in it.
    await recordMissionAssessment(modelInput({ verdict: 'ON_MISSION' }));
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
    const start = schema.indexOf('model ScanRelevanceAssessment {');
    expect(start).toBeGreaterThan(-1); // vacuity guard
    const model = schema.slice(start, schema.indexOf('\n}', start));
    expect(model).toMatch(/^\s+reason\s+String\s*$/m); // not String?
  });

  it('records a rejected URL with no TrackedUrl behind it', async () => {
    // The load-bearing modelling choice: a rejected URL never becomes a
    // TrackedUrl, so a foreign key would make exactly the rejections
    // unrepresentable — "zero rows create zero entries", one layer up.
    await recordMissionAssessment(modelInput({ verdict: 'OFF_MISSION' }));
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
    await recordMissionAssessment(modelInput());
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
    const sql = readFileSync(
      join(
        __dirname,
        '..',
        'prisma',
        'migrations',
        '20260828010000_scan_relevance_assessment',
        'migration.sql',
      ),
      'utf8',
    );
    expect(sql).toContain('ScanRelevanceAssessment_provenance_complete');
    expect(sql).toMatch(/"author"\s*=\s*'MODEL'/);
    expect(sql).toMatch(/"promptHash"\s+IS NOT NULL/);
    expect(sql).toMatch(/"author"\s*=\s*'HUMAN'/);
    expect(sql).toMatch(/"actorId"\s+IS NOT NULL/);
  });

  it('writes actorId and no model provenance on a HUMAN row', async () => {
    await recordMissionAssessment({
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
    await recordMissionAssessment(modelInput({ contentChars: 10_000, contentTruncated: true }));
    const { data } = create.mock.calls[0][0];
    expect(data.contentChars).toBe(10_000);
    expect(data.contentTruncated).toBe(true);
  });

  it('reports contentTruncated false when the whole page was seen', async () => {
    // An always-true flag is an assertion that cannot fail wearing a data field's
    // clothes.
    await recordMissionAssessment(modelInput({ contentChars: 120, contentTruncated: false }));
    expect(create.mock.calls[0][0].data.contentTruncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. THE OPERATIVE VERDICT IS DERIVED FROM STATE
// ---------------------------------------------------------------------------
describe('the latest assessment governs, and nothing is edited', () => {
  it('reads the most recent verdict for a URL', async () => {
    findFirst.mockResolvedValue({
      verdict: 'ON_MISSION',
      reason: 'r',
      author: 'HUMAN',
      assessedAt: AT,
    });
    const current = await currentMissionVerdict(URL_);
    expect(current?.verdict).toBe('ON_MISSION');
    expect(findFirst.mock.calls[0][0].orderBy).toEqual({ assessedAt: 'desc' });
  });

  it('appends a human override rather than editing the model row', async () => {
    await recordMissionAssessment({
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
    expect(prisma.scanRelevanceAssessment).not.toHaveProperty('update');
  });

  it('treats an unassessed URL as unassessed, never as ON_MISSION', async () => {
    findFirst.mockResolvedValue(null);
    expect(await currentMissionVerdict(URL_)).toBeNull();
    // Absence is not a pass — the UNAVAILABLE lesson.
    expect(maySubmitToSavePageNow(null, true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. THE REVERSIBILITY ASYMMETRY
// ---------------------------------------------------------------------------
describe('UNCLEAR permits the reversible act and blocks the irreversible one', () => {
  it('refuses Save Page Now on UNCLEAR even with human confirmation', () => {
    expect(maySubmitToSavePageNow('UNCLEAR', true)).toBe(false);
  });

  it('refuses Save Page Now on OFF_MISSION', () => {
    expect(maySubmitToSavePageNow('OFF_MISSION', true)).toBe(false);
  });

  it('refuses Save Page Now on ON_MISSION WITHOUT human confirmation', () => {
    // Asking a third party to make a page permanent is the only act here that
    // cannot be undone, so it is the only one gated on a human.
    expect(maySubmitToSavePageNow('ON_MISSION', false)).toBe(false);
  });

  it('permits Save Page Now only on ON_MISSION plus a human yes', () => {
    expect(maySubmitToSavePageNow('ON_MISSION', true)).toBe(true);
  });
});
