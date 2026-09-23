import type { DocumentFamily } from '../lib/acceptedDocumentTypes';
import { publicUrl } from '../lib/publicRoutes';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S LINK — composed in ONE module, the marking URL's precedent
// (interaction A6 :1265-:1267: "composed in exactly ONE module … through the reused
// `publicUrl` with the default locale").
//
// THE LINK CARRIES THE CONTEXT (flows §9 :998, RULED 2026-09-22 at board י1): the backend
// composes it on the read the conversation came from — `list_documents({ url })` fills the
// PAGE, `read_document(c)` fills DERIVED-FROM and that document's assertions as defaults — and
// the dialog draws what it brought AS LABELS, never as fields. It takes one thing, the file.
// The TITLE is the fourth assertion (A2 :1271): Claude proposes it and the researcher approves
// it IN THE CONVERSATION, so no read knows it and no read puts one in the link; the
// conversation adds `title` to the link before handing it over, and the dialog accepts no file
// until the link carries one.
//
// A POINTER, NEVER A CREDENTIAL: the page is gated, and nothing here authorises anything.
// ---------------------------------------------------------------------------

/** The dialog's path under the locale (sketch S1: outside `/research`, ui A1 :1129). */
export const UPLOAD_DIALOG_PATH = '/upload';

export interface UploadLinkContext {
  /** The asserted page — a surveyed URL. */
  url?: string | null;
  /** The asserted date, `YYYY-MM-DD`. */
  at?: string | null;
  /**
   * The document this one derives from, by its COMMITMENT, with its title and its FAMILY for the label's face —
   * board י1ב draws „<title> (<kind>)", and the dialog reads no document, so the kind rides the link.
   */
  derivedFrom?: { commitment: string; title: string | null; family: DocumentFamily | null } | null;
}

/** The dialog's link with whatever context the read had. Empty context → the bare dialog. */
export function uploadUrl(context: UploadLinkContext = {}): string {
  const query = new URLSearchParams();
  if (context.url !== undefined && context.url !== null) query.set('url', context.url);
  if (context.at !== undefined && context.at !== null) query.set('at', context.at);
  if (context.derivedFrom !== undefined && context.derivedFrom !== null) {
    query.set('derivedFrom', context.derivedFrom.commitment);
    if (context.derivedFrom.title !== null) query.set('derivedFromTitle', context.derivedFrom.title);
    if (context.derivedFrom.family !== null) query.set('derivedFromFamily', context.derivedFrom.family);
  }
  const search = query.toString();
  return publicUrl(search === '' ? UPLOAD_DIALOG_PATH : `${UPLOAD_DIALOG_PATH}?${search}`);
}
