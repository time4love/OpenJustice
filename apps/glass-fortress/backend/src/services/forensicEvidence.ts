import { ethers } from 'ethers';
import { canonicaliseTargetEntity } from '../lib/targetEntity';
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
  /** The archived capture before the change — identity input. */
  beforeSnapshot: SnapshotIdentity;
  /** The archived capture after it — identity input. */
  afterSnapshot: SnapshotIdentity;
  /** Exactly the JSON persisted in UrlVersionDiff.deletedText */
  deletedText: string;
  /** Exactly the JSON persisted in UrlVersionDiff.addedText */
  addedText: string;
  deletedItems: DiffItem[];
  addedItems: DiffItem[];
}

/** One archived capture, as the identity function needs it. */
export interface SnapshotIdentity {
  /** YYYYMMDDHHMMSS — the capture's unique Wayback identifier. */
  waybackTimestamp: string;
  /** SHA-256 of the archived page text, anchored on-chain in its own right. */
  contentHash: string;
}

/**
 * The identity inputs for one side, or a loud failure.
 *
 * A missing snapshot link means the identity cannot be computed. Throwing is the
 * only honest response: a fallback would produce a hash from partial data that
 * looks exactly like a real one, and this value gets registered on-chain.
 */
export function requireSnapshotIdentity(
  snapshot: { waybackTimestamp: string; contentHash: string } | null | undefined,
  side: 'before' | 'after',
): SnapshotIdentity {
  if (!snapshot) {
    throw new Error(
      `Cannot compute evidence identity: the ${side} snapshot is not linked to this diff.`,
    );
  }
  return { waybackTimestamp: snapshot.waybackTimestamp, contentHash: snapshot.contentHash };
}

/**
 * Content-addressed identity for evidence derived from a page change.
 *
 * Computed from the two archived captures the change sits between, and nothing
 * else. An outsider can reproduce it end to end:
 *
 *   1. open https://web.archive.org/web/{waybackTimestamp}/{url} for each side
 *   2. hash the page text — that must equal contentHash, which is itself
 *      registered on-chain, so step 2 is independently checkable
 *   3. hash the five fields below in order
 *
 * No model is involved at any step, which is the whole point.
 *
 * WHAT THIS REPLACED, AND WHY
 *
 * The previous identity hashed url + afterDate + deletedText + addedText, where
 * the latter two are JSON of the classifier's EXTRACTED ITEMS. Three of the four
 * fields in each item are model output, and reclassification rewrites all of it.
 * Measured on one record: 8,515 characters hashed, of which 2,853 were verbatim
 * quotes — the rest was model prose, categories and punctuation.
 *
 * So the identity was never reproducible. Item-level classification (which added
 * two keys to every item) changed the serialisation deterministically, and the
 * classifier's non-determinism would have changed it anyway. Five of seven
 * anchored records could no longer be rederived from the database; their hashes
 * attested to documents that exist nowhere, which is what a random database key
 * does — the exact thing content-addressing was chosen to avoid.
 *
 * Snapshots cannot drift: UrlSnapshot rows are upserted with `update: {}` and
 * their text is never rewritten. Reclassify as often as you like; this does not
 * move.
 *
 * The timestamp is included alongside the content hash on purpose. A page that
 * reverts exactly — and this corpus contains claims that oscillate — would
 * otherwise give two distinct changes the same identity.
 */
export function forensicEvidenceFileHash(
  url: string,
  before: SnapshotIdentity,
  after: SnapshotIdentity,
): string {
  const content = [
    url,
    before.waybackTimestamp,
    before.contentHash,
    after.waybackTimestamp,
    after.contentHash,
  ].join('\n');
  return ethers.sha256(Buffer.from(content, 'utf8'));
}

export function buildForensicEvidence(source: ForensicEvidenceSource) {
  const fileHash = forensicEvidenceFileHash(source.url, source.beforeSnapshot, source.afterSnapshot);

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
      evidenceRole: 'Incriminating',
      investigativeCategories: source.investigativeCategories,
      targetEntity,
      // This path sets targetEntity to the page's HOSTNAME, which is why the
      // vault holds seven records naming corona.health.gov.il — a source, not an
      // entity. The resolver's domain rule is the primary route here, not an
      // edge case.
      canonicalTargetEntity: canonicaliseTargetEntity(targetEntity),
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
