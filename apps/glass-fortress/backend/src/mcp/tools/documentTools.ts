import { z } from 'zod';
import { getResearcherId } from '../../context/researcherContext';
import { addDocument } from '../../services/addDocument';
import { describeDocument } from '../../services/describeDocument';
import { isDocumentRefusal, type DocumentRefusal } from '../../services/documentRefusals';
import { imageFor, listDocuments, readDocument, type ListDocumentsAnswer, type ListDocumentsCode, type ReadDocumentHeld } from '../../services/readDocument';

// ---------------------------------------------------------------------------
// THE RESEARCHER'S DOOR ON THE MCP SURFACE — docs/gf-document-flows.md A4 :1404-:1441, document
// step 30. Four thin wrappers: each takes the researcher from the MCP context and hands it to
// the service, which holds the contract; the answer or the refusal travels as JSON, never a throw.
//
// `read_document` IS THE ONE THAT CAN RETURN TWO BLOCKS: A4 :1425 as ruled 2026-09-23 puts a
// bytes-only IMAGE in front of the model as an MCP image block beside the JSON — never inside it.
// ---------------------------------------------------------------------------

// Plain strings, deliberately: a malformed name is the SERVICE's to refuse BY CODE — `NO_BYTES` for a docId that names
// no object, `NOT_A_DOCUMENT` for a commitment that names none (A4 :1404, :1430) — never a schema error the contract
// does not spell.
const DOC_ID = z.string();
const COMMITMENT = z.string();

export const addDocumentSchema = {
  docId: DOC_ID.optional().describe('The docId the upload dialog printed — the name of the object it wrote to the bucket'),
  title: z.string().optional().describe("The document's title, the one the researcher approved in this conversation"),
  mimeType: z.string().optional().describe('The type the dialog printed, e.g. application/pdf'),
  assertedUrl: z.string().optional().describe('The page these bytes are said to show — a SURVEYED url; the researcher’s assertion'),
  assertedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional()
    .describe('The day the page is said to have shown them, YYYY-MM-DD; the researcher’s assertion'),
  derivedFrom: COMMITMENT.optional().describe('The commitment of the document this one is a transcription or redaction of'),
};

export const readDocumentSchema = { commitment: COMMITMENT.describe('The document, by its commitment') };

export const listDocumentsSchema = {
  url: z.string().optional().describe('Only the documents asserting this surveyed page'),
  scope: z.enum(['mine', 'all']).optional().describe("'mine' (the default) or 'all' — every researcher's, each with its handle"),
};

export const describeDocumentSchema = { commitment: COMMITMENT.describe('The document to have a model read, by its commitment') };

export async function addDocumentHandler(input: z.infer<z.ZodObject<typeof addDocumentSchema>>): Promise<string> {
  return JSON.stringify(await addDocument(input, getResearcherId()));
}

export async function readDocumentHandler(input: z.infer<z.ZodObject<typeof readDocumentSchema>>): Promise<string> {
  return JSON.stringify(await readDocument(input.commitment, getResearcherId()));
}

/**
 * The image block that rides BESIDE `read_document`'s answer — for a bytes-only image within the cap
 * (A4 :1425 as ruled) — read off the answer the tool already returned, so the block and the JSON
 * describe one read. Null for a refusal and for every other document.
 */
export async function readDocumentImage(answerJson: string): Promise<{ data: string; mimeType: string } | null> {
  const answer = JSON.parse(answerJson) as ReadDocumentHeld | DocumentRefusal;
  if (isDocumentRefusal(answer)) return null;
  return imageFor(answer);
}

/**
 * THE CORE the gated route and the tool share (ui §7: a route IS the tool's answer): `list_documents` for the researcher
 * in context. The route passes `scope: 'all'` (A4 :1432 as ruled); the tool passes what the conversation asked.
 */
export function documentsOf(input: z.infer<z.ZodObject<typeof listDocumentsSchema>>): Promise<ListDocumentsAnswer | DocumentRefusal<ListDocumentsCode>> {
  return listDocuments(input, getResearcherId());
}

export async function listDocumentsHandler(input: z.infer<z.ZodObject<typeof listDocumentsSchema>>): Promise<string> {
  return JSON.stringify(await documentsOf(input));
}

export async function describeDocumentHandler(input: z.infer<z.ZodObject<typeof describeDocumentSchema>>): Promise<string> {
  return JSON.stringify(await describeDocument(input.commitment, getResearcherId()));
}
