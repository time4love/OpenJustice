import { currentAccessToken, refreshSession } from '@/lib/session';

/**
 * Base URL for all backend API calls.
 *
 * - Development / Vercel preview (env var unset):
 *     Empty string → fetch('/api/...') → Next.js rewrite proxies to BACKEND_URL
 *
 * - Production (env var set in Vercel dashboard):
 *     Requests go directly from the browser to the backend service, bypassing
 *     the Next.js proxy.  CORS must allow the Vercel frontend origin.
 *
 * Usage:
 *   import { apiUrl } from '@/lib/api';
 *   fetch(apiUrl('/api/evidence/search?q=...'))
 */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  // Avoid double-slashes when base has a trailing slash
  return base.replace(/\/$/, '') + path;
}

/**
 * Authorization header for the signed-in researcher, if any. The token is the
 * Supabase session AuthContext stores. It belongs to the GATED reads — the marking
 * dialog and the research pages; a PUBLIC read never sends it (docs/gf-thesis-flows.md
 * A5 :1561, and `readPublic` below). Empty on the server and when signed out.
 */
export function authHeaders(): Record<string, string> {
  const token = currentAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Fetch, retrying ONCE when the backend says the token is dead.
 *
 * The retry is a backstop, not the mechanism: `AuthContext` refreshes ahead of
 * expiry, so in normal running the stored token is always valid. What this
 * catches is the request already in flight when the hour turned, and the tab
 * whose refresh timer a background throttle held back.
 *
 * IT AUTHENTICATES NOTHING THE CALLER DID NOT. A request that arrived without an
 * `Authorization` header is retried without one, because some reads are deliberately
 * made as the public — and a public read answers the same bytes whoever asks
 * (docs/gf-ui-flows.md A3 :1019–:1021). Quietly attaching a token here would send an
 * identity the route does not read, and make a public page depend on who is signed in.
 * The retry replaces a header the caller chose to send; it never adds one they didn't.
 *
 * It also retries only when the refresh produced a token at all. A refusal
 * clears the session, and re-sending a dead token would turn one honest 401
 * into two.
 *
 * Every authenticated call goes through here — `fetchJson` and the marking
 * page's own client alike — so the rule has one implementation, not one per
 * caller.
 */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = apiUrl(path);
  const sentAuth = new Headers(init?.headers).has('authorization');

  const first = await fetch(url, init);
  if (first.status !== 401 || !sentAuth) return first;

  const refreshed = await refreshSession();
  if (!refreshed) return first;

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
  return fetch(url, { ...init, headers });
}


/**
 * Fetch JSON and turn every failure into a thrown `Error` whose `message` is
 * what the reader should see — which is what `useAsyncData` stores as
 * `state.error`.
 *
 * Three failures, deliberately kept apart:
 *  - the request was aborted (unmount, or a newer request superseded it): the
 *    abort is re-thrown untouched, so the hook can recognise and discard it
 *    rather than rendering it as a real failure;
 *  - the request never reached the backend: `offline`, because how to word that
 *    is a page-level decision, not this helper's;
 *  - the backend answered with a status: its own `message`, falling back to the
 *    status code, so a server-authored explanation is never replaced by a
 *    generic one.
 */
export async function fetchJson<T>(
  path: string,
  { offline, answers, ...init }: RequestInit & { offline: string; answers?: readonly number[] },
): Promise<T> {
  let res: Response;
  try {
    res = await authedFetch(path, init);
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new Error(offline);
  }
  let body: T & { message?: string };
  try {
    body = (await res.json()) as T & { message?: string };
  } catch (err) {
    // A gateway erroring out with an HTML page is still a status failure — say
    // so, rather than surfacing a JSON parse error the reader cannot act on.
    if (!res.ok) throw new Error(`Error ${String(res.status)}`);
    throw err;
  }
  // A STATUS THE CALLER NAMED IS AN ANSWER, NOT A FAILURE (the researcher's
  // ruling, 2026-09-19). The chain check is the read this exists for:
  // CHAIN_UNAVAILABLE is "a verdict about the CHECK, never about the record"
  // (evidence A4 :1115) and arrives as a 503 carrying `{ error, code }`. Thrown,
  // that body is lost, and a renderer would have to INVENT the refusal from a
  // status — which is what `parseChainAnswer`'s union exists to prevent.
  //
  // PER CALLER, AND NEVER CENTRAL. Every other caller names none and is
  // unchanged, because which failures are answers is a question about the READ
  // and not about the door; a door deciding it for everyone would swallow a real
  // outage on every one of them.
  if (!res.ok && answers?.includes(res.status) === true) return body;
  if (!res.ok) throw new Error(body.message ?? `Error ${String(res.status)}`);
  return body;
}

