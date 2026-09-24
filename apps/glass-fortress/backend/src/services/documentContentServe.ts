import { verifyTextLink, type SignedTextQuery } from '../lib/documentTextLink';
import { prisma } from '../lib/prisma';
import { documentRefusal, type ContentServeCode, type DocumentRefusal } from './documentRefusals';

// ---------------------------------------------------------------------------
// GET /api/documents/:commitment/content — docs/gf-document-flows.md A5 :1504-:1506 as ruled 2026-09-24 (Q1 of
// step 30's close). #579 builds TWO of its branches, and step 34 the third.
//
// THE SIGNED ARM: with a signature `read_document` minted (`lib/documentTextLink`), serve THAT version's text
// (`?version=<hash>`), reading no caller identity — the signature proves the mint.
//
// THE PUBLIC BRANCH: without one, behave "exactly as below" — which until step 34 is to REFUSE EVERYTHING. With no
// `DocumentOpeningDecision` in force it answers NOT_PUBLIC for every document, one answer whether the document exists
// or not, so the public branch never says which documents are held. OPENED(d) is step 34's predicate, and nothing
// writes that table before `decide_opening`: a row appearing here is a world this branch would misreport in silence,
// so it THROWS naming the step that owns it — as `list_documents` does (readDocument.ts).
// ---------------------------------------------------------------------------

export async function serveDocumentContent(query: SignedTextQuery, now: number = Date.now()): Promise<{ text: string } | DocumentRefusal<ContentServeCode>> {
  if (verifyTextLink(query, now) && query.version !== undefined) {
    const version = await prisma.documentContentVersion.findUnique({
      where: { commitment_contentVersionHash: { commitment: query.commitment, contentVersionHash: query.version } },
    });
    const text = version?.text ?? null;
    // The signature proves `read_document` minted this link for a version WITH text, and versions are append-only —
    // no world before SHED (document step 35) removes one or its text.
    if (text === null) {
      throw new Error(`document content: a valid signature names ${query.commitment} @ ${query.version}, which holds no text — only SHED (document step 35) removes one`);
    }
    return { text };
  }

  const opened = (await prisma.documentOpeningDecision.findMany({ where: { commitment: { in: [query.commitment] } }, select: { commitment: true } })).at(0);
  if (opened !== undefined) {
    throw new Error(`document content: ${opened.commitment} has an opening decision, and OPENED(d) is document step 34's to read — nothing before it writes one`);
  }
  return documentRefusal('NOT_PUBLIC', 'This document is not public.');
}
