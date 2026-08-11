import { KeyFigureStatus, KeyFigureType, PatternCategory } from '../../src/generated/prisma';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockCaseFindUnique = jest.fn();
const mockCourtFindUniqueOrThrow = jest.fn();

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    case: { findUnique: mockCaseFindUnique },
    court: { findUniqueOrThrow: mockCourtFindUniqueOrThrow },
    keyFigure: {
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

const mockSuggestAllegations = jest.fn();
jest.mock('../../src/services/PatternDetectionService', () => ({
  PatternDetectionService: jest.fn().mockImplementation(() => ({
    suggestAllegations: mockSuggestAllegations,
  })),
}));

const mockRegisterAllegation = jest.fn();
jest.mock('../../src/services/AllegationService', () => ({
  AllegationService: jest.fn().mockImplementation(() => ({
    registerAllegation: mockRegisterAllegation,
  })),
}));

import { FigureService, NoCaseCourtError } from '../../src/services/FigureService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COURT = { id: 'court-jerusalem', name: 'בית משפט לענייני משפחה', city: 'ירושלים', district: 'ירושלים' };
const FIGURE_PENDING = { id: 'fig-1', name: 'Judge Test', type: KeyFigureType.JUDGE, status: KeyFigureStatus.PENDING, organization: null, courtId: COURT.id, nominatingCaseIds: [] };
const FIGURE_ALREADY_NOMINATED = { ...FIGURE_PENDING, nominatingCaseIds: ['case-1'] };

const SUGGESTION_NEW = { patternCategory: PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING, evidence: 'test', alreadyRegistered: false };
const SUGGESTION_OLD = { patternCategory: PatternCategory.CRIMINAL_EXONERATION_IGNORED, evidence: 'test', alreadyRegistered: true };

function detectionResult(suggestions: { patternCategory: PatternCategory; evidence: string; alreadyRegistered: boolean }[]) {
  return { caseId: 'case-1', figureId: 'fig-1', courtId: COURT.id, suggestions, domainsAnalyzed: [], note: '' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCaseFindUnique.mockResolvedValue({ courtId: COURT.id });
  mockCourtFindUniqueOrThrow.mockResolvedValue(COURT);
  mockUpdate.mockResolvedValue(FIGURE_PENDING);
  mockRegisterAllegation.mockResolvedValue({ allegation: { id: 'al-1', allegationHash: 'abc' }, isDuplicate: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FigureService.nominateAndCommit', () => {
  const service = new FigureService();

  it('creates a new figure when none exists', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([]));

    const result = await service.nominateAndCommit('case-1', {
      name: 'Judge Test', type: KeyFigureType.JUDGE,
    });

    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Judge Test', nominatingCaseIds: ['case-1'] }) });
    expect(result.figure.id).toBe('fig-1');
  });

  it('reuses an existing figure without creating a duplicate', async () => {
    mockFindFirst.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([]));

    await service.nominateAndCommit('case-1', {
      name: 'Judge Test', type: KeyFigureType.JUDGE,
    });

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('registers new allegations and skips already-registered ones', async () => {
    mockFindFirst.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([SUGGESTION_NEW, SUGGESTION_OLD]));

    const result = await service.nominateAndCommit('case-1', {
      name: 'Judge Test', type: KeyFigureType.JUDGE,
    });

    expect(mockRegisterAllegation).toHaveBeenCalledTimes(1);
    expect(mockRegisterAllegation).toHaveBeenCalledWith(
      expect.objectContaining({ patternCategory: PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING }),
    );
    expect(result.newAllegationsCreated).toBe(1);
    expect(result.patterns).toHaveLength(2);
  });

  it('returns newAllegationsCreated=0 when all patterns are already registered', async () => {
    mockFindFirst.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([SUGGESTION_OLD]));

    const result = await service.nominateAndCommit('case-1', {
      name: 'Judge Test', type: KeyFigureType.JUDGE,
    });

    expect(mockRegisterAllegation).not.toHaveBeenCalled();
    expect(result.newAllegationsCreated).toBe(0);
  });

  it('does not modify figure status — activation is a manual legal-review step', async () => {
    mockFindFirst.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([SUGGESTION_NEW]));

    const result = await service.nominateAndCommit('case-1', {
      name: 'Judge Test', type: KeyFigureType.JUDGE,
    });

    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: expect.anything() }) }),
    );
    expect(result.figure.status).toBe(KeyFigureStatus.PENDING);
  });

  it('adds caseId to nominatingCaseIds of an existing figure', async () => {
    mockFindFirst.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([]));

    await service.nominateAndCommit('case-1', { name: 'Judge Test', type: KeyFigureType.JUDGE });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: FIGURE_PENDING.id },
      data: { nominatingCaseIds: { push: 'case-1' } },
    });
  });

  it('does not push caseId again if already present in nominatingCaseIds', async () => {
    mockFindFirst.mockResolvedValue(FIGURE_ALREADY_NOMINATED);
    mockSuggestAllegations.mockResolvedValue(detectionResult([]));

    await service.nominateAndCommit('case-1', { name: 'Judge Test', type: KeyFigureType.JUDGE });

    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nominatingCaseIds: expect.anything() }) }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('passes organization to findOrCreate when provided', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([]));

    await service.nominateAndCommit('case-1', {
      name: 'Worker Test', type: KeyFigureType.SOCIAL_WORKER, organization: 'לשכת רווחה',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ organization: 'לשכת רווחה' }),
    });
  });

  it('reads court from case and uses it for figure matching', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(FIGURE_PENDING);
    mockSuggestAllegations.mockResolvedValue(detectionResult([]));

    await service.nominateAndCommit('case-1', { name: 'Judge Test', type: KeyFigureType.JUDGE });

    expect(mockCaseFindUnique).toHaveBeenCalledWith({ where: { id: 'case-1' }, select: { courtId: true } });
    expect(mockCourtFindUniqueOrThrow).toHaveBeenCalledWith({ where: { id: COURT.id } });
  });

  it('throws NoCaseCourtError when case has no court set', async () => {
    mockCaseFindUnique.mockResolvedValue({ courtId: null });

    await expect(
      service.nominateAndCommit('case-1', { name: 'Judge Test', type: KeyFigureType.JUDGE }),
    ).rejects.toBeInstanceOf(NoCaseCourtError);
  });
});