/**
 * What a public read answers: the body narrowed by the caller's parser, THE ONE 404, or the 400 (ui flows §8;
 * A2, whose table gives 400 and 404 as STATES every public page renders).
 *
 * THE 400 IS A STATE AND NOT A FAILURE, which is why it is in this type rather than in a throw. A2 renders it
 * as "the filters shown for removal", so only a page that HAS filters can reach one — and until this member
 * existed such a page could not tell a malformed filter from a dead backend: `readPublic` threw on both and the
 * reader got a 500. That was live on `/corpus`, where the CITED lens sent a value the route refuses.
 *
 * Every caller must now say what it does with a 400, and the compiler is what asks. On a page with no filters
 * the honest answer is that it cannot happen and is a defect if it does — those callers throw, loudly and by
 * name, which is what `readPublic` used to do for them silently.
 */
export type PublicRead<T> = { status: 200; body: T } | { status: 404 } | { status: 400 };

/**
 * A PUBLIC READ, FROM THE SERVER — docs/gf-ui-flows.md A3 :1019–:1021, §8 :329–:342; thesis A5 :1561.
 *
 * NO IDENTITY. No `Authorization`, ever: the route reads none, and a page that sent one would be asking for a
 * behaviour that does not exist.
 *
 * THE STAGING TOKEN IS NOT AN IDENTITY, and this is the SECOND place it is attached. `lib/stagingApiAuth.ts`
 * patches the browser's `fetch` and returns on the server (`typeof window === 'undefined'`), so a server render
 * would otherwise reach the staging backend without the header its gate requires
 * (`middleware/stagingAccess.ts`) and read nothing. The header says which DEPLOYMENT is being read; the bearer
 * would say who is reading.
 *
 * SIXTY SECONDS. The body is cached for a minute (the researcher's ruling, 2026-09-16), so a publication, a
 * withdrawal or a re-publication is visible within a minute and the same read serves `generateMetadata` and the
 * page as one request.
 *
 * The parser is the caller's, and it is not optional: a body that drifted from the appendix fails here, naming
 * the field (`lib/thesisBody.ts`).
 */
export async function readPublic<T>(path: string, parse: (body: unknown) => T): Promise<PublicRead<T>> {
  const base = process.env.BACKEND_URL;
  if (base === undefined) throw new Error('readPublic: BACKEND_URL is not set — the server cannot reach the backend');
  const token = process.env.NEXT_PUBLIC_STAGING_API_TOKEN;
  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    headers: token === undefined || token === '' ? {} : { 'X-Staging-Token': token },
    next: { revalidate: 60 },
  });
  if (res.status === 404) return { status: 404 };
  // The route's own refusal for a malformed parameter. Its message is the backend's English and names the field;
  // it is deliberately NOT carried, because nothing public may show it and a value carried is a value rendered.
  if (res.status === 400) return { status: 400 };
  if (!res.ok) throw new Error(`readPublic: ${path} answered ${String(res.status)}`);
  return { status: 200, body: parse(await res.json()) };
}

/**
 * A PUBLIC READ FROM A PAGE THAT SENDS NO FILTERS, narrowed to the two states such a page can meet.
 *
 * It adds no request, no header and no cache decision — `readPublic` is still the one read. What it adds is the
 * caller's own contract, stated in its name: this page has no chips, so the route has nothing to refuse, and a
 * 400 arriving here means the platform built a malformed URL. That is a defect, so it throws by name instead of
 * rendering a state the page does not have.
 *
 * It exists once rather than at seven call sites. Seven pages each deciding what a 400 means is the "one rule,
 * many implementations" shape this repository names as its dominant defect, and the page that decided
 * differently would be the one nobody read.
 */
export async function readUnfiltered<T>(
  path: string,
  parse: (body: unknown) => T,
): Promise<{ status: 200; body: T } | { status: 404 }> {
  const answer = await readPublic(path, parse);
  if (answer.status === 400) {
    throw new Error(`readUnfiltered: ${path} answered 400 — this read sends no filters, so a refused parameter is a defect, not a state`);
  }
  return answer;
}

/**
 * The public MCP endpoint researchers point their client at.
 *
 * Lives here rather than beside either page that shows it. Two copies of an
 * address is one copy that can go stale, and the failure it produces — a
 * connector pointed at a URL that no longer serves — looks exactly like the
 * four setup traps it would then be confused with.
 *
 * The testing environment has its own endpoint and its own database. It is
 * deliberately NOT published here: a public help centre has no reason to
 * advertise a non-public surface, and the researchers who need it are told it
 * directly.
 */
export const MCP_SERVER_URL =
  'https://glass-fortress-backend-production.up.railway.app/api/mcp';
