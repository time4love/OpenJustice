import { notFound } from 'next/navigation';
import { MarkingClient } from './MarkingClient';

// ---------------------------------------------------------------------------
// THE MARKING PAGE — docs/gf-interaction-flows.md MARKING and A6, one capture
// of one page, named by the page's id and the capture's wayback timestamp:
//
//     /<locale>/article-rules/<trackedUrlId>/<capture>
//
// THE FIRST SEGMENT IS THE PAGE'S ID. The directory was `[runId]` while the
// legacy tree owned that slug at this position; the switch (refactor plan §3
// step 8, pulled before step 5 on 2026-09-06) removed that tree, and the
// directory is `[trackedUrlId]`, which is what it names.
//
// A CAPTURE IS 14 DIGITS (A1). Anything else at this position is not a capture,
// and the page says so before any fetch is made.
//
// Both ids are POINTERS, NOT CREDENTIALS: every route the client reaches is
// behind the researcher auth, and a bearer token never travels in a URL.
// ---------------------------------------------------------------------------

const CAPTURE = /^\d{14}$/;

export default async function MarkingPage({ params }: { params: Promise<{ trackedUrlId: string; capture: string }> }) {
  const { trackedUrlId, capture } = await params;
  if (!CAPTURE.test(capture)) notFound();
  return <MarkingClient trackedUrlId={trackedUrlId} capture={capture} />;
}
