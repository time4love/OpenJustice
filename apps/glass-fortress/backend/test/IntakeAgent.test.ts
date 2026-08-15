import { IntakeAgent, IntakeOutputSchema, EVIDENCE_TIER } from '../src/services/IntakeAgent';
import { INVESTIGATIVE_CATEGORIES } from '../src/lib/investigativeCategories';

// ---------------------------------------------------------------------------
// Mock LLMFactory so no real API calls are made.
// The factory returns a model stub whose withStructuredOutput() returns a
// chain stub with a jest.fn() invoke — identical shape to the real chain.
// ---------------------------------------------------------------------------

jest.mock('../src/factories/LLMFactory', () => ({
  LLMFactory: {
    getChatModel: jest.fn().mockReturnValue({
      withStructuredOutput: jest.fn().mockReturnValue({
        invoke: jest.fn(),
      }),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the mocked `invoke` function from the constructed IntakeAgent chain. */
function getMockInvoke(agent: IntakeAgent): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (agent as any).chain.invoke as jest.Mock;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMOKING_GUN_RESPONSE = {
  evidenceRole: 'Incriminating' as const,
  isRelevant: true,
  investigativeCategories: ['WITHHOLDING_INFORMATION'],
  summary:
    'מסמך פנימי של משרד הבריאות מנחה מנהלים אזוריים לעכב פרסום נתוני דלקת שריר לב לאחר חיסון. ' +
    'המסמך נושא תאריך ולוגו רשמי ומהווה הוכחה ישירה להסתרת מידע.',
  missingInformation: [],
  targetEntity: 'Ministry of Health',
  evidencePerspective: 'Internal Knowledge' as const,
  tierReasoning:
    'מדובר במסמך פנימי דלוף המוכיח ידיעה מוקדמת ומכוונת על הסתרת נתונים — עומד בהגדרת דרגה 1 ולא דרגה 2, שכן הוא אינו הצהרה פומבית אלא הנחיה פנימית.',
  evidenceTier: EVIDENCE_TIER.SMOKING_GUN,
  evidenceDate: '2021-03-10',
  keyFigures: ['ד"ר שרון אלרוי-פריס', "פרופ' מתי ברקוביץ'"],
  medicalConditions: ['דלקת שריר הלב'],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable' as const,
};

const ANECDOTAL_RESPONSE = {
  investigativeCategories: [],
  evidenceRole: 'Incriminating' as const,
  isRelevant: true,
  summary: 'פוסט ברשת חברתית מתאר לחץ מצד מעסיק להתחסן. אין תיעוד נוסף או פרטים מזהים.',
  missingInformation: ['שם המעסיק חסר', 'אין תאריך', 'אין תיעוד כתוב'],
  targetEntity: 'Unknown',
  evidencePerspective: 'Citizen Experience' as const,
  tierReasoning:
    'התוכן הוא פוסט ברשת חברתית ללא תיעוד כתוב או שם מעסיק — עומד בהגדרת דרגה 4 אנקדוטית בלבד.',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
  evidenceDate: 'Unknown',
  keyFigures: [],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable' as const,
};

const MATERIAL_RESPONSE = {
  investigativeCategories: ['COERCION_MANDATE'],
  evidenceRole: 'Incriminating' as const,
  isRelevant: true,
  summary:
    'הודעה רשמית לעיתונות מטעם רשות הבריאות כוללת טענות יעילות הסותרות נתוני ניסויים שפורסמו מאוחר יותר.',
  missingInformation: ['כתובת מקור המקורית חסרה'],
  targetEntity: 'FDA',
  evidencePerspective: 'Public Statement' as const,
  tierReasoning:
    'מדובר בהצהרה רשמית ופומבית של רגולטור — עומדת בהגדרת דרגה 2, אך אינה מסמך פנימי דלוף הנדרש לדרגה 1.',
  evidenceTier: EVIDENCE_TIER.MATERIAL,
  evidenceDate: '2021-08-23',
  keyFigures: ['אלברט בורלה'],
  medicalConditions: ['פגיעות נוירולוגיות', 'שיבושים במחזור החודשי'],
  statisticalClaims: ['יעיל ב-94% בקרב בני 55 ומעלה שהשתתפו בשלב השלישי בניסוי'],
  regulatoryMentions: ['ביום חמישי צפוי להתקבל אישור מה-FDA'],
  euaOmissionStatus: 'Omits EUA (Misleading)' as const,
};

const IRRELEVANT_RESPONSE = {
  investigativeCategories: [],
  evidenceRole: 'Incriminating' as const,
  isRelevant: false,
  summary: 'הטקסט שהוגש הוא ביקורת מסעדה ואינו רלוונטי לתביעה.',
  missingInformation: [],
  targetEntity: 'Unknown',
  evidencePerspective: 'Citizen Experience' as const,
  tierReasoning:
    'התוכן אינו קשור לתביעה — אין אפשרות לדרג אותו לפי קריטריוני הדרגות המשפטיות.',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
  evidenceDate: 'Unknown',
  keyFigures: [],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable' as const,
  rejectionReason:
    'הטקסט שהוגש הינו ביקורת מסעדה ואינו מכיל כל ראיה הנוגעת לעילות התביעה בעניין מדיניות הקורונה.',
};

const OPINION_PIECE_RESPONSE = {
  investigativeCategories: [],
  evidenceRole: 'Incriminating' as const,
  isRelevant: false,
  summary: 'מאמר דעה הקורא לאחריות ממשלתית ללא ראיות עובדתיות ספציפיות.',
  missingInformation: [],
  targetEntity: 'Unknown',
  evidencePerspective: 'Public Statement' as const,
  tierReasoning:
    'מאמר דעה בלבד ללא ראיות עובדתיות — אינו ניתן לדירוג לפי קריטריונים משפטיים.',
  evidenceTier: EVIDENCE_TIER.ANECDOTAL,
  evidenceDate: 'Unknown',
  keyFigures: [],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Not Applicable' as const,
  rejectionReason:
    'המאמר מהווה פרשנות עיתונאית ודעה אישית בלבד, ואינו מכיל ראיות עובדתיות ישירות הנדרשות לבית המשפט.',
};

const CONTEXT_ANCHOR_RESPONSE = {
  investigativeCategories: [],
  evidenceRole: 'ContextAnchor' as const,
  isRelevant: true,
  summary:
    'הודעת ה-FDA מיום 23.08.2021 מאשרת כי אישור ה-BLA המלא ניתן לחיסון רק במועד זה.',
  missingInformation: [],
  targetEntity: 'FDA',
  evidencePerspective: 'Public Statement' as const,
  tierReasoning:
    'מסמך רשמי ופומבי של רגולטור — עוגן עובדתי ברמת דרגה 2.',
  evidenceTier: EVIDENCE_TIER.MATERIAL,
  evidenceDate: '2021-08-23',
  keyFigures: [],
  medicalConditions: [],
  statisticalClaims: [],
  regulatoryMentions: [],
  euaOmissionStatus: 'Explicitly Mentions EUA' as const,
};

const TEST_FILE_BUFFER = Buffer.from('fake-image-content');
const TEST_MIME_JPEG = 'image/jpeg';
const TEST_MIME_PNG = 'image/png';
const TEST_MIME_PDF = 'application/pdf';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntakeAgent', () => {
  let agent: IntakeAgent;

  beforeEach(() => {
    agent = new IntakeAgent();
    jest.clearAllMocks();
  });

  // ---- Schema validation ---------------------------------------------------

  describe('IntakeOutputSchema', () => {
    it('accepts a valid Tier 1: Smoking Gun response', () => {
      expect(() => IntakeOutputSchema.parse(SMOKING_GUN_RESPONSE)).not.toThrow();
    });

    it('accepts a valid Tier 4: Anecdotal response', () => {
      expect(() => IntakeOutputSchema.parse(ANECDOTAL_RESPONSE)).not.toThrow();
    });

    it('rejects an invalid evidenceTier value', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceTier: 'Tier 99: Legendary' }),
      ).toThrow();
    });


    it('rejects a non-boolean isRelevant', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, isRelevant: 'yes' }),
      ).toThrow();
    });

    it('rejects a non-array missingInformation', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, missingInformation: 'Missing date' }),
      ).toThrow();
    });

    it('rejects a missing targetEntity field', () => {
      const { targetEntity: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('accepts a targetEntity of "Unknown" for unidentifiable entity', () => {
      expect(() => IntakeOutputSchema.parse(IRRELEVANT_RESPONSE)).not.toThrow();
    });

    it('accepts a YYYY-MM-DD evidenceDate', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceDate: '2021-03-10' }),
      ).not.toThrow();
    });

    it('accepts "Unknown" as evidenceDate when no date is visible', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceDate: 'Unknown' }),
      ).not.toThrow();
    });

    it('rejects a missing evidenceDate field', () => {
      const { evidenceDate: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('accepts an empty keyFigures array', () => {
      expect(() => IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, keyFigures: [] })).not.toThrow();
    });

    it('accepts a populated keyFigures array in Hebrew', () => {
      expect(() =>
        IntakeOutputSchema.parse({
          ...SMOKING_GUN_RESPONSE,
          keyFigures: ['ד"ר שרון אלרוי-פריס', 'אלברט בורלה'],
        }),
      ).not.toThrow();
    });

    it('rejects a non-array keyFigures', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, keyFigures: 'Dr. Sharon' }),
      ).toThrow();
    });

    it('rejects a missing keyFigures field', () => {
      const { keyFigures: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('accepts an empty medicalConditions array', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, medicalConditions: [] }),
      ).not.toThrow();
    });

    it('accepts a populated medicalConditions array in Hebrew', () => {
      expect(() =>
        IntakeOutputSchema.parse({
          ...SMOKING_GUN_RESPONSE,
          medicalConditions: ['דלקת שריר הלב', 'פגיעות נוירולוגיות'],
        }),
      ).not.toThrow();
    });

    it('rejects a non-array medicalConditions', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, medicalConditions: 'Myocarditis' }),
      ).toThrow();
    });

    it('rejects a missing medicalConditions field', () => {
      const { medicalConditions: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    // statisticalClaims
    it('accepts an empty statisticalClaims array', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, statisticalClaims: [] }),
      ).not.toThrow();
    });

    it('accepts a populated statisticalClaims array', () => {
      expect(() =>
        IntakeOutputSchema.parse({
          ...SMOKING_GUN_RESPONSE,
          statisticalClaims: ['יעיל ב-94% בקרב בני 55 ומעלה'],
        }),
      ).not.toThrow();
    });

    it('rejects a non-array statisticalClaims', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, statisticalClaims: '94%' }),
      ).toThrow();
    });

    it('rejects a missing statisticalClaims field', () => {
      const { statisticalClaims: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    // regulatoryMentions
    it('accepts an empty regulatoryMentions array', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, regulatoryMentions: [] }),
      ).not.toThrow();
    });

    it('accepts a populated regulatoryMentions array', () => {
      expect(() =>
        IntakeOutputSchema.parse({
          ...SMOKING_GUN_RESPONSE,
          regulatoryMentions: ['ביום חמישי צפוי להתקבל אישור מה-FDA'],
        }),
      ).not.toThrow();
    });

    it('rejects a non-array regulatoryMentions', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, regulatoryMentions: 'FDA approval' }),
      ).toThrow();
    });

    it('rejects a missing regulatoryMentions field', () => {
      const { regulatoryMentions: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('statisticalClaims and regulatoryMentions flow through analyzeText correctly', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);
      const result = await agent.analyzeText('Official FDA press release…', 'https://example.com');
      expect(result.statisticalClaims).toEqual(['יעיל ב-94% בקרב בני 55 ומעלה שהשתתפו בשלב השלישי בניסוי']);
      expect(result.regulatoryMentions).toEqual(['ביום חמישי צפוי להתקבל אישור מה-FDA']);
    });

    // euaOmissionStatus
    it('accepts all three valid euaOmissionStatus values', () => {
      const statuses = [
        'Omits EUA (Misleading)',
        'Explicitly Mentions EUA',
        'Not Applicable',
      ] as const;
      for (const status of statuses) {
        expect(() =>
          IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, euaOmissionStatus: status }),
        ).not.toThrow();
      }
    });

    it('rejects an invalid euaOmissionStatus value', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, euaOmissionStatus: 'Unknown' }),
      ).toThrow();
    });

    it('rejects a missing euaOmissionStatus field', () => {
      const { euaOmissionStatus: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('euaOmissionStatus="Omits EUA (Misleading)" flows through analyzeEvidence for a misleading article', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);
      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.euaOmissionStatus).toBe('Omits EUA (Misleading)');
    });

    it('euaOmissionStatus="Explicitly Mentions EUA" flows through for a transparent document', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(CONTEXT_ANCHOR_RESPONSE);
      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.euaOmissionStatus).toBe('Explicitly Mentions EUA');
    });

    // investigativeCategories — shared with ForensicAgent so that documents,
    // articles and whistleblower uploads land in the same filterable corpus as
    // forensic page diffs. Before this existed, every non-diff record was written
    // with an empty array and vanished from any filter by concern.
    it('rejects a missing investigativeCategories field', () => {
      const { investigativeCategories: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a category outside the shared taxonomy', () => {
      expect(() =>
        IntakeOutputSchema.parse({
          ...SMOKING_GUN_RESPONSE,
          investigativeCategories: ['GENERALLY_SUSPICIOUS'],
        }),
      ).toThrow();
    });

    it('accepts every category in the shared taxonomy', () => {
      expect(() =>
        IntakeOutputSchema.parse({
          ...SMOKING_GUN_RESPONSE,
          investigativeCategories: [...INVESTIGATIVE_CATEGORIES],
        }),
      ).not.toThrow();
    });

    it('flows investigativeCategories through analyzeEvidence', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);
      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.investigativeCategories).toEqual(['COERCION_MANDATE']);
    });

    it('flows investigativeCategories through analyzeText', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);
      const result = await agent.analyzeText('leaked memo text', 'https://example.com');
      expect(result.investigativeCategories).toEqual(['WITHHOLDING_INFORMATION']);
    });

    it('accepts an empty array — a ContextAnchor advances no concern by itself', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(CONTEXT_ANCHOR_RESPONSE);
      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.evidenceRole).toBe('ContextAnchor');
      expect(result.investigativeCategories).toEqual([]);
    });

    // tierReasoning
    it('accepts a valid tierReasoning string', () => {
      expect(() => IntakeOutputSchema.parse(SMOKING_GUN_RESPONSE)).not.toThrow();
      expect(IntakeOutputSchema.parse(SMOKING_GUN_RESPONSE).tierReasoning).toBe(
        SMOKING_GUN_RESPONSE.tierReasoning,
      );
    });

    it('rejects a missing tierReasoning field', () => {
      const { tierReasoning: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('rejects a non-string tierReasoning', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, tierReasoning: 42 }),
      ).toThrow();
    });

    // evidencePerspective
    it('accepts all three valid evidencePerspective values', () => {
      const perspectives = ['Internal Knowledge', 'Public Statement', 'Citizen Experience'] as const;
      for (const p of perspectives) {
        expect(() =>
          IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidencePerspective: p }),
        ).not.toThrow();
      }
    });

    it('rejects an invalid evidencePerspective value', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidencePerspective: 'Unknown Source' }),
      ).toThrow();
    });

    it('rejects a missing evidencePerspective field', () => {
      const { evidencePerspective: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });

    it('evidencePerspective flows through analyzeEvidence correctly', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);
      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.evidencePerspective).toBe('Internal Knowledge');
    });

    it('returns evidenceRole=ContextAnchor for a factual baseline document', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(CONTEXT_ANCHOR_RESPONSE);
      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);
      expect(result.evidenceRole).toBe('ContextAnchor');
      expect(result.isRelevant).toBe(true);
    });

    // rejectionReason
    it('accepts a response with rejectionReason populated when isRelevant is false', () => {
      expect(() => IntakeOutputSchema.parse(IRRELEVANT_RESPONSE)).not.toThrow();
    });

    it('accepts a response without rejectionReason when isRelevant is true (field is optional)', () => {
      expect(() => IntakeOutputSchema.parse(SMOKING_GUN_RESPONSE)).not.toThrow();
    });

    it('accepts a response with rejectionReason undefined when isRelevant is false', () => {
      const noReason = { ...IRRELEVANT_RESPONSE, rejectionReason: undefined };
      expect(() => IntakeOutputSchema.parse(noReason)).not.toThrow();
    });

    it('rejects a non-string rejectionReason', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...IRRELEVANT_RESPONSE, rejectionReason: 42 }),
      ).toThrow();
    });

    // evidenceRole
    it('accepts a valid ContextAnchor response', () => {
      expect(() => IntakeOutputSchema.parse(CONTEXT_ANCHOR_RESPONSE)).not.toThrow();
    });

    it('accepts both valid evidenceRole values', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceRole: 'Incriminating' }),
      ).not.toThrow();
      expect(() =>
        IntakeOutputSchema.parse({ ...CONTEXT_ANCHOR_RESPONSE, evidenceRole: 'ContextAnchor' }),
      ).not.toThrow();
    });

    it('rejects an invalid evidenceRole value', () => {
      expect(() =>
        IntakeOutputSchema.parse({ ...SMOKING_GUN_RESPONSE, evidenceRole: 'Neutral' }),
      ).toThrow();
    });

    it('rejects a missing evidenceRole field', () => {
      const { evidenceRole: _removed, ...invalid } = SMOKING_GUN_RESPONSE;
      expect(() => IntakeOutputSchema.parse(invalid)).toThrow();
    });
  });

  // ---- analyzeEvidence — happy paths --------------------------------------

  describe('analyzeEvidence', () => {
    it('returns a correctly typed Smoking Gun result including evidenceDate, keyFigures, medicalConditions', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(true);
      expect(result.evidenceTier).toBe(EVIDENCE_TIER.SMOKING_GUN);
      expect(result.missingInformation).toHaveLength(0);
      expect(result.targetEntity).toBe('Ministry of Health');
      expect(result.evidenceDate).toBe('2021-03-10');
      expect(result.keyFigures).toEqual(['ד"ר שרון אלרוי-פריס', "פרופ' מתי ברקוביץ'"]);
      expect(result.medicalConditions).toEqual(['דלקת שריר הלב']);
    });

    it('returns "Unknown" evidenceDate when no date is visible', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(ANECDOTAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceDate).toBe('Unknown');
    });

    it('returns a correctly typed Anecdotal result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(ANECDOTAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceTier).toBe(EVIDENCE_TIER.ANECDOTAL);
      expect(result.missingInformation).toHaveLength(3);
    });

    it('returns a correctly typed Material result', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.evidenceTier).toBe(EVIDENCE_TIER.MATERIAL);
    });

    it('returns tierReasoning alongside evidenceTier for CoT transparency', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.tierReasoning).toBeDefined();
      expect(typeof result.tierReasoning).toBe('string');
      expect(result.tierReasoning.length).toBeGreaterThan(0);
    });

    it('returns isRelevant=false for unrelated content', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(IRRELEVANT_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(false);
    });

    it('returns rejectionReason in Hebrew when the quality gate rejects unrelated content', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(IRRELEVANT_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(false);
      expect(result.rejectionReason).toBeDefined();
      expect(typeof result.rejectionReason).toBe('string');
      expect(result.rejectionReason!.length).toBeGreaterThan(0);
    });

    it('does not populate rejectionReason for relevant evidence', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const result = await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(result.isRelevant).toBe(true);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('invokes the chain with a system prompt and file content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: unknown;
      }>;
      expect(callArgs).toHaveLength(2);
      expect(callArgs[0].role).toBe('system');
      expect(callArgs[1].role).toBe('human');
      // Human content must be an array (file block + text prompt)
      expect(Array.isArray(callArgs[1].content)).toBe(true);
    });

    it('embeds the system prompt with Hebrew and date-hunting directives', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const systemContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{ role: string; content: string }>
      )[0].content;
      expect(systemContent).toContain('Hebrew');
      expect(systemContent).toContain('Senior Legal Analyst');
      expect(systemContent).toContain('YYYY-MM-DD');
      expect(systemContent).toContain('evidenceDate');
    });

    it('encodes JPEG as an image_url content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('image_url');
      expect(humanContent[0].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('encodes PNG as an image_url content block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_PNG);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('image_url');
      expect(humanContent[0].image_url?.url).toMatch(/^data:image\/png;base64,/);
    });

    it('encodes PDF as an image_url data-URI for Gemini (default provider)', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_PDF);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('image_url');
      expect(humanContent[0].image_url?.url).toMatch(/^data:application\/pdf;base64,/);
    });

    it('encodes PDF as a native document block when INTAKE_PROVIDER=anthropic', async () => {
      const original = process.env['INTAKE_PROVIDER'];
      process.env['INTAKE_PROVIDER'] = 'anthropic';
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_PDF);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; source?: { media_type: string } }>;
        }>
      )[1].content;
      expect(humanContent[0].type).toBe('document');
      expect(humanContent[0].source?.media_type).toBe('application/pdf');
      process.env['INTAKE_PROVIDER'] = original;
    });

    it('base64-encodes the file buffer correctly', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      const knownBuffer = Buffer.from('hello');
      await agent.analyzeEvidence(knownBuffer, TEST_MIME_JPEG);

      const url = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; image_url?: { url: string } }>;
        }>
      )[1].content[0].image_url?.url ?? '';
      expect(url).toContain(knownBuffer.toString('base64'));
    });

    it('makes exactly one chain invocation per analyzeEvidence call', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(SMOKING_GUN_RESPONSE);

      await agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG);

      expect(getMockInvoke(agent)).toHaveBeenCalledTimes(1);
    });

    it('propagates errors thrown by the chain', async () => {
      getMockInvoke(agent).mockRejectedValueOnce(new Error('API timeout'));

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow(
        'API timeout',
      );
    });

    it('throws a Zod error if the LLM returns a malformed object', async () => {
      getMockInvoke(agent).mockResolvedValueOnce({ isRelevant: 'not-a-boolean' });

      await expect(agent.analyzeEvidence(TEST_FILE_BUFFER, TEST_MIME_JPEG)).rejects.toThrow();
    });
  });

  // ---- analyzeText — URL scraping path ------------------------------------

  describe('analyzeText', () => {
    const TEST_URL = 'https://example.com/opinion-piece';
    const TEST_TEXT = 'In my opinion, the government handled the pandemic badly. Everyone should be angry.';

    it('returns isRelevant=false and rejectionReason for an opinion piece', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(OPINION_PIECE_RESPONSE);

      const result = await agent.analyzeText(TEST_TEXT, TEST_URL);

      expect(result.isRelevant).toBe(false);
      expect(result.rejectionReason).toBeDefined();
      expect(typeof result.rejectionReason).toBe('string');
      expect(result.rejectionReason!.length).toBeGreaterThan(0);
    });

    it('invokes the chain with a system prompt and source URL in the text block', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(OPINION_PIECE_RESPONSE);

      await agent.analyzeText(TEST_TEXT, TEST_URL);

      const callArgs = getMockInvoke(agent).mock.calls[0][0] as Array<{
        role: string;
        content: unknown;
      }>;
      expect(callArgs).toHaveLength(2);
      expect(callArgs[0].role).toBe('system');
      expect(callArgs[1].role).toBe('human');
    });

    it('includes the source URL in the human message text', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(OPINION_PIECE_RESPONSE);

      await agent.analyzeText(TEST_TEXT, TEST_URL);

      const humanContent = (
        getMockInvoke(agent).mock.calls[0][0] as Array<{
          role: string;
          content: Array<{ type: string; text?: string }>;
        }>
      )[1].content;
      const textBlock = humanContent.find((b) => b.type === 'text' && b.text?.includes(TEST_URL));
      expect(textBlock).toBeDefined();
    });

    it('returns a valid result for relevant scraped content', async () => {
      getMockInvoke(agent).mockResolvedValueOnce(MATERIAL_RESPONSE);

      const result = await agent.analyzeText('Official FDA press release text here…', TEST_URL);

      expect(result.isRelevant).toBe(true);
      expect(result.evidenceTier).toBe(EVIDENCE_TIER.MATERIAL);
      expect(result.rejectionReason).toBeUndefined();
    });

    it('propagates errors thrown by the chain', async () => {
      getMockInvoke(agent).mockRejectedValueOnce(new Error('Network error'));

      await expect(agent.analyzeText(TEST_TEXT, TEST_URL)).rejects.toThrow('Network error');
    });
  });

  // ---- EVIDENCE_TIER enum sanity ------------------------------------------

  describe('EVIDENCE_TIER constant', () => {
    it('has exactly four tiers', () => {
      expect(Object.keys(EVIDENCE_TIER)).toHaveLength(4);
    });

    it('tier values match the Zod enum exactly', () => {
      const zodEnum = IntakeOutputSchema.shape.evidenceTier.options as string[];
      const tierValues = Object.values(EVIDENCE_TIER) as string[];
      expect(tierValues.sort()).toEqual(zodEnum.sort());
    });
  });

  // ---- LangChain JSON Schema compatibility --------------------------------
  // Regression guard: verifies that every field in IntakeOutputSchema is
  // preserved by LangChain's Zod → JSON Schema conversion. Any field that is
  // silently dropped will be absent from the model's function-calling schema,
  // causing Zod parse failures on every request.
  //
  // Common silent-drop causes: Zod v4 ZodPipe (.transform()/.pipe()) applied
  // at the field level. If this test fails, move the transform to post-parse
  // logic in analyzeEvidence / analyzeText instead.

  describe('IntakeOutputSchema — LangChain JSON Schema compatibility', () => {
    it('preserves all required fields through LangChain zodToJsonSchema conversion', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { toJsonSchema } = require('@langchain/core/utils/json_schema') as {
        toJsonSchema: (s: unknown) => { properties?: Record<string, unknown> };
      };
      const jsonSchema = toJsonSchema(IntakeOutputSchema);
      const schemaFields = Object.keys(IntakeOutputSchema.shape);
      const jsonSchemaFields = Object.keys(jsonSchema.properties ?? {});

      for (const field of schemaFields) {
        expect(jsonSchemaFields).toContain(field);
      }
    });

    it('generates exactly the set of fields defined in the schema shape', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { toJsonSchema } = require('@langchain/core/utils/json_schema') as {
        toJsonSchema: (s: unknown) => { properties?: Record<string, unknown> };
      };
      const jsonSchema = toJsonSchema(IntakeOutputSchema);
      const schemaFields = Object.keys(IntakeOutputSchema.shape).sort();
      const jsonSchemaFields = Object.keys(jsonSchema.properties ?? {}).sort();

      expect(jsonSchemaFields).toEqual(schemaFields);
    });
  });
});
