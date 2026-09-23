import { prisma } from '../lib/prisma';
import { readObject } from './documentBucket';
import { custody, recomputableDocument, recomputableEvidence } from './documentPredicates';

// ---------------------------------------------------------------------------
// `document-recomputable` — docs/gf-document-flows.md A7 :1549–:1552; plan :146–:149 (recorded at step 28, never
// built there, OWED and built at step 30). Run by `scripts/auditDocuments.ts` inside a deployment.
//
//   every HELD document:      sha256(bytes) = docId, the bytes read from the bucket
//   every SEALED document:    verifiedAtReceipt set
//   every Evidence of kind DOCUMENT: fileHash = sha256(docId ‖ salt) of its document
//   exit 0: all pass · exit 1: malformed rows, LISTED — never repaired
//
// THE PREDICATES ARE CALLED, NEVER RE-SPELLED: `recomputableDocument` and `recomputableEvidence` are
// `documentPredicates`' (A3 :1361–:1365). This module only reads what they need and reports what they answer.
//
// ZERO EXAMINED IS REPORTED, never a silent pass — the count is part of the answer.
// ---------------------------------------------------------------------------

export interface MalformedDocument {
  commitment: string;
  reason: string;
}

export interface DocumentAudit {
  examined: number;
  malformed: MalformedDocument[];
}

export async function auditDocuments(): Promise<DocumentAudit> {
  const documents = await prisma.document.findMany({ include: { shed: true } });
  const evidence = await prisma.evidence.findMany({ where: { kind: 'DOCUMENT' } });
  const malformed: MalformedDocument[] = [];

  for (const document of documents) {
    const mode = custody(document, document.shed);
    const bytes = mode === 'HELD' ? await readObject(document.bytes ?? document.docId) : null;
    if (recomputableDocument(document, document.shed, bytes)) continue;
    const reason =
      mode === 'HELD'
        ? bytes === null
          ? `HELD, and its bucket object is absent — the row claims bytes that are not there`
          : `HELD, and the bytes under ${document.docId} do not hash to its name`
        : `${mode}, and verifiedAtReceipt is not set`;
    malformed.push({ commitment: document.commitment, reason });
  }

  for (const row of evidence) {
    const document = documents.find((one) => one.commitment === row.documentCommitment);
    if (document === undefined) {
      malformed.push({ commitment: row.documentCommitment ?? row.fileHash, reason: `Evidence ${row.id} names no document` });
    } else if (!recomputableEvidence(row.fileHash, document)) {
      malformed.push({ commitment: document.commitment, reason: `Evidence ${row.id}'s fileHash is not its document's commitment` });
    }
  }

  return { examined: documents.length, malformed };
}

export function exitCodeForAudit(report: DocumentAudit): 0 | 1 {
  return report.malformed.length === 0 ? 0 : 1;
}

export function formatDocumentAudit(report: DocumentAudit): string {
  const lines = [`document-recomputable: ${String(report.examined)} documents examined, ${String(report.malformed.length)} malformed`];
  for (const row of report.malformed) lines.push(`  MALFORMED  ${row.commitment}  ${row.reason}`);
  return lines.join('\n');
}
