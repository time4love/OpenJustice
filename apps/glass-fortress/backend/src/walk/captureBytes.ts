import type { Prisma } from '@prisma/client';
import { DECODABLE_CAPTURE_SELECT, type DecodableCapture } from '../lib/captureDocument';
import type { LoadedRow } from './rows';

// ---------------------------------------------------------------------------
// THE BYTES A CAPTURE HOLDS — one implementation, two readers.
//
// A2 says where a capture's bytes live and it is not one place: the HELD BODY
// of a PENDING_JUDGEMENT row, the UrlSnapshot's document of an ACQUIRED one,
// and — ruled 2026-09-06, Q7 — the snapshot again for a PENDING_JUDGEMENT row
// that names one and holds no body, which is a stop on a STORED capture (the
// re-walk's Gate 1' on a stale ACQUIRED row) keeping its snapshotId rather than
// holding the same bytes twice.
//
// IT LIVES HERE BECAUSE IT HAS TWO CALLERS. The marking route reads a capture's
// bytes to render and preview it; `get_rule_history` reads them to re-derive
// what a rule removed on each capture it matched (flows A5, amended
// 2026-09-07). Two copies of this would be the repository's dominant defect
// shape, and the copy that drifts is the one that decides what a researcher is
// shown about a rule they are about to trust.
//
// A ROW THAT CLAIMS BYTES IT DOES NOT HOLD IS A WALK DEFECT, AND A DEFECT
// THROWS — never a refusal (the recurring ruling of steps 3–4, restated
// 2026-09-05). A 409 would tell the researcher the capture is unmarkable when
// the truth is that the walk wrote a row it cannot serve; a null would tell
// `get_rule_history` the capture holds no body, which is a different fact and a
// lie about this one. Every other outcome holds nothing by construction, and
// null is that fact.
// ---------------------------------------------------------------------------

/**
 * The bytes of a capture whose row claims to hold some, as the decoder reads
 * them; null for an outcome that holds none (UNFETCHED, UNSERVABLE, IDENTICAL,
 * DUPLICATE, SKIPPED — the 2026-09-02 body ruling).
 *
 * Takes the client so a caller inside a transaction reads its own snapshot.
 */
export async function bytesOf(db: Prisma.TransactionClient, row: LoadedRow): Promise<DecodableCapture | null> {
  const t = row.waybackTimestamp;
  if (row.outcome === 'PENDING_JUDGEMENT' && row.heldBody !== null) {
    return {
      document: Buffer.from(row.heldBody),
      documentContentType: row.contentType,
      documentContentEncoding: row.contentEncoding,
    };
  }
  if (row.outcome === 'PENDING_JUDGEMENT' || row.outcome === 'ACQUIRED') {
    if (row.snapshotId === null) {
      throw new Error(
        row.outcome === 'ACQUIRED'
          ? `Walk defect: capture ${t} is ACQUIRED with no snapshotId.`
          : `Walk defect: capture ${t} is PENDING_JUDGEMENT with neither a heldBody nor a snapshotId.`,
      );
    }
    const snapshot = await db.urlSnapshot.findUnique({ where: { id: row.snapshotId }, select: DECODABLE_CAPTURE_SELECT });
    if (snapshot === null) throw new Error(`Walk defect: capture ${t} names snapshot ${row.snapshotId}, which does not exist.`);
    return snapshot;
  }
  return null;
}
