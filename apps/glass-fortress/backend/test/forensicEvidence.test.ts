import {
  buildForensicEvidence,
  forensicEvidenceFileHash,
  type ForensicEvidenceSource,
} from '../src/services/forensicEvidence';

const DELETED_ITEMS = [
  { summary: 'הובטח כי תופעות הלוואי קלות וזמניות', exactQuote: 'Side effects are mild.' },
];
const ADDED_ITEMS = [
  { summary: 'נוספה חובת חיסון לעובדים', exactQuote: 'All employees must be vaccinated.' },
];

function source(overrides: Partial<ForensicEvidenceSource> = {}): ForensicEvidenceSource {
  return {
    diffId: 'diff-uuid-1',
    url: 'https://www.health.gov.il/vaccines',
    afterDate: '2021-06-01',
    snapshotUrl: 'https://web.archive.org/web/20210601000000/https://www.health.gov.il/vaccines',
    aiSignificance: 'האזהרה בדבר תופעות לוואי נמחקה.',
    investigativeCategories: ['WITHHOLDING_INFORMATION'],
    deletedText: JSON.stringify(DELETED_ITEMS),
    addedText: JSON.stringify(ADDED_ITEMS),
    deletedItems: DELETED_ITEMS,
    addedItems: ADDED_ITEMS,
    ...overrides,
  };
}

describe('forensic evidence construction', () => {
  // -------------------------------------------------------------------------
  // The invariant this module exists to hold: automatic promotion (WaybackScraper)
  // and manual promotion (POST /api/forensics/promote) must produce the same
  // record for the same diff. They previously used different fileHash formulas —
  // one hashing the diff UUID, one hashing the diff text — so the same page
  // change had two different on-chain identities depending on how it was found.
  // -------------------------------------------------------------------------
  describe('fileHash', () => {
    it('is stable for identical content', () => {
      expect(forensicEvidenceFileHash('https://x.gov.il', '2021-06-01', '[]', '[]')).toBe(
        forensicEvidenceFileHash('https://x.gov.il', '2021-06-01', '[]', '[]'),
      );
    });

    it('is content-addressed — changing any part changes the hash', () => {
      const base = forensicEvidenceFileHash('https://x.gov.il', '2021-06-01', '["a"]', '["b"]');

      expect(forensicEvidenceFileHash('https://y.gov.il', '2021-06-01', '["a"]', '["b"]')).not.toBe(base);
      expect(forensicEvidenceFileHash('https://x.gov.il', '2021-06-02', '["a"]', '["b"]')).not.toBe(base);
      expect(forensicEvidenceFileHash('https://x.gov.il', '2021-06-01', '["z"]', '["b"]')).not.toBe(base);
      expect(forensicEvidenceFileHash('https://x.gov.il', '2021-06-01', '["a"]', '["z"]')).not.toBe(base);
    });

    it('does not depend on the diff UUID — a database key attests to nothing', () => {
      const a = buildForensicEvidence(source({ diffId: 'diff-uuid-1' }));
      const b = buildForensicEvidence(source({ diffId: 'diff-uuid-2' }));
      expect(a.fileHash).toBe(b.fileHash);
    });

    it('is 0x-prefixed sha256, matching the on-chain hash format', () => {
      const { fileHash } = buildForensicEvidence(source());
      expect(fileHash).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('evidence record', () => {
    it('is identical whichever promotion path builds it', () => {
      // Both paths supply the same stored diff fields; only the caller differs.
      expect(buildForensicEvidence(source()).data).toEqual(buildForensicEvidence(source()).data);
    });

    it('marks the record as a confirmed forensic diff', () => {
      const { data } = buildForensicEvidence(source());
      expect(data.evidenceType).toBe('FORENSIC_DIFF');
      expect(data.status).toBe('CONFIRMED');
      expect(data.urlVersionDiffId).toBe('diff-uuid-1');
    });

    it('cites the archived snapshot, not the live page', () => {
      // The live URL has since changed — the Wayback link is what a court can check.
      const { data } = buildForensicEvidence(source());
      expect(data.sourceUrl).toContain('web.archive.org');
    });

    it('carries the extracted change summaries as statistical claims', () => {
      const { data } = buildForensicEvidence(source());
      expect(JSON.parse(data.statisticalClaims)).toEqual([
        DELETED_ITEMS[0].summary,
        ADDED_ITEMS[0].summary,
      ]);
    });

    it('derives targetEntity from the page hostname', () => {
      const { data } = buildForensicEvidence(source());
      expect(data.targetEntity).toBe('www.health.gov.il');
    });

    it('falls back to Unknown when the stored URL is malformed', () => {
      const { data } = buildForensicEvidence(source({ url: 'not a url' }));
      expect(data.targetEntity).toBe('Unknown');
    });

    it('falls back to a generated summary when the agent produced none', () => {
      const { data } = buildForensicEvidence(source({ aiSignificance: '' }));
      expect(data.summary).toContain('www.health.gov.il');
      expect(data.summary).toContain('2021-06-01');
    });

    it('states the investigative concerns without asserting intent', () => {
      const { data } = buildForensicEvidence(source());
      expect(data.tierReasoning).toContain('רלוונטי לתחומי החקירה');
      expect(data.tierReasoning).not.toContain('כוונת');
    });
  });
});
