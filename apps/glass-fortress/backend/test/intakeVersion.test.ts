import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { INTAKE_VERSION, intakePromptHash } from '../src/lib/intakeVersion';
import { INTAKE_CLASSIFICATION_PROMPT } from '../src/prompts/intakeAgentClassification';
import { buildEvidenceAnalysisData } from '../src/lib/evidenceCreateData';
import type { IntakeOutput } from '../src/services/IntakeAgent';

const analysis = {
  evidenceRole: 'Incriminating',
  targetEntity: 'Ministry of Health',
  evidenceTier: 'Tier 1: Smoking Gun',
  evidencePerspective: 'Internal Knowledge',
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  tierReasoning: 'reasoning',
  summary: 'summary',
  evidenceDate: '2022-08-21',
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable',
  keyFigures: [],
  isRelevant: true,
} as unknown as IntakeOutput;

describe('intake classification carries its own provenance', () => {
  it('hashes the prompt actually sent to the model', () => {
    expect(intakePromptHash()).toBe(
      createHash('sha256').update(INTAKE_CLASSIFICATION_PROMPT, 'utf8').digest('hex'),
    );
  });

  it('the hash changes when the prompt changes — otherwise it proves nothing', () => {
    const altered = `${INTAKE_CLASSIFICATION_PROMPT} `;
    expect(createHash('sha256').update(altered, 'utf8').digest('hex')).not.toBe(intakePromptHash());
  });

  it('every evidence write is stamped, because the shared builder stamps it', () => {
    // Placement is the guarantee. All five paths that write evidence go through
    // buildEvidenceAnalysisData, so none of them can forget.
    const data = buildEvidenceAnalysisData(analysis);
    expect(data).toMatchObject({
      intakeVersion: INTAKE_VERSION,
      intakePromptHash: intakePromptHash(),
    });
  });

  it('every evidence write goes through a shaper that carries provenance', () => {
    // There are exactly TWO routes into the vault, and each carries its own
    // provenance:
    //
    //   intake-derived   -> buildEvidenceAnalysisData -> intakeVersion + hash
    //   forensic-derived -> buildForensicEvidence     -> urlVersionDiffId, and
    //                       the diff carries classifierVersion + its own hash
    //
    // A third route that hand-rolled evidenceTier beside a create() would carry
    // neither, and an unstamped row is indistinguishable from one classified
    // under a rubric that no longer exists. This asserts there is no third route.
    const SRC = join(__dirname, '..', 'src');
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
      });
    })(SRC);

    const SHAPERS = ['buildEvidenceAnalysisData', 'buildForensicEvidence'];
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      if (!/prisma\.evidence\.(create|upsert)/.test(src)) return false;
      return !SHAPERS.some((shaper) => src.includes(shaper));
    });
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('the version string is not left at a placeholder', () => {
    expect(INTAKE_VERSION).toMatch(/^v\d+-/);
  });
});
