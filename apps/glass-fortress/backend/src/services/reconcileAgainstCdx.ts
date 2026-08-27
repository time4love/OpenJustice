import { prisma } from '../lib/prisma';
import { fetchCaptureBytes } from '../lib/archiveHttp';
import { deriveText } from '../lib/captureDocument';
import { cdxDigestOf, verifyAgainstCdx } from './verifyAgainstCdx';

/**
 * Reconcile every stored capture against the Archive's published digest, in ONE
 * pass, writing only where something actually changes.
 *
 * WHY ALL 83 AND NOT THE 7 THAT FAIL VERIFICATION. Touching only the failures
 * would leave the corpus in TWO partial states at once:
 *
 *   textExtractionVersion    7 at v2, 76 at v1
 *   documentContentEncoding  7 populated, 76 NULL
 *
 * The second is the worse of the pair: 76 rows would say "we do not know what
 * encoding was served" when it is observable in a single fetch. Partial states
 * are what this entire level is about; creating two of them to save four minutes
 * would be the same trade that produced every defect above.
 *
 * STILL FILL-AND-REPAIR, NEVER A BLANKET OVERWRITE. Each row is compared and
 * written only if it differs, and a payload is replaced only when the Archive
 * itself settles which side is wrong:
 *
 *   stored == cdx                      bytes are right. Fill a missing encoding,
 *                                      re-derive text under the current version.
 *   stored != cdx, fresh == cdx        our stored bytes were wrong → REPAIR.
 *   stored != cdx, fresh != cdx        the Archive's replay disagrees with its
 *                                      own index → LEAVE THE BYTES, record it,
 *                                      and do not write an encoding that
 *                                      describes bytes we did not keep.
 *
 * THE SUPERSET CHECK. Re-deriving text under v2 for rows whose bytes did not
 * change must produce byte-identical text, because `inflateDocument` is a no-op
 * on uncompressed input. Any movement there means v2 is NOT a faithful superset
 * of v1 — a bug found here rather than in production. It is reported as
 * `textChangedWithoutByteChange`, and a non-zero value is a stop condition.
 */

export type ReconcileAction =
  | 'UNCHANGED'
  | 'REPAIRED'
  | 'ENCODING_FILLED'
  | 'TEXT_REDERIVED'
  | 'ARCHIVE_CONTRADICTED'
  | 'FAILED';

export interface ReconcileOutcome {
  waybackTimestamp: string;
  action: ReconcileAction;
  cdxDigest: string | null;
  storedDigest: string;
  fetchedDigest?: string;
  contentEncoding?: string | null;
  bytesChanged: boolean;
  /** Text moved even though the bytes did not — the superset check failing. */
  textChangedWithoutByteChange?: boolean;
  error?: string;
}

export interface ReconcileReport {
  url: string;
  dryRun: boolean;
  captures: number;
  repaired: number;
  encodingFilled: number;
  textRederived: number;
  archiveContradicted: number;
  unchanged: number;
  failed: number;
  /** STOP CONDITION. Non-zero means v2 is not a faithful superset of v1. */
  textChangedWithoutByteChange: number;
  outcomes: ReconcileOutcome[];
}

