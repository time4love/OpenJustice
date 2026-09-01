import { ArticleRulesClient } from '../../ArticleRulesClient';

// ---------------------------------------------------------------------------
// LEVEL 4 — ONE CAPTURE, and nothing else on the page.
//
// The view the researcher's own ruling asks for: *"the UI is a visual instrument
// for checking and correcting a ruleset against one capture."* The run-level
// page carries a capture strip and a finish section — sequencing and approval —
// and both of those now belong to MCP. Sending someone here to look at one
// capture and handing them two controls that decide things the tools decide is
// how the page ended up mixing a step view with a process view.
//
// SAME CLIENT, NOT A SECOND ONE. The working area — the structure tree, the
// removed pane, the tabs — is identical in every mode this level has, and a
// copy of it is a copy that drifts. The mode is a prop.
//
// The run id and the snapshot id in the path are POINTERS, NOT CREDENTIALS:
// every backend route they reach is behind the researcher auth, and a bearer
// token in a URL leaks through history and referrers.
// ---------------------------------------------------------------------------

export default async function ArticleCapturePage({
  params,
}: {
  params: Promise<{ runId: string; snapshotId: string }>;
}) {
  const { runId, snapshotId } = await params;
  return <ArticleRulesClient runId={runId} snapshotId={snapshotId} />;
}
