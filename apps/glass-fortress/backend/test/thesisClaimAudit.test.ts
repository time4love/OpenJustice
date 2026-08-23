// ---------------------------------------------------------------------------
// audit_thesis_claims over a thesis body.
//
// The two assertions the plan singles out are here: a body asserting an act ON
// a date the archive never captured is flagged, and a body stating an interval
// between two ADJACENT captures passes. Both were real errors in a real
// thesis, and both were caught by hand through a shell rather than by any tool.
//
// The archive is stubbed at the capture-index boundary so the capture history
// is stated explicitly by each test — the thing under test is the reasoning
// over that history, not the CDX client, which has its own tests.
// ---------------------------------------------------------------------------

jest.mock('../src/lib/prisma', () => ({
  prisma: {
    thesis: { findUnique: jest.fn() },
    thesisMention: { findMany: jest.fn() },
    evidence: { findMany: jest.fn() },
    trackedUrl: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}));
jest.mock('../src/services/archiveVerification', () => ({
  fetchCaptureIndex: jest.fn(),
  checkPhraseAtCaptures: jest.fn(),
}));

import { prisma } from '../src/lib/prisma';
import {
  auditThesisClaims,
  originUrlFromWayback,
  type AuditThesisClaimsResult,
} from '../src/services/thesisClaimAudit';
import {
  checkPhraseAtCaptures,
  fetchCaptureIndex,
} from '../src/services/archiveVerification';

const findThesis = prisma.thesis.findUnique as jest.Mock;
const findMentions = prisma.thesisMention.findMany as jest.Mock;
const findEvidence = prisma.evidence.findMany as jest.Mock;
const findTrackedMany = prisma.trackedUrl.findMany as jest.Mock;
const findTrackedOne = prisma.trackedUrl.findFirst as jest.Mock;
const mockIndex = fetchCaptureIndex as jest.Mock;
const mockCheck = checkPhraseAtCaptures as jest.Mock;

const URL = 'https://corona.health.gov.il/vaccine-for-covid/';

/** A TipTap document holding one paragraph of the given text. */
function doc(text: string): unknown {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function capture(timestamp: string): {
  waybackTimestamp: string;
  date: string;
  digest: null;
  statusCode: null;
  snapshotUrl: string;
} {
  return {
    waybackTimestamp: timestamp,
    date: `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`,
    digest: null,
    statusCode: null,
    snapshotUrl: `https://web.archive.org/web/${timestamp}/${URL}`,
  };
}

function givenBody(text: string): void {
  findThesis.mockResolvedValue({
    id: 'thesis-1',
    headVersionId: 'version-1',
    headVersion: { id: 'version-1', userContent: doc(text) },
  });
}

function givenCaptures(timestamps: string[]): void {
  mockIndex.mockResolvedValue({
    available: true,
    captures: timestamps.map(capture),
    truncated: false,
  });
}

function ok(result: AuditThesisClaimsResult): Extract<AuditThesisClaimsResult, { status: 'OK' }> {
  if (result.status !== 'OK') throw new Error(`expected OK, got ${result.status}`);
  return result;
}

beforeEach(() => {
  findMentions.mockResolvedValue([{ type: 'TRACKED_URL', refId: 'tracked-1' }]);
  findEvidence.mockResolvedValue([]);
  findTrackedMany.mockResolvedValue([{ id: 'tracked-1', url: URL }]);
  mockCheck.mockResolvedValue([]);
});

describe('dated acts', () => {
  it('flags an act asserted ON a date the archive never captured, and names the interval', async () => {
    givenBody('הטענה הוסרה מהעמוד ב-05.08.2022.');
    givenCaptures(['20220801010101', '20220906232435']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.summary.datesFlagged).toBe(1);
    const [finding] = result.dates;
    expect(finding.flagged).toBe(true);
    expect(finding.actVerbs).toEqual(['הוסרה']);
    expect(finding.pages[0].verdict).toBe('NO_CAPTURE_ON_DATE');
    expect(finding.pages[0].previousCapture?.date).toBe('2022-08-01');
    expect(finding.pages[0].nextCapture?.date).toBe('2022-09-06');
    expect(finding.note).toContain('2022-08-01');
    expect(finding.note).toContain('2022-09-06');
  });

  it('does not flag the same date when a capture was taken that day', async () => {
    givenBody('הטענה הוסרה מהעמוד ב-05.08.2022.');
    givenCaptures(['20220805111109']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.summary.datesFlagged).toBe(0);
    expect(result.dates[0].pages[0].verdict).toBe('CAPTURE_EXISTS_ON_DATE');
    // Still says what a capture can and cannot establish — it shows state at an
    // instant, never the moment of an edit.
    expect(result.dates[0].note).toContain('never the moment of an edit');
  });

  it('does not flag a sentence that describes a state rather than asserting an act', async () => {
    givenBody('הטענה נעדרה מהעמוד נכון ל-05.08.2022.');
    givenCaptures(['20220801010101', '20220906232435']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.dates).toHaveLength(1);
    expect(result.dates[0].actVerbs).toEqual([]);
    expect(result.dates[0].flagged).toBe(false);
  });

  it('reports the DD.MM ambiguity rather than resolving it silently', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    givenCaptures(['20220805111109']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.dates[0].dayMonthAmbiguous).toBe(true);
    expect(result.dates[0].note).toContain('DD.MM.YYYY');
  });
});

describe('intervals', () => {
  it('passes an interval between two adjacent captures', async () => {
    givenBody('השינוי אירע בין 05.08.2022 ל-06.09.2022.');
    givenCaptures(['20220805111109', '20220906232435']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.summary.intervalsFlagged).toBe(0);
    expect(result.intervals[0].pages[0].verdict).toBe('ADJACENT');
    expect(result.intervals[0].pages[0].endpointsCaptured).toEqual({ from: true, to: true });
  });

  it('flags an interval the archive can narrow, and counts the captures inside it', async () => {
    givenBody('השינוי אירע בין 05.08.2022 ל-06.09.2022.');
    givenCaptures(['20220805111109', '20220820010101', '20220906232435']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.summary.intervalsFlagged).toBe(1);
    expect(result.intervals[0].pages[0].verdict).toBe('CAPTURES_BETWEEN');
    expect(result.intervals[0].pages[0].capturesStrictlyBetween).toEqual(['20220820010101']);
    expect(result.intervals[0].note).toContain('wider than the archive requires');
  });
});

describe('quotations', () => {
  it('checks a quotation against the captures on the dates its sentence names', async () => {
    givenBody('ב-05.08.2022 הופיעה הטענה "נמצאו יעילים ובטוחים לשימוש" בעמוד.');
    givenCaptures(['20220805111109']);
    mockCheck.mockResolvedValue([
      {
        waybackTimestamp: '20220805111109',
        date: '2022-08-05',
        snapshotUrl: 'x',
        rawUrl: 'y',
        outcome: 'CHECKED',
        presentInRawArchive: true,
        presentInPlatformExtraction: false,
        presentInStoredSnapshot: false,
        extractionDivergence: true,
      },
    ]);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(mockCheck).toHaveBeenCalledWith(
      URL,
      'tracked-1',
      [expect.objectContaining({ waybackTimestamp: '20220805111109' })],
      'נמצאו יעילים ובטוחים לשימוש',
      expect.any(Map),
    );
    // Divergence outranks presence: the phrase IS on the page, and this
    // platform's extraction cannot see it. Reporting a bare PRESENT would hide
    // exactly the condition that produced a false claim in a real thesis.
    expect(result.quotations[0].verdict).toBe('EXTRACTION_DIVERGENCE');
    expect(result.summary.quotationsDiverged).toBe(1);
  });

  it('says a quotation is absent only after actually checking a capture', async () => {
    givenBody('ב-05.08.2022 הופיעה הטענה "נמצאו יעילים ובטוחים לשימוש" בעמוד.');
    givenCaptures(['20220805111109']);
    mockCheck.mockResolvedValue([
      {
        waybackTimestamp: '20220805111109',
        date: '2022-08-05',
        snapshotUrl: 'x',
        rawUrl: 'y',
        outcome: 'CHECKED',
        presentInRawArchive: false,
        presentInPlatformExtraction: false,
        presentInStoredSnapshot: null,
        extractionDivergence: false,
      },
    ]);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.quotations[0].verdict).toBe('ABSENT');
  });

  it('reports a failed fetch as NOT_CHECKED, never as an absent quotation', async () => {
    givenBody('ב-05.08.2022 הופיעה הטענה "נמצאו יעילים ובטוחים לשימוש" בעמוד.');
    givenCaptures(['20220805111109']);
    mockCheck.mockResolvedValue([
      {
        waybackTimestamp: '20220805111109',
        date: '2022-08-05',
        snapshotUrl: 'x',
        rawUrl: 'y',
        outcome: 'FETCH_FAILED',
        reason: 'HTTP 503',
      },
    ]);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.quotations[0].verdict).toBe('NOT_CHECKED');
    expect(result.quotations[0].reason).toContain('not evidence that the quotation is absent');
    expect(result.summary.quotationsAbsent).toBe(0);
  });

  it('says so when a quoted sentence names no date to check it against', async () => {
    givenBody('הטענה "נמצאו יעילים ובטוחים לשימוש" הופיעה בעמוד.');
    givenCaptures(['20220805111109']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.quotations[0].verdict).toBe('NO_CAPTURE_REFERENCED');
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('stops at the fetch budget and says which quotations went unchecked', async () => {
    givenBody('ב-05.08.2022 הופיעה "נמצאו יעילים ובטוחים לשימוש" וגם "אין סיכון מוגבר לילדים בריאים".');
    givenCaptures(['20220805111109']);
    mockCheck.mockResolvedValue([
      {
        waybackTimestamp: '20220805111109',
        date: '2022-08-05',
        snapshotUrl: 'x',
        rawUrl: 'y',
        outcome: 'CHECKED',
        presentInRawArchive: true,
        presentInPlatformExtraction: true,
        presentInStoredSnapshot: true,
        extractionDivergence: false,
      },
    ]);

    const result = ok(await auditThesisClaims('thesis-1', { maxPhraseChecks: 1 }));

    expect(result.quotations[0].verdict).toBe('PRESENT');
    expect(result.quotations[1].verdict).toBe('NOT_CHECKED');
    expect(result.quotations[1].reason).toContain('budget');
  });
});

describe('scope and unavailable states', () => {
  it('refuses to audit a thesis that does not exist', async () => {
    findThesis.mockResolvedValue(null);
    expect((await auditThesisClaims('nope')).status).toBe('THESIS_NOT_FOUND');
  });

  it('refuses to audit a thesis with no head version', async () => {
    findThesis.mockResolvedValue({ id: 'thesis-1', headVersionId: null, headVersion: null });
    expect((await auditThesisClaims('thesis-1')).status).toBe('NO_HEAD_VERSION');
  });

  it('says nothing was checked when the version cites no tracked page', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    findMentions.mockResolvedValue([]);
    findTrackedMany.mockResolvedValue([]);

    const result = await auditThesisClaims('thesis-1');

    expect(result.status).toBe('NO_TRACKED_PAGE_IN_SCOPE');
    if (result.status !== 'NO_TRACKED_PAGE_IN_SCOPE') throw new Error('unreachable');
    expect(result.message).toContain('Nothing was checked');
  });

  it('lists a page whose capture index could not be fetched instead of omitting it', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    mockIndex.mockResolvedValue({ available: false, reason: 'HTTP 503', offline: true });

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.pagesUnavailable).toEqual([{ url: URL, reason: 'HTTP 503' }]);
    expect(result.dates[0].pages[0].verdict).toBe('ARCHIVE_UNAVAILABLE');
  });

  it('does NOT flag a dated act when the archive could not be reached at all', async () => {
    // The oldest defect in this codebase, in its most tempting form: with no
    // capture index, "no capture exists on that date" and "we never looked" are
    // the same absence, and flagging would turn an outage into a finding
    // against the researcher.
    givenBody('הטענה הוסרה ב-05.08.2022.');
    mockIndex.mockResolvedValue({ available: false, reason: 'HTTP 503', offline: true });

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.dates[0].flagged).toBe(false);
    expect(result.summary.datesFlagged).toBe(0);
    expect(result.dates[0].note).toContain('Not checked');
  });

  it('does NOT call an interval adjacent when the archive could not be reached', async () => {
    givenBody('השינוי אירע בין 05.08.2022 ל-06.09.2022.');
    mockIndex.mockResolvedValue({ available: false, reason: 'HTTP 503', offline: true });

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.intervals[0].flagged).toBe(false);
    expect(result.intervals[0].note).toContain('Not checked');
    expect(result.intervals[0].note).not.toContain('tightest interval');
  });

  it('says the coverage was partial when only some pages could be reached', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    findTrackedMany.mockResolvedValue([
      { id: 'tracked-1', url: URL },
      { id: 'tracked-2', url: 'https://example.gov.il/other/' },
    ]);
    mockIndex
      .mockResolvedValueOnce({ available: true, captures: [capture('20220805111109')], truncated: false })
      .mockResolvedValueOnce({ available: false, reason: 'HTTP 503', offline: true });

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.pagesUnavailable).toHaveLength(1);
    expect(result.dates[0].note).toContain('could not be reached');
  });

  it('derives scope from forensic evidence citations when no tracked URL is mentioned', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    givenCaptures(['20220805111109']);
    findMentions.mockResolvedValue([{ type: 'EVIDENCE', refId: 'hash-1' }]);
    findEvidence.mockResolvedValue([
      { sourceUrl: `https://web.archive.org/web/20220805111109/${URL}` },
    ]);

    ok(await auditThesisClaims('thesis-1'));

    expect(findTrackedMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ url: { in: [URL] } }] },
      }),
    );
  });

  it('audits only the named page when one is given', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    givenCaptures(['20220805111109']);
    findTrackedOne.mockResolvedValue({ id: 'tracked-1', url: URL });

    ok(await auditThesisClaims('thesis-1', { url: URL }));

    expect(findMentions).not.toHaveBeenCalled();
  });

  it('states what it did not check in its own result', async () => {
    givenBody('הטענה הוסרה ב-05.08.2022.');
    givenCaptures(['20220805111109']);

    const result = ok(await auditThesisClaims('thesis-1'));

    expect(result.notChecked.join(' ')).toContain('שישה שבועות');
    expect(result.scopeStatement).toContain('instrument, not a gate');
  });
});

