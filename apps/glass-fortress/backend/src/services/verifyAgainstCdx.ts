import { createHash } from 'crypto';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY } from '../lib/archivedCaptures';
import { sha256Bytes } from '../lib/captureDocument';
import { CaptureProvenance } from '@prisma/client';
import { CDX_MAX_RETRIES, CDX_TIMEOUT_MS, CDX_USER_AGENT, withRetry } from '../lib/archiveHttp';

/**
 * LEVEL 1'S COMPLETION CRITERION: `sha1b32(document) == cdx.digest`, every capture.
 *
 * This replaces a structural test with an external, falsifiable one, and that
 * distinction is the whole reason it exists. `document NOT NULL` says a value is
 * present; it cannot say the value is what the source served. Level 1 was
 * declared done on that basis once and was wrong.
 *
 * The Internet Archive publishes, for every capture, a SHA-1 of the response
 * body it recorded, base32-encoded, in its CDX index. That is an INDEPENDENT
 * WITNESS to bytes we hold — the only kind of check that could have caught
 * either of this level's two reopenings, both of which were a derivative stored
 * under the name of the original:
 *
 *   1. `rawText` — htmlToText's output stored as "the document". Visible in the
 *      code, invisible in the schema.
 *   2. `document` — axios's transparently INFLATED bytes stored as "the payload
 *      as served". Invisible in both, because `responseType: 'arraybuffer'`
 *      looks like it settles the question.
 *
 * The second was found only because this comparison was attempted. 76 of 83
 * matched — the Archive served those uncompressed, so the inflate was a no-op —
 * and that read as a green result from a mechanism that never checked. The 7 it
 * served gzipped did not match.
 *
 * A residual mismatch AFTER the fix is then genuinely the Archive's: its replay
 * disagreeing with its own index. That can be stated with evidence rather than
 * inferred, which is what the earlier "the mismatch is on the Archive's side"
 * claim did wrongly — two fetches through one path agree by construction, so
 * reproducibility proves determinism, never fidelity.
 *
 * READ-ONLY. One CDX query, no capture fetches, no writes.
 */

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, unpadded — the encoding the CDX index uses for its digests. */
export function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** The digest the Archive would publish for these bytes. */
export function cdxDigestOf(bytes: Buffer): string {
  return base32(createHash('sha1').update(bytes).digest());
}

export interface CdxVerdict {
  snapshotId: string;
  waybackTimestamp: string;
  /** VERIFIED — our payload reproduces the Archive's own digest. */
  verdict: 'VERIFIED' | 'CONTRADICTED' | 'UNAVAILABLE';
  cdxDigest: string | null;
  ourDigest: string;
  bytes: number;
  contentEncoding: string | null;
}

/**
 * THE INTERNAL AXIS: does a row agree with itself — `sha256(document) ==
 * documentHash`?
 *
 * SCOPED TO EVERY CAPTURE, NOT ONLY ARCHIVED ONES, and that is the point. The
 * external axis is archive-scoped because only an archived capture HAS a
 * published digest to be checked against. This invariant has nothing to do with
 * the Archive: it says a row's integrity hash is a hash of that row's bytes,
 * which must hold for a DIRECT or ASSERTED capture exactly as for a WAYBACK one.
 * Folding it into the archive-scoped query would have made it silently skip
 * every non-archived capture the moment Level 2 Phase B creates the first one.
 *
 * Never UNAVAILABLE, and that is a property of the check rather than an
 * omission: both sides are held locally and both columns are NOT NULL, so the
 * comparison can always be made and there is no third state to collapse into a
 * pass.
 */
export interface InternalVerdict {
  snapshotId: string;
  capturedAt: Date;
  provenance: CaptureProvenance;
  verdict: 'VERIFIED' | 'CONTRADICTED';
  /** What the row stores. */
  storedDocumentHash: string;
  /** What its own bytes hash to. */
  recomputedDocumentHash: string;
}

export interface CdxVerificationReport {
  url: string;
  captures: number;
  verified: number;
  contradicted: number;
  /** The Archive has no digest for this capture — a verdict about the CHECK. */
  unavailable: number;
  /** Captures checked on the internal axis — EVERY capture, any provenance. */
  internallyChecked: number;
  /** Captures whose stored documentHash is NOT sha256 of their own bytes. */
  internallyContradicted: number;
  verdicts: CdxVerdict[];
  /** The internal axis, one entry per capture regardless of provenance. */
  internalVerdicts: InternalVerdict[];
  /**
   * True only when every capture reproduces its published digest AND agrees
   * with itself.
   */
  levelOneComplete: boolean;
}

