import { notFound } from 'next/navigation';
import { MarkingClient } from './MarkingClient';

// ---------------------------------------------------------------------------
// THE MARKING PAGE — docs/gf-interaction-flows.md MARKING and A6, one capture
// of one page, named by the page's id and the capture's wayback timestamp:
//
//     /<locale>/article-rules/<trackedUrlId>/<capture>
//
// THE FIRST SEGMENT IS THE PAGE'S ID, NOT A RUN. The directory is `[runId]`
// only because the legacy tree beside this one (`[runId]/page.tsx`,
// `[runId]/capture/[snapshotId]`) owns that slug at this position until
// refactor step 8 retires it, and Next.js refuses two slug names at one
// position. The rename happens HERE, at the boundary, and nothing below it
// names a run. At step 8 the directory becomes `[trackedUrlId]`.
//
// A CAPTURE IS 14 DIGITS (A1). Anything else at this position — including the
// literal `capture` from the legacy tree's page-less intermediate segment — is
// not a capture, and the page says so before any fetch is made.
//
// Both ids are POINTERS, NOT CREDENTIALS: every route the client reaches is
// behind the researcher auth, and a bearer token never travels in a URL.
// ---------------------------------------------------------------------------

const CAPTURE = /^\d{14}$/;

export default async function MarkingPage({ params }: { params: Promise<{ runId: string; capture: string }> }) {
  const { runId: trackedUrlId, capture } = await params;
  if (!CAPTURE.test(capture)) notFound();
  return <MarkingClient trackedUrlId={trackedUrlId} capture={capture} />;
}
