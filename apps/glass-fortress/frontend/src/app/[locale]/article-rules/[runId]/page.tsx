import { ArticleRulesClient } from './ArticleRulesClient';

// ---------------------------------------------------------------------------
// LEVEL 4 — the marking page. Where the MCP handoff lands.
//
// A tool created a calibration run and returned this URL; the researcher marks
// here; a second tool reads the outcome afterwards. The tool and this page never
// talk to each other — both talk to the run's rows, which is what makes closing
// the tab and reopening the URL cost nothing.
//
// THE RUN ID IN THE PATH IS A POINTER, NOT A CREDENTIAL. Every backend route it
// calls is behind the existing researcher auth; a bearer token in a URL leaks
// through history and referrers.
//
// Server shell matching the app's pattern for dynamic routes — params is a
// Promise, awaited once, handed to the interactive client as a plain prop.
// ---------------------------------------------------------------------------

export default async function ArticleRulesPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return <ArticleRulesClient runId={runId} />;
}
