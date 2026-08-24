import {
  buildForensicEvidence,
  forensicEvidenceFileHash,
  type ForensicEvidenceSource,
} from '../src/services/forensicEvidence';

const DELETED_ITEMS = [
  {
    summary: 'הובטח כי תופעות הלוואי קלות וזמניות',
    exactQuote: 'Side effects are mild.',
    investigativeCategories: ['SAFETY_CLAIM_ALTERATION' as const],
    relocated: false,
  },
];
const ADDED_ITEMS = [
  {
    summary: 'נוספה חובת חיסון לעובדים',
    exactQuote: 'All employees must be vaccinated.',
    investigativeCategories: ['COERCION_MANDATE' as const],
    relocated: false,
  },
];

function source(overrides: Partial<ForensicEvidenceSource> = {}): ForensicEvidenceSource {
  return {
    diffId: 'diff-uuid-1',
    url: 'https://www.health.gov.il/vaccines',
    afterDate: '2021-06-01',
    beforeSnapshot: { waybackTimestamp: '20210501000000', contentHash: '0xbefore' },
    afterSnapshot: { waybackTimestamp: '20210601000000', contentHash: '0xafter' },
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
    const B = { waybackTimestamp: '20210501000000', contentHash: '0xbefore' };
    const A = { waybackTimestamp: '20210601000000', contentHash: '0xafter' };

    it('is stable for identical captures', () => {
      expect(forensicEvidenceFileHash('https://x.gov.il', B, A)).toBe(
        forensicEvidenceFileHash('https://x.gov.il', B, A),
      );
    });

    it('changes when any capture identity changes', () => {
      const base = forensicEvidenceFileHash('https://x.gov.il', B, A);

      expect(forensicEvidenceFileHash('https://y.gov.il', B, A)).not.toBe(base);
      expect(forensicEvidenceFileHash('https://x.gov.il', { ...B, contentHash: '0xz' }, A)).not.toBe(base);
      expect(forensicEvidenceFileHash('https://x.gov.il', B, { ...A, contentHash: '0xz' })).not.toBe(base);
    });

    it('distinguishes an exact page revert by timestamp', () => {
      // This corpus contains claims that oscillate, so a page CAN return to a
      // previous state. Two distinct changes between identical texts would
      // otherwise share one identity.
      const later = { ...A, waybackTimestamp: '20211201000000' };
      expect(forensicEvidenceFileHash('https://x.gov.il', B, later)).not.toBe(
        forensicEvidenceFileHash('https://x.gov.il', B, A),
      );
    });

    it('does NOT change when the extracted items are rewritten', () => {
      // The property the whole design exists for, and the one the previous
      // identity lacked. It hashed url + afterDate + deletedText + addedText,
      // where the latter two are JSON of the classifier's items — mostly model
      // prose. Reclassification rewrote them, and five anchored records stopped
      // being recomputable from the database.
      //
      // Snapshots cannot drift: UrlSnapshot rows are upserted with `update: {}`
      // and their text is never rewritten.
      const withItems = buildForensicEvidence(source({ deletedText: '["original"]' }));
      const reclassified = buildForensicEvidence(
        source({ deletedText: '["completely different extraction"]', aiSignificance: 'ניסוח אחר לגמרי' }),
      );

      expect(reclassified.fileHash).toBe(withItems.fileHash);
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

    it('marks the record as a forensic diff and links it to its source diff', () => {
      const { data } = buildForensicEvidence(source());
      expect(data.evidenceType).toBe('FORENSIC_DIFF');
      expect(data.urlVersionDiffId).toBe('diff-uuid-1');
    });

    it('asserts no status of its own', () => {
      // Status claims the record is anchored on-chain, and only the caller that
      // did (or did not) anchor it can make that claim. This used to default to
      // CONFIRMED and be overridden by both callers — dead in practice, and the
      // worst possible value for a future caller to inherit by forgetting.
      const { data } = buildForensicEvidence(source());
      expect('status' in data).toBe(false);
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