export async function verifyAgainstCdx(url: string): Promise<CdxVerificationReport> {
  const tracked = await prisma.trackedUrl.findUnique({ where: { url }, select: { id: true } });
  if (!tracked) throw new Error(`No tracked URL found for: ${url}`);

  const cdxUrl =
    `http://web.archive.org/cdx/search/cdx` +
    `?url=${encodeURIComponent(url)}` +
    `&output=json&fl=timestamp,digest&collapse=digest`;

  const response = await withRetry(
    () =>
      axios.get<unknown[][]>(cdxUrl, {
        timeout: CDX_TIMEOUT_MS,
        headers: { 'User-Agent': CDX_USER_AGENT },
      }),
    { maxRetries: CDX_MAX_RETRIES },
  );

  const published = new Map<string, string>();
  const rows = response.data;
  if (Array.isArray(rows)) {
    for (const row of (rows.slice(1) as string[][])) {
      const [timestamp, digest] = row;
      if (timestamp && digest) published.set(timestamp, digest);
    }
  }

  const captures = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id, ...ARCHIVED_CAPTURES_ONLY },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      waybackTimestamp: true,
      document: true,
      documentContentEncoding: true,
    },
  });

  const verdicts: CdxVerdict[] = [];
  for (const capture of captures) {
    const timestamp = capture.waybackTimestamp ?? '';
    const cdxDigest = published.get(timestamp) ?? null;
    const ourDigest = cdxDigestOf(capture.document);
    verdicts.push({
      snapshotId: capture.id,
      waybackTimestamp: timestamp,
      // UNAVAILABLE is a verdict about the CHECK, never about the capture (§3):
      // the Archive publishing no digest says nothing about our bytes, and
      // counting it as VERIFIED would be a silent pass wearing a real one's face.
      verdict:
        cdxDigest === null ? 'UNAVAILABLE' : cdxDigest === ourDigest ? 'VERIFIED' : 'CONTRADICTED',
      cdxDigest,
      ourDigest,
      bytes: capture.document.length,
      contentEncoding: capture.documentContentEncoding,
    });
  }

  // A SECOND QUERY, DELIBERATELY UNSCOPED BY PROVENANCE. See InternalVerdict.
  const allCaptures = await prisma.urlSnapshot.findMany({
    where: { trackedUrlId: tracked.id },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      capturedAt: true,
      provenance: true,
      document: true,
      documentHash: true,
    },
  });
  const internalVerdicts: InternalVerdict[] = allCaptures.map((c) => {
    const recomputedDocumentHash = sha256Bytes(c.document);
    return {
      snapshotId: c.id,
      capturedAt: c.capturedAt,
      provenance: c.provenance,
      verdict: recomputedDocumentHash === c.documentHash ? 'VERIFIED' : 'CONTRADICTED',
      storedDocumentHash: c.documentHash,
      recomputedDocumentHash,
    };
  });

  const contradicted = verdicts.filter((v) => v.verdict === 'CONTRADICTED').length;
  const unavailable = verdicts.filter((v) => v.verdict === 'UNAVAILABLE').length;
  const internallyContradicted = internalVerdicts.filter(
    (v) => v.verdict === 'CONTRADICTED',
  ).length;

  return {
    url,
    captures: verdicts.length,
    verified: verdicts.filter((v) => v.verdict === 'VERIFIED').length,
    contradicted,
    unavailable,
    internallyChecked: internalVerdicts.length,
    internallyContradicted,
    verdicts,
    internalVerdicts,
    // Deliberately requires zero of ALL THREE.
    //
    // An unavailable check is not a pass, or the level would be complete by
    // definition again. And the internal axis is here because its absence was
    // load-bearing: this criterion was external only, so it recomputed its
    // digest from `document` and never read `documentHash` — which let
    // reconcileAgainstCdx write the CDX digest into that column, on all 83 rows
    // in BOTH environments, while 83/83 VERIFIED stayed true throughout.
    //
    // A level can verify its claim about the outside world and never verify its
    // claim about itself. External is the stronger axis and it is not the only
    // one needed.
    levelOneComplete:
      verdicts.length > 0 &&
      contradicted === 0 &&
      unavailable === 0 &&
      internallyContradicted === 0,
  };
}
