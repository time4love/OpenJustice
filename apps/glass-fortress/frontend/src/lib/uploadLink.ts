// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S LINK, AND THE COMMAND IT HANDS BACK — docs/gf-document-flows.md §9 :998, A4 :1428.
//
// THE LINK CARRIES THE CONTEXT. The backend composes it (`backend/src/services/documentUploadUrl.ts`, the ONE
// composer) from the read the conversation came from, and the conversation SETs `title` — always — and `at` when
// the researcher states it (the approved DOCUMENTS paragraph, step (3)). The dialog draws what the link brought as
// LABELS and takes one thing, the file; to change a fact the researcher returns to the conversation for a new link.
//
// ONE VALUE PER KEY, OR THE LINK IS MALFORMED — R78 chunk-3 prompt amendment 2. A link carrying two of any key is
// refused with one sentence, and the dialog never picks the first or the last: `URLSearchParams.get` silently
// takes the first, so an `at` appended to a link that already carried one would drop the researcher's date.
//
// PURE — no request, no React, no identity.
// ---------------------------------------------------------------------------

/** The keys the composer writes — and so the only ones the dialog reads. */
const KEYS = ['title', 'url', 'at', 'derivedFrom', 'derivedFromTitle', 'derivedFromFamily'] as const;

/**
 * The door's families — `DocumentFamily` in `backend/src/lib/acceptedDocumentTypes.ts`, held EQUAL to that union by
 * `test/uploadLink.test.ts`, which reads the backend's source. The link names the derived-from document's family so
 * the dialog can draw its kind (board י1ב, „… (וידאו)"); a family outside this set is a malformed link.
 */
export const DOCUMENT_FAMILIES = ['PDF', 'XLSX', 'CSV', 'IMAGE', 'AUDIO', 'VIDEO'] as const;
export type DocumentFamily = (typeof DOCUMENT_FAMILIES)[number];
type Key = (typeof KEYS)[number];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type UploadLink =
  | {
      state: 'READY';
      title: string;
      url: string | null;
      /** `YYYY-MM-DD` — the day the researcher says the page showed the file. */
      at: string | null;
      derivedFrom: { commitment: string; title: string | null; family: DocumentFamily | null } | null;
    }
  | { state: 'MALFORMED'; key: Key }
  | { state: 'NO_TITLE' };

export type ReadyLink = Extract<UploadLink, { state: 'READY' }>;

/** Next's `searchParams` record — an ARRAY for a repeated key — as the parameters it came as, repeats kept. */
export function paramsOf(record: Readonly<Record<string, string | string[] | undefined>>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    for (const one of value === undefined ? [] : Array.isArray(value) ? value : [value]) params.append(key, one);
  }
  return params;
}

export function readUploadLink(params: URLSearchParams): UploadLink {
  const values: Partial<Record<Key, string>> = {};
  for (const key of KEYS) {
    const all = params.getAll(key);
    if (all.length > 1) return { state: 'MALFORMED', key };
    const value = all.at(0);
    if (value !== undefined && value.trim() !== '') values[key] = value;
  }
  if (values.at !== undefined && !DAY.test(values.at)) return { state: 'MALFORMED', key: 'at' };
  const family = DOCUMENT_FAMILIES.find((known) => known === values.derivedFromFamily) ?? null;
  if (values.derivedFromFamily !== undefined && family === null) return { state: 'MALFORMED', key: 'derivedFromFamily' };
  if (values.title === undefined) return { state: 'NO_TITLE' };
  return {
    state: 'READY',
    title: values.title.trim(),
    url: values.url ?? null,
    at: values.at ?? null,
    derivedFrom: values.derivedFrom === undefined ? null : { commitment: values.derivedFrom, title: values.derivedFromTitle ?? null, family },
  };
}

/** The `add_document` command, and the same command SPLIT around its title so the view can isolate it (`<bdi>`). */
export interface AddDocumentCommand {
  text: string;
  before: string;
  title: string;
  after: string;
}

/**
 * The command the researcher pastes into the conversation — the order boards י1 and י1ב draw: docId · mimeType ·
 * title · derivedFrom · assertedUrl · assertedAt, each fact only when the link brought it. A double quote in the
 * title is escaped so the title stays one value.
 */
export function addDocumentCommand(file: { docId: string; mimeType: string }, link: ReadyLink): AddDocumentCommand {
  const before = `add_document docId=${file.docId} mimeType=${file.mimeType} title=`;
  const title = link.title.replaceAll('"', '\\"');
  const after = [
    link.derivedFrom === null ? null : `derivedFrom=${link.derivedFrom.commitment}`,
    link.url === null ? null : `assertedUrl=${link.url}`,
    link.at === null ? null : `assertedAt=${link.at}`,
  ]
    .flatMap((part) => (part === null ? [] : [` ${part}`]))
    .join('');
  return { text: `${before}"${title}"${after}`, before, title, after };
}
