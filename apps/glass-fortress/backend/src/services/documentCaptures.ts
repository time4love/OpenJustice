import type { Document } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { digestOf, equalsCapture } from './documentPredicates';

// ---------------------------------------------------------------------------
// EQUALS_CAPTURE(d), READ ON DEMAND — docs/gf-document-flows.md A3 :1383–:1384. Moved here unchanged from
// `addDocument.ts` at document step 31: the document-anchoring function reads it too (A3 :1366's capture arm, as ruled
// 2026-09-24), and `addDocument.ts` imports that function — so the read has its own module rather than a cycle.
//
// THE PLURAL LIVES BESIDE THE SINGULAR (document step 34 chunk 6, LOW-t, R86 Entry 3): `forensics:document-openings`
// counts the §2 equality over EVERY document, and one read per document is LOW-q's shape. Both ask the SAME predicate
// (`equalsCapture`, PURE) over snapshots mapped by the SAME function (`namedSnapshots`), so the two cannot disagree about
// which capture a document equals.
// ---------------------------------------------------------------------------

const SNAPSHOT_SELECT = { documentHash: true, waybackTimestamp: true, trackedUrl: { select: { url: true } } } as const;

/** Snapshots as `equalsCapture` reads them — a capture the archive never named (no timestamp) is no witness. */
function namedSnapshots(
  snapshots: readonly { documentHash: string; waybackTimestamp: string | null; trackedUrl: { url: string } }[],
): { documentHash: string; url: string; capture: string }[] {
  return snapshots.flatMap((s) => (s.waybackTimestamp === null ? [] : [{ documentHash: s.documentHash, url: s.trackedUrl.url, capture: s.waybackTimestamp }]));
}

/** EQUALS_CAPTURE(d), read on demand (A3 :1383) — the snapshots whose stored digest is this DOC_ID's. */
export async function capturesEqualTo(key: string): Promise<{ url: string; capture: string } | null> {
  const snapshots = await prisma.urlSnapshot.findMany({ where: { documentHash: digestOf(key) }, select: SNAPSHOT_SELECT });
  return equalsCapture({ docId: key } as Document, namedSnapshots(snapshots));
}

/** EQUALS_CAPTURE(d) for every DOC_ID asked — ONE read, keyed by the DOC_ID as asked; an entry for each, null where none. */
export async function capturesEqualToEach(keys: readonly string[]): Promise<Map<string, { url: string; capture: string } | null>> {
  const wanted = [...new Set(keys)];
  if (wanted.length === 0) return new Map();
  const snapshots = namedSnapshots(
    await prisma.urlSnapshot.findMany({ where: { documentHash: { in: [...new Set(wanted.map(digestOf))] } }, select: SNAPSHOT_SELECT }),
  );
  return new Map(wanted.map((key) => [key, equalsCapture({ docId: key } as Document, snapshots)]));
}
