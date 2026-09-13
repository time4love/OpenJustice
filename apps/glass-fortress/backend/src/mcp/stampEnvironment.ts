import { getAppEnv } from '../lib/appEnv';

// ---------------------------------------------------------------------------
// EVERY TOOL ANSWER NAMES THE ENVIRONMENT IT CAME FROM.
//
// The first unsteered live run (2026-09-13) went eleven turns — a survey, two
// framings, a dozen reads — without once calling get_environment, although its
// description says "Call this FIRST". A rule the model must remember to obey is
// a rule it will not obey on a surface that shows it 80 characters per tool.
// So the answer carries the fact instead: one `environment` field on every JSON
// object a tool returns, from the deployment's own validated configuration.
//
// FROM CONFIGURATION, NOT THE CHAIN. get_environment cross-checks APP_ENV against
// the chain and that costs two RPC calls; a stamp on every answer cannot pay
// that. APP_ENV is validated at startup against the database the process is
// connected to (lib/appEnv), so the stamp says which environment ANSWERED — the
// confirmation across both axes stays get_environment's, and the stamp says so
// by name in the instructions rather than pretending to be it.
//
// ONE PLACE. Applied at the registration site in mcpServer.ts to every tool, so
// no tool author decides whether their answer names the environment. An answer
// that already carries `environment` (get_environment's own) is left alone; an
// answer that is not a JSON object is returned unchanged.
// ---------------------------------------------------------------------------

export function stampEnvironment(text: string, env: Record<string, string | undefined> = process.env): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return text;
  if ('environment' in parsed) return text;
  return JSON.stringify({ ...parsed, environment: getAppEnv(env) });
}
