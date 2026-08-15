import { ethers } from 'ethers';
import type { DiffItem } from './ForensicAgent';
import {
  forensicTierReasoning,
  type InvestigativeCategory,
} from '../lib/investigativeCategories';

// ---------------------------------------------------------------------------
// Turning a UrlVersionDiff into an Evidence record.
//
// Two paths do this: WaybackScraper promotes automatically when a scan finds a
// classified change, and POST /api/forensics/promote lets a researcher promote
// one by hand. They must produce the same record — same identity, same fields —
// or the same page change means different things depending on how it was found.
// ---------------------------------------------------------------------------

export interface ForensicEvidenceSource {
  /** UrlVersionDiff.id */
  diffId: string;
  /** The tracked page's live URL */
  url: string;
  /** Date of the snapshot in which the change appeared: YYYY-MM-DD */
  afterDate: string;
  /** Wayback viewer link for the "after" snapshot — the citable archived source */
  snapshotUrl: string;
  /** ForensicAgent's Hebrew explanation */
  aiSignificance: string;
  investigativeCategories: InvestigativeCategory[];
  /** Exactly the JSON persisted in UrlVersionDiff.deletedText */
  deletedText: string;
  /** Exactly the JSON persisted in UrlVersionDiff.addedText */
  addedText: string;
  deletedItems: DiffItem[];
  addedItems: DiffItem[];
}

/**
 * Content-addressed identity for evidence derived from a page change.
 *
 * Hashes what the change WAS — the page, the date, and the extracted text on both
 * sides. Deliberately not the UrlVersionDiff UUID: that is a random database key
 * and hashing it would attest to nothing. This hash is registered on-chain and
 * keys the vector store, so it has to mean something.
 */
export function forensicEvidenceFileHash(
  url: string,
  afterDate: string,
  deletedText: string,
  addedText: string,
): string {
  const content = [url, afterDate, deletedText, addedText].join('\n');
  return ethers.sha256(Buffer.from(content, 'utf8'));
}

/**
 * The Evidence row for a forensic diff — one definition, both promotion paths.
 *
 * Returned as plain data rather than written here so each caller keeps its own
 * concerns: the scraper upserts and tolerates failure, the route registers
 * on-chain first and reports HTTP status.
 */
export function buildForensicEvidence(source: ForensicEvidenceSource) {
  const fileHash = forensicEvidenceFileHash(
    source.url,
    source.afterDate,
    source.deletedText,
    source.addedText,
  );

  let targetEntity = 'Unknown';
  try {
    targetEntity = new URL(source.url).hostname;
  } catch {
    // Malformed stored URL — 'Unknown' is the honest value
  }

  const summary =
    source.aiSignificance ||
    `שינוי שקט זוהה בדף ${targetEntity} בתאריך ${source.afterDate}.`;

  return {
    fileHash,
    data: {
      fileHash,
      evidenceType: 'FORENSIC_DIFF' as const,
      status: 'CONFIRMED' as const,
      evidenceRole: 'Incriminating',
      investigativeCategories: source.investigativeCategories,
      targetEntity,
      evidenceTier: 'Tier 2: Material',
      evidencePerspective: 'Public Statement',
      tierReasoning: forensicTierReasoning(
        source.url,
        source.afterDate,
        source.investigativeCategories,
      ),
      summary,
      evidenceDate: source.afterDate,
      medicalConditions: '[]',
      // The forensic agent's per-chunk summaries — the substance of the change.
      statisticalClaims: JSON.stringify(
        [...source.deletedItems, ...source.addedItems].map((item) => item.summary),
      ),
      regulatoryMentions: '[]',
      euaOmissionStatus: 'Not Applicable',
      sourceUrl: source.snapshotUrl,
      urlVersionDiffId: source.diffId,
    },
  };
}