describe('originUrlFromWayback', () => {
  it('recovers the origin URL from a viewer URL', () => {
    expect(originUrlFromWayback(`https://web.archive.org/web/20220805111109/${URL}`)).toBe(URL);
  });

  it('recovers it from an id_ URL too', () => {
    expect(originUrlFromWayback(`https://web.archive.org/web/20220805111109id_/${URL}`)).toBe(URL);
  });

  it('returns null for a URL that is not a Wayback capture', () => {
    expect(originUrlFromWayback('https://example.com/report.pdf')).toBeNull();
  });
});

describe('partial coverage', () => {
  it('does not call a quotation ABSENT when the fetch budget stopped it mid-check', async () => {
    // Two dates in one sentence, budget for one capture. Not finding the text in
    // the capture that WAS checked says nothing about the one that was not.
    givenBody('בין 05.08.2022 ל-06.09.2022 הופיעה הטענה "נמצאו יעילים ובטוחים לשימוש" בעמוד.');
    givenCaptures(['20220805111109', '20220906232435']);
    mockCheck.mockResolvedValue([
      {
        waybackTimestamp: '20220805111109',
        date: '2022-08-05',
        snapshotUrl: 'x',
        rawUrl: 'y',
        outcome: 'CHECKED',
        presentInRawArchive: false,
        presentInPlatformExtraction: false,
        presentInStoredSnapshot: null,
        extractionDivergence: false,
      },
    ]);

    const result = ok(await auditThesisClaims('thesis-1', { maxPhraseChecks: 1 }));

    expect(result.quotations[0].verdict).toBe('NOT_CHECKED');
    expect(result.quotations[0].reason).toContain('not absent from the');
    expect(result.summary.quotationsAbsent).toBe(0);
  });

  it('still reports PRESENT under a partial check, and says the check was partial', async () => {
    givenBody('בין 05.08.2022 ל-06.09.2022 הופיעה הטענה "נמצאו יעילים ובטוחים לשימוש" בעמוד.');
    givenCaptures(['20220805111109', '20220906232435']);
    mockCheck.mockResolvedValue([
      {
        waybackTimestamp: '20220805111109',
        date: '2022-08-05',
        snapshotUrl: 'x',
        rawUrl: 'y',
        outcome: 'CHECKED',
        presentInRawArchive: true,
        presentInPlatformExtraction: true,
        presentInStoredSnapshot: true,
        extractionDivergence: false,
      },
    ]);

    const result = ok(await auditThesisClaims('thesis-1', { maxPhraseChecks: 1 }));

    // One capture containing the text is enough to establish presence.
    expect(result.quotations[0].verdict).toBe('PRESENT');
    expect(result.quotations[0].reason).toContain('budget');
  });
});
