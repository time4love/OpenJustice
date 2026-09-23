import { UploadDialog } from '@/components/upload/UploadDialog';
import { paramsOf, readUploadLink } from '@/lib/uploadLink';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S PAGE — /<locale>/upload?title=…&url=…&at=…&derivedFrom=…&derivedFromTitle=…
//
// A DIALOG (docs/gf-ui-flows.md §1 :39): reached ONLY by the link the conversation hands over, composed by the
// backend (`backend/src/services/documentUploadUrl.ts`); in no navigation; OUTSIDE `/research`, whose pages never
// write (`test/noWriteFromResearch.test.ts`). The shell draws it without the sidebar or the pane (`lib/dialogRoutes`).
//
// The link is read HERE, as it came — a repeated key kept as a repeat, so the dialog can refuse it rather than
// silently take the first (R78 chunk-3 prompt amendment 2).
// ---------------------------------------------------------------------------

export default async function UploadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <UploadDialog link={readUploadLink(paramsOf(await searchParams))} />;
}
