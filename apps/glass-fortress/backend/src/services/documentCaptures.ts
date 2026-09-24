import type { Document } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { digestOf, equalsCapture } from './documentPredicates';

// ---------------------------------------------------------------------------
// EQUALS_CAPTURE(d), READ ON DEMAND — docs/gf-document-flows.md A3 :1383–:1384. Moved here unchanged from
// `addDocument.ts` at document step 31: the document-anchoring function reads it too (A3 :1366's capture arm, as ruled
// 2026-09-24), and `addDocument.ts` imports that function — so the read has its own module rather than a cycle.
// ---------------------------------------------------------------------------

/** EQUALS_CAPTURE(d), read on demand (A3 :1383) — the snapshots whose stored digest is this DOC_ID's. */
export async function capturesEqualTo(key: string): Promise<{ url: string; capture: string } | null> {
  const snapshots = await prisma.urlSnapshot.findMany({
    where: { documentHash: digestOf(key) },
    select: { documentHash: true, waybackTimestamp: true, trackedUrl: { select: { url: true } } },
  });
  return equalsCapture(
    { docId: key } as Document,
    snapshots.flatMap((s) => (s.waybackTimestamp === null ? [] : [{ documentHash: s.documentHash, url: s.trackedUrl.url, capture: s.waybackTimestamp }])),
  );
}
