// ---------------------------------------------------------------------------
// Surfacing what a summary's classifier version does not say on its face.
//
// Until v3-self-contained-summary the classification prompt told the model to
// "EXPLICITLY cross-reference" correlated evidence inside legalSignificance —
// and that prose becomes Evidence.summary verbatim. So a record's public text
// could assert facts drawn from a DIFFERENT record, and every thesis-stage agent
// read it as an independent observation. A thesis could then be corroborated by
// its own premise, reflected back through a record it cites.
//
// Which rows are affected is derivable from classifierVersion, not assumed.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: { evidence: { findMany: jest.fn() } },
}));

import { prisma } from '../src/lib/prisma';
import { SUMMARY_VERSION } from '../src/lib/classifierVersion';
import { loadSummaryCaveat, formatSummaryCaveat } from '../src/lib/summaryProvenance';

function row(fileHash: string, summaryVersion: string | null) {
  return { fileHash, urlVersionDiff: { summaryVersion } };
}

describe('loadSummaryCaveat', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns nothing for an empty corpus without querying', async () => {
    expect(await loadSummaryCaveat([])).toBeNull();
    expect(prisma.evidence.findMany).not.toHaveBeenCalled();
  });

  it('flags rows written under a prompt that permitted cross-referencing', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([row('0xold', 'v2-legacy-summary')]);

    const caveat = await loadSummaryCaveat([{ fileHash: '0xold' }]);

    expect(caveat).toEqual({ affected: ['0xold'], versions: ['v2-legacy-summary'] });
  });

  it('treats a row with no summaryVersion as affected, not as fine', async () => {
    // null means the summary predates the self-contained rule. Defaulting the
    // unknown to "safe" is how a legacy row passes as a checked one.
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([row('0xlegacy', null)]);

    const caveat = await loadSummaryCaveat([{ fileHash: '0xlegacy' }]);

    expect(caveat?.affected).toEqual(['0xlegacy']);
    expect(caveat?.versions).toEqual(['pre-self-contained']);
  });

  it('says nothing once every row is self-contained', async () => {
    // This code is expected to become dead, and that is the point: it describes
    // history rather than compensating for an ongoing defect.
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([row('0xnew', SUMMARY_VERSION)]);

    expect(await loadSummaryCaveat([{ fileHash: '0xnew' }])).toBeNull();
  });

  it('warns about the affected rows only, not the whole corpus', async () => {
    (prisma.evidence.findMany as jest.Mock).mockResolvedValue([
      row('0xold', 'v2-legacy-summary'),
      row('0xnew', SUMMARY_VERSION),
    ]);

    const caveat = await loadSummaryCaveat([{ fileHash: '0xold' }, { fileHash: '0xnew' }]);

    expect(caveat?.affected).toEqual(['0xold']);
  });
});

describe('formatSummaryCaveat', () => {
  const caveat = { affected: ['0xold'], versions: ['v2-legacy-summary'] };

  it('renders nothing when there is nothing to warn about', () => {
    expect(formatSummaryCaveat(null, 'en')).toBe('');
    expect(formatSummaryCaveat(null, 'he')).toBe('');
  });

  it.each(['en', 'he'] as const)('names the affected records and the version in %s', (lang) => {
    const out = formatSummaryCaveat(caveat, lang);
    expect(out).toContain('0xold');
    expect(out).toContain('v2-legacy-summary');
  });

  it.each(['en', 'he'] as const)('forbids counting such a claim as independent support in %s', (lang) => {
    // The warning has to say BOTH things. "May be unverified" alone still lets a
    // model count the record as a second source agreeing with the first.
    const out = formatSummaryCaveat(caveat, lang);
    expect(out).toMatch(lang === 'en' ? /UNVERIFIED/ : /לא מאומתת/);
    expect(out).toMatch(lang === 'en' ? /independent support/ : /אישוש\s*\n?\s*עצמאי/);
  });
});