const FETCH_DELAY_MS = 1_500;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function reconcileAgainstCdx(opts: {
  url: string;
  dryRun: boolean;
}): Promise<ReconcileReport> {
  const verification = await verifyAgainstCdx(opts.url);

  const stored = new Map(
    (
      await prisma.urlSnapshot.findMany({
        where: { id: { in: verification.verdicts.map((v) => v.snapshotId) } },
        select: { id: true, document: true, text: true, textExtractionVersion: true },
      })
    ).map((r) => [r.id, r]),
  );

  const outcomes: ReconcileOutcome[] = [];

  for (const verdict of verification.verdicts) {
    const row = stored.get(verdict.snapshotId);
    if (!row) continue;

    if (opts.dryRun) {
      outcomes.push({
        waybackTimestamp: verdict.waybackTimestamp,
        action: verdict.verdict === 'CONTRADICTED' ? 'REPAIRED' : 'TEXT_REDERIVED',
        cdxDigest: verdict.cdxDigest,
        storedDigest: verdict.ourDigest,
        bytesChanged: verdict.verdict === 'CONTRADICTED',
      });
      continue;
    }

    try {
      const { bytes, contentType, contentEncoding } = await fetchCaptureBytes(
        opts.url,
        verdict.waybackTimestamp,
      );
      const fetchedDigest = cdxDigestOf(bytes);
      const storedIsRight = verdict.ourDigest === verdict.cdxDigest;
      const fetchedIsRight = fetchedDigest === verdict.cdxDigest;

      if (!storedIsRight && !fetchedIsRight) {
        // The Archive's replay disagrees with the Archive's own index. Our bytes
        // are not demonstrably wrong, so they stay — overwriting would swap one
        // unverifiable payload for another and destroy the evidence of it. The
        // encoding is NOT written either: it describes the bytes we just fetched
        // and did not keep.
        outcomes.push({
          waybackTimestamp: verdict.waybackTimestamp,
          action: 'ARCHIVE_CONTRADICTED',
          cdxDigest: verdict.cdxDigest,
          storedDigest: verdict.ourDigest,
          fetchedDigest,
          bytesChanged: false,
        });
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Which bytes this row will hold afterwards, and therefore what its text
      // and encoding must describe.
      const keepFetched = !storedIsRight && fetchedIsRight;
      const payload = keepFetched ? bytes : row.document;
      const encoding = keepFetched ? contentEncoding : (verdict.contentEncoding ?? contentEncoding);
      const derived = deriveText(payload, contentType, encoding);

      const textMoved = derived.text !== row.text;
      const versionMoved = derived.textExtractionVersion !== row.textExtractionVersion;
      const encodingMoved = (verdict.contentEncoding ?? null) !== (encoding ?? null);

      if (!keepFetched && !textMoved && !versionMoved && !encodingMoved) {
        outcomes.push({
          waybackTimestamp: verdict.waybackTimestamp,
          action: 'UNCHANGED',
          cdxDigest: verdict.cdxDigest,
          storedDigest: verdict.ourDigest,
          fetchedDigest,
          contentEncoding: encoding,
          bytesChanged: false,
        });
        await sleep(FETCH_DELAY_MS);
        continue;
      }

      // Guarded on the digest verification observed, so a row changed since then
      // is skipped rather than overwritten.
      const updated = await prisma.$executeRaw`
        UPDATE "UrlSnapshot"
        SET "document" = ${payload},
            "documentHash" = ${cdxDigestOf(payload)},
            "documentContentType" = ${contentType},
            "documentContentEncoding" = ${encoding},
            "text" = ${derived.text},
            "textHash" = ${derived.textHash},
            "textExtractionVersion" = ${derived.textExtractionVersion}
        WHERE "id" = ${verdict.snapshotId}
      `;

      const action: ReconcileAction = keepFetched
        ? 'REPAIRED'
        : encodingMoved && !textMoved
          ? 'ENCODING_FILLED'
          : 'TEXT_REDERIVED';

      outcomes.push({
        waybackTimestamp: verdict.waybackTimestamp,
        action: updated === 1 ? action : 'FAILED',
        cdxDigest: verdict.cdxDigest,
        storedDigest: verdict.ourDigest,
        fetchedDigest,
        contentEncoding: encoding,
        bytesChanged: keepFetched,
        // THE SUPERSET CHECK: text moving while the bytes did not means v2 is not
        // a faithful superset of v1.
        textChangedWithoutByteChange: !keepFetched && textMoved,
        ...(updated === 1 ? {} : { error: 'row changed since verification — nothing written' }),
      });
    } catch (err) {
      outcomes.push({
        waybackTimestamp: verdict.waybackTimestamp,
        action: 'FAILED',
        cdxDigest: verdict.cdxDigest,
        storedDigest: verdict.ourDigest,
        bytesChanged: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await sleep(FETCH_DELAY_MS);
  }

  const count = (a: ReconcileAction): number => outcomes.filter((o) => o.action === a).length;

  return {
    url: opts.url,
    dryRun: opts.dryRun,
    captures: outcomes.length,
    repaired: count('REPAIRED'),
    encodingFilled: count('ENCODING_FILLED'),
    textRederived: count('TEXT_REDERIVED'),
    archiveContradicted: count('ARCHIVE_CONTRADICTED'),
    unchanged: count('UNCHANGED'),
    failed: count('FAILED'),
    textChangedWithoutByteChange: outcomes.filter((o) => o.textChangedWithoutByteChange === true)
      .length,
    outcomes,
  };
}
