import { createHash } from 'crypto';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { ARCHIVED_CAPTURES_ONLY } from '../lib/archivedCaptures';
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

export interface CdxVerificationReport {
  url: string;
  captures: number;
  verified: number;
  contradicted: number;
  /** The Archive has no digest for this capture — a verdict about the CHECK. */
  unavailable: number;
  verdicts: CdxVerdict[];
  /** True only when every capture reproduces its published digest. */
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

  const contradicted = verdicts.filter((v) => v.verdict === 'CONTRADICTED').length;
  const unavailable = verdicts.filter((v) => v.verdict === 'UNAVAILABLE').length;

  return {
    url,
    captures: verdicts.length,
    verified: verdicts.filter((v) => v.verdict === 'VERIFIED').length,
    contradicted,
    unavailable,
    verdicts,
    // Deliberately requires zero of BOTH. An unavailable check is not a pass,
    // and a level that counted it as one would be complete by definition again.
    levelOneComplete: verdicts.length > 0 && contradicted === 0 && unavailable === 0,
  };
}
