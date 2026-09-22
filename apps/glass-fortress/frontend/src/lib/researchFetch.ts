import { authHeaders, authedFetch } from '@/lib/api';
import { withoutLocale } from '@/lib/localeFacts';
import { routing } from '@/i18n/routing';

// ---------------------------------------------------------------------------
// THE ONE GATED READER — docs/gf-ui-refactor-plan.md UI-8 :771–:772 ("the bearer, the 401 → `returnTo`, the
// 403 — one wrapper, no page composes it"); ui §13 :469–:480, A2 :1145–:1155, §37 :1037.
//
// IT IS A BROWSER MODULE, and that is a consequence, not a preference: `authHeaders()` reads the Supabase
// session from `window.localStorage` (`lib/session.ts` :80, :110) and returns nothing on the server, so a
// Server Component cannot read a `/api/research` body at all. The four read-view pages are therefore
// client-rendered below a thin server shell (Next's own guide says the same: React context, and so a session
// a provider holds, is not available to a Server Component).
//
// EVERY REQUEST GOES THROUGH `authedFetch`, WHICH GOES THROUGH `apiUrl` (`lib/api.ts` :58). Two things ride on
// that and neither is this module's to re-spell: the ONE retry after a refresh, and the staging token, which
// `lib/stagingApiAuth.ts` attaches to URLs at the backend host. A relative `/api/…` fetch composed here would
// meet the staging gate's own 401 before `requireResearcher` ever ran.
//
// `scope` IS NEVER SENT. The route fixes it (`researchRoutes.ts` :26–:27, "a `scope` in the query is a
// malformed parameter"), and §7.1 :328 says the read view's routes pass `all` while the PAGE opens on `mine`
// by keeping the entries whose `mine` is true — a view over a field the body carries, never a second read.
//
// NOTHING HERE WRITES. Every call is a GET with no body, which is what `no-write-from-research` holds over
// this module and everything under the research pages (§12 :458; plan :784–:786).
// ---------------------------------------------------------------------------

/**
 * THE REFUSALS A GATED READ CAN NAME (ui §7 :310–:313).
 *
 * A 404 inside the prefix says WHICH refusal it was, "because the caller is a researcher and working state is
 * theirs to read" — so the page draws a named STATE and never the public one-404. The five are exactly the
 * codes the eleven reads answer, and each has one approved sentence in the frozen copy
 * (`research.state.noThesis` · `.noFraming` · `.noDebate` · `.notSurveyed` · `.noRule`).
 *
 * A SIXTH CODE FAILS LOUDLY rather than rendering a generic sentence: a refusal with no approved copy is a
 * contract that moved, and copy lands approved or not at all (plan §4 :964–:966).
 */
export const RESEARCH_REFUSALS = ['NO_THESIS', 'NO_FRAMING', 'SESSION_NOT_FOUND', 'NOT_SURVEYED', 'NO_SUCH_RULE'] as const;
export type ResearchRefusal = (typeof RESEARCH_REFUSALS)[number];

/**
 * WHAT A GATED READ ANSWERS — §13's table, as a value.
 *
 * NOT `PublicRead`'s shape, deliberately: the public door has three states and no identity, and this one has
 * six, of which two carry something the page needs (the bare `returnTo`, the refusal's code). The discriminant
 * is a WORD rather than a status number because the page's switch is then §13's table read aloud, and because
 * `UNREACHABLE` has no status at all.
 */
export type ResearchRead<T> =
  | { state: 'BODY'; body: T }
  /** 401 — `/login?returnTo=` this page, bare and locale-agnostic (§37; OAuth plan §7.0f). */
  | { state: 'SIGNED_OUT'; returnTo: string }
  /** 403 — one sentence, `/researchers` linked. */
  | { state: 'NOT_A_RESEARCHER' }
  /** 404 inside the prefix — the refusal NAMED. */
  | { state: 'REFUSED'; code: ResearchRefusal }
  /** 400 — a parameter the route refuses; the filters are shown for removal (A2 :1149). */
  | { state: 'FILTERS_REFUSED' }
  /** The request never reached the backend — `research.state.unreachable`, which CALLS `marking.offline`. */
  | { state: 'UNREACHABLE' };

/** The bare path this page would return to after signing in. Exported for the one case that pins it. */
export function returnToOf(url: { pathname: string; search: string }): string {
  return `${withoutLocale(url.pathname, routing.locales)}${url.search}`;
}

function refusalOf(body: unknown, path: string): ResearchRefusal {
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  if (RESEARCH_REFUSALS.some((refusal) => refusal === code)) return code as ResearchRefusal;
  throw new Error(`research fetch: ${path} answered 404 with code ${JSON.stringify(code) ?? 'undefined'} — no approved state names it`);
}

/**
 * READ ONE GATED BODY.
 *
 * `path` is the route's own path (`/api/research/…`), never a URL: `apiUrl` composes the origin, and a caller
 * that composed one would be the caller the staging token does not reach.
 *
 * The parser is the caller's and is not optional — a body that drifted from the appendix fails here, naming
 * the field (`lib/researchBody.ts`), rather than rendering a region that is silently empty.
 */
export async function researchFetch<T>(path: string, parse: (body: unknown) => T, init?: RequestInit): Promise<ResearchRead<T>> {
  // THE HEADERS ARE MERGED THROUGH `Headers`, NOT BY SPREAD. A `Headers` instance has no own enumerable
  // properties, so `{ ...init.headers }` spreads it to NOTHING — a caller that passed one would have had its
  // headers silently dropped, and the bearer with them (a LOW found by REVIEW, 2026-09-20).
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(authHeaders())) headers.set(name, value);

  let response: Response;
  try {
    response = await authedFetch(path, { ...init, method: 'GET', headers });
  } catch {
    // The backend was not reached at all. It is a STATE with an approved sentence, not a throw: a reader who
    // is offline has nothing to act on in a stack trace.
    return { state: 'UNREACHABLE' };
  }

  // 401 AND 403 COME FIRST, BEFORE ANY LOOKUP, with one body each regardless of whether the id exists (§7
  // :310–:312) — so neither is read for anything but its status. They are the mount-level gate's
  // `{ error, message }` and carry no `code` to key on (`researcherIdentity.ts` :77–:86).
  if (response.status === 401) {
    return { state: 'SIGNED_OUT', returnTo: returnToOf(window.location) };
  }
  if (response.status === 403) return { state: 'NOT_A_RESEARCHER' };

  if (response.status === 400) return { state: 'FILTERS_REFUSED' };

  if (response.status === 404) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { state: 'REFUSED', code: refusalOf(body, path) };
  }

  if (!response.ok) throw new Error(`research fetch: ${path} answered ${String(response.status)}`);

  return { state: 'BODY', body: parse(await response.json()) };
}
