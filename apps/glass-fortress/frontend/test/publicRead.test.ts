import { fireEvent, screen } from '@testing-library/react';
import { join } from 'node:path';
jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import type { ReactElement } from 'react';
import { apiCallsMade, globalFetchDouble, renderPage, setAuthState, setPathname, setPublicBodies, type PublicRead } from './render';
import { parseThesisBody } from '../src/lib/thesisBody';
import { importsOf, publicThesisModules, stringsIn, FRONTEND } from './scan';
import published from './fixtures/thesis/published.json';
import callLive from './fixtures/thesis/call-live.json';
import versionPrevious from './fixtures/thesis/version-previous.json';

// ---------------------------------------------------------------------------
// THE PUBLIC READ CARRIES NO IDENTITY — docs/gf-ui-flows.md A3 :1019–:1021 ("everything anonymous sees,
// byte-identical"), §21 :626–:627; thesis A5 :1561 ("all PUBLIC and identity-free"); UI plan UI-5 :419–:421.
// No A5 instrument names this property, and the plan states it — so it has its own file (sketch §6-D7).
//
// AND ONE PARSER AT THE BOUNDARY (§8 :331 "bytes, not views"; the sketch's §a5, §b10). A page renders a body it
// NARROWED: a body that drifted from A5 fails loudly at the read, never as a blank region three components deep.
// Both properties belong to the same act — how a public page reads — so they are held in one file (sketch §6-D7,
// widened here; the plan names an instrument for neither).
//
// THE STAGING TOKEN IS NOT AN IDENTITY. `X-Staging-Token` says which DEPLOYMENT is being read (the gate in front
// of staging, `middleware/stagingAccess.ts`); `Authorization` says WHO is reading. The first may travel on a public
// read; the second may not, and the decoys below must tell them apart.
// ---------------------------------------------------------------------------

const BASE = 'http://backend.test';
const PATH = '/api/thesis/cmfxthesisone000000000000';
const TOKEN = 'token-fixture';

/** The REAL module, past the double: `readPublic`'s own headers and cache are this file's first four cases. */
const api = (): typeof import('../src/lib/api') => jest.requireActual<typeof import('../src/lib/api')>('../src/lib/api');

const withEnv = async <T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> => {
  const before = { ...process.env };
  Object.assign(process.env, values);
  for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key];
  try {
    return await run();
  } finally {
    process.env = before;
  }
};

/** A page as Next calls it — its own `params` shape, awaited. The modules below do not exist until chunk 3. */
type PublicPage<P> = (props: { params: Promise<P> }) => Promise<ReactElement | null> | ReactElement | null;

/** The three pages staged over one body map — the shape the page instruments use. */
function stagePages(extra: Record<string, PublicRead> = {}): void {
  const bodies: Record<string, PublicRead> = {
    [`/api/thesis/${published.thesisId}`]: { status: 200, body: published },
    [`/api/thesis/${published.thesisId}/call`]: { status: 200, body: callLive },
    [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`]: { status: 200, body: versionPrevious },
    ...extra,
  };
  setPublicBodies(bodies);
}

describe('the public read: no identity, one parser', () => {
  it('readPublic sends no Authorization header — with a stored session or without one', async () => {
    const { readPublic } = api();
    window.localStorage.setItem('gf_access_token', JSON.stringify({ accessToken: 'a-signed-in-token' }));
    const fetching = globalFetchDouble({ [`${BASE}${PATH}`]: { status: 200, body: { thesisId: 'x' } } });
    try {
    await withEnv({ BACKEND_URL: BASE, NEXT_PUBLIC_STAGING_API_TOKEN: TOKEN }, () => readPublic(PATH, (body: unknown) => body));
      const headers = new Headers(fetching.calls[0]?.init?.headers);
    expect([headers.has('authorization'), [...headers.keys()]]).toEqual([false, ['x-staging-token']]);
    } finally {
      fetching.restore();
      window.localStorage.clear();
    }
  });

  it('readPublic sends X-Staging-Token when NEXT_PUBLIC_STAGING_API_TOKEN is set, and no such header when it is not', async () => {
    const { readPublic } = api();
    const seen: (string | null)[] = [];
    for (const token of [TOKEN, undefined]) {
      const fetching = globalFetchDouble({ [`${BASE}${PATH}`]: { status: 200, body: {} } });
      try {
      await withEnv({ BACKEND_URL: BASE, NEXT_PUBLIC_STAGING_API_TOKEN: token }, () => readPublic(PATH, (body: unknown) => body));
        seen.push(new Headers(fetching.calls[0]?.init?.headers).get('x-staging-token'));
      } finally {
        fetching.restore();
      }
    }
    expect(seen).toEqual([TOKEN, null]);
  });

  it('a 404 answers the one 404; any other status throws, naming the path and the status', async () => {
    const { readPublic } = api();
    const fetching = globalFetchDouble({ [`${BASE}${PATH}`]: { status: 404 }, [`${BASE}/api/thesis/boom`]: { status: 502 } });
    try {
    await withEnv({ BACKEND_URL: BASE, NEXT_PUBLIC_STAGING_API_TOKEN: undefined }, async () => {
      expect(await readPublic(PATH, (body: unknown) => body)).toEqual({ status: 404 });
      await expect(readPublic('/api/thesis/boom', (body: unknown) => body)).rejects.toThrow(/\/api\/thesis\/boom.*502/);
    });
    } finally {
      fetching.restore();
    }
  });

  it('A 400 IS A STATE THE READ CARRIES, and it is the REAL module that carries it — not only the double', async () => {
    // THE CASE A DECOY DEMANDED. Removing the 400 arm from `readPublic` reddened NOTHING: the page instruments
    // all go through the api double in `render.tsx`, so the state they render was staged rather than read, and
    // the real module's arm was held by no case at all. A decoy that reddens nothing has found an unexercised
    // region, and this is the region. The module is REAL here and only the network is stubbed.
    const { readPublic } = api();
    const fetching = globalFetchDouble({ [`${BASE}${PATH}`]: { status: 400 } });
    try {
      await withEnv({ BACKEND_URL: BASE, NEXT_PUBLIC_STAGING_API_TOKEN: undefined }, async () => {
        expect(await readPublic(PATH, (body: unknown) => body)).toEqual({ status: 400 });
      });
    } finally {
      fetching.restore();
    }
  });

  it('THE BROWSER DOOR ANSWERS A NAMED STATUS WITH ITS BODY, and still THROWS on one nobody named', async () => {
    // THE OPT-IN, ruled 2026-09-19. `fetchJson` throws on every non-2xx, which is right for every caller it
    // has: a read that failed is a failure. The CHAIN CHECK is the exception the design already names —
    // CHAIN_UNAVAILABLE is "a verdict about the CHECK, never about the record" (evidence A4 :1115) and
    // arrives as a 503 carrying `{ error, code }`. Thrown, that body is lost and the union
    // `parseChainAnswer` exists to produce becomes unreachable, so a renderer would have to INVENT the
    // refusal from a status — which is the thing the union was written to prevent.
    //
    // THE OPT-IN IS PER CALLER AND NAMES ITS STATUSES. Every other caller names none and is unchanged: a
    // door that decided for itself which failures are answers would be deciding, centrally, a question that
    // belongs to the read. `answers` is the caller saying "this status is data, and I will narrow it".
    //
    // THE REAL MODULE, only the network stubbed — the `readPublic` 400 case above records why that matters:
    // a state staged through the double is a state nobody read.
    const { fetchJson } = api();
    // THE BROWSER DOOR COMPOSES ITS URL THROUGH `apiUrl`, from NEXT_PUBLIC_API_URL — not from BACKEND_URL,
    // which is the SERVER read's. Stubbing the server's base left `fetch` unmapped and the case failed on
    // the `offline` arm, which is a true reading of a wrong setup; the two doors have two bases and the
    // case has to say which one it is exercising.
    const fetching = globalFetchDouble({
      '/api/pages/p/captures/c/chain': { status: 503, body: { error: 'The registry could not be reached.', code: 'CHAIN_UNAVAILABLE' } },
      '/api/pages/p/captures/c': { status: 503, body: { error: 'nobody named this one', code: 'SOMETHING_ELSE' } },
    });
    try {
      await withEnv({ NEXT_PUBLIC_API_URL: '', NEXT_PUBLIC_STAGING_API_TOKEN: undefined }, async () => {
        // NAMED: the body arrives whole, so the caller can narrow `code` rather than guess from a status.
        const answered = await fetchJson<{ error: string; code: string }>('/api/pages/p/captures/c/chain', {
          offline: 'unreachable',
          answers: [503],
        });
        expect(answered).toEqual({ error: 'The registry could not be reached.', code: 'CHAIN_UNAVAILABLE' });

        // UNNAMED: the same status, from a caller that named nothing, still throws. Without this half the
        // opt-in would read as "503 is never a failure", which would swallow a real outage on every read.
        await expect(fetchJson('/api/pages/p/captures/c', { offline: 'unreachable' })).rejects.toThrow();

        // AND NAMING A DIFFERENT STATUS DOES NOT WIDEN IT: 404 named, 503 arriving, still a throw.
        await expect(fetchJson('/api/pages/p/captures/c', { offline: 'unreachable', answers: [404] })).rejects.toThrow();
      });
    } finally {
      fetching.restore();
    }
  });

  it('readUnfiltered REFUSES a 400 — a page that sends no filter cannot earn one, so it is a defect and not a state', async () => {
    // The two halves of the same rule, and they must be asserted together: the read CARRIES the 400 (above) and
    // the filterless caller REFUSES it (here). Holding only the first would let every page quietly render an
    // empty state over a malformed URL it built itself.
    const { readUnfiltered } = api();
    const fetching = globalFetchDouble({ [`${BASE}${PATH}`]: { status: 400 }, [`${BASE}/api/thesis/ok`]: { status: 404 } });
    try {
      await withEnv({ BACKEND_URL: BASE, NEXT_PUBLIC_STAGING_API_TOKEN: undefined }, async () => {
        await expect(readUnfiltered(PATH, (body: unknown) => body)).rejects.toThrow(/400.*no filters/);
        // The positive control: the SAME function still passes the one 404 through as a state, so the case
        // above is a refusal of the 400 and not of everything.
        expect(await readUnfiltered('/api/thesis/ok', (body: unknown) => body)).toEqual({ status: 404 });
      });
    } finally {
      fetching.restore();
    }
  });

  it('readPublic caches for 60 seconds — next.revalidate is 60 and no cache option is set (the researcher’s ruling R-1 a)', async () => {
    const { readPublic } = api();
    const fetching = globalFetchDouble({ [`${BASE}${PATH}`]: { status: 200, body: {} } });
    try {
    await withEnv({ BACKEND_URL: BASE, NEXT_PUBLIC_STAGING_API_TOKEN: undefined }, () => readPublic(PATH, (body: unknown) => body));
      const init = fetching.calls[0]?.init as (RequestInit & { next?: unknown }) | undefined;
    expect([init?.next, init !== undefined && 'cache' in init]).toEqual([{ revalidate: 60 }, false]);
    } finally {
      fetching.restore();
    }
  });

  it("the diff's browser read passes no headers — the reader's own act carries no identity either", async () => {
    setAuthState('anonymous');
    setPathname('/he/theses/x');
    stagePages();
    const { default: page } = (await import('../src/app/[locale]/theses/[id]/page')) as unknown as {
      default: PublicPage<{ locale: string; id: string }>;
    };
    await renderPage(page, { locale: 'he', id: published.thesisId }, { locale: 'he' });
    const control = document.querySelector('[data-what-changed]');
    if (control === null) throw new Error('no "what changed" control — the history drew none');
    fireEvent.click(control);
    await screen.findByTestId('version-diff');
      const browserReads = apiCallsMade().filter((call) => call.via === 'fetchJson');
    expect(browserReads.map((call) => [call.path, call.init?.headers])).toEqual([
      [`/api/thesis/${published.thesisId}/versions/${versionPrevious.versionId}`, undefined],
    ]);
    setPublicBodies(undefined);
    setAuthState(undefined);
    setPathname(undefined);
  });

  it('every page parses its body at the read, and a body missing a required field fails there, naming the path', async () => {
    setAuthState('anonymous');
    setPathname('/he/theses/x');
    const { claim, ...withoutClaim } = published;
    expect(claim).toBeDefined();
    stagePages({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: withoutClaim } });
    const { default: page } = (await import('../src/app/[locale]/theses/[id]/page')) as unknown as {
      default: PublicPage<{ locale: string; id: string }>;
    };
    await expect(renderPage(page, { locale: 'he', id: published.thesisId }, { locale: 'he' })).rejects.toThrow(/claim/);
      // AND every read the three pages make hands `readPublic` a parser — a read without one has no guard.
    stagePages();
    const { default: call } = (await import('../src/app/[locale]/call/[thesisId]/page')) as unknown as {
      default: PublicPage<{ locale: string; thesisId: string }>;
    };
    const { default: version } = (await import('../src/app/[locale]/theses/[id]/versions/[v]/page')) as unknown as {
      default: PublicPage<{ locale: string; id: string; v: string }>;
    };
    await renderPage(page, { locale: 'he', id: published.thesisId }, { locale: 'he' });
    await renderPage(call, { locale: 'he', thesisId: published.thesisId }, { locale: 'he' });
    await renderPage(version, { locale: 'he', id: published.thesisId, v: versionPrevious.versionId }, { locale: 'he' });
      const serverReads = apiCallsMade().filter((read) => read.via === 'readPublic');
    expect([serverReads.length > 0, serverReads.filter((read) => !read.parsed).map((read) => read.path)]).toEqual([true, []]);
    setPublicBodies(undefined);
    setAuthState(undefined);
    setPathname(undefined);
  });

  // -------------------------------------------------------------------------
  // THE APPEALS CARRY WHAT THE APPENDIX SHAPES, AND NOTHING MORE — docs/gf-thesis-flows.md A2 :1325–:1327:
  // `request` is `{ text, authority, legalBasis, addresses, restsOn }` and `callItem` is `{ whatIsNeeded,
  // whoWouldHaveSeenIt, unit, window }`. NEITHER CARRIES A gapId, and the backend adds none: `theCall` and
  // `theRequests` (services/thesisPredicates.ts) both map through `appealOf`, which returns the stored Json
  // VERBATIM. A parser that required one therefore refused every real body — the gap between a fixture written
  // beside the code and a fixture written from the appendix (UI plan §4 :880–:883), which is what §8's staging
  // exercise exists to catch.
  //
  // ONE CODE PATH, TWO ARMS, SO TWO CASES. Both appeals come through the same `appealOf`, so a parser repaired
  // on the request arm alone still refuses the call arm — and `/call/[thesisId]` is the page that breaks on the
  // first CALLED gap. Each case is reddened by its own arm's decoy.
  //
  // THE WORLD IS THE APPENDIX'S, NOT THE FIXTURE'S. The appeals below are written from A2 rather than copied
  // from `published.json`, so the case states the contract even while a fixture disagrees with it.
  // -------------------------------------------------------------------------

  /** A REQUESTED gap's appeal — A2 :1325–:1326's five keys, and no more. */
  const REQUEST = {
    text: 'בהתאם לחוק חופש המידע, אבקש את ההנחיה שעל פיה נוסח העמוד בין התאריכים האמורים.',
    authority: 'הממונה על חופש המידע',
    legalBasis: 'חוק חופש המידע, התשנ"ח-1998',
    addresses: ['foia@example.gov.il'],
    restsOn: ['0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'],
  };

  /** A CALLED gap's appeal — A2 :1327's four keys, and no more. */
  const CALL_ITEM = {
    whatIsNeeded: 'ההנחיה הפנימית שלפיה נוסחה ההודעה על תופעות הלוואי',
    whoWouldHaveSeenIt: 'מי שערך את העמוד הציבורי באותה תקופה',
    unit: 'היחידה לפרסומי אינטרנט',
    window: '1.3.2021 – 30.4.2021',
  };

  /** The published fixture with ONE arm replaced by the appendix's shape — everything else is the body it always was. */
  const withAppeals = (appeals: { call: unknown[]; requests: unknown[] }): unknown => ({
    ...published,
    appeals: { ...appeals, intake: published.appeals.intake },
  });

  /**
   * The one entry, or a loud failure. An empty list would make `Object.keys` answer `[]` and the case pass over
   * NOTHING — the vacuity a scan is never allowed to report as a pass.
   */
  const only = <T>(items: readonly T[], what: string): T => {
    const one = items.at(0);
    if (one === undefined) throw new Error(`${what}: the parsed body carries no entry, so this case examined nothing`);
    return one;
  };

  /** The published body, or a loud failure — the fixture is a page, and a notice would answer neither arm. */
  const publishedBody = (value: unknown) => {
    const parsed = parseThesisBody(value);
    if ('withdrawn' in parsed) throw new Error('the fixture parsed as a withdrawal notice, which carries no appeals');
    return parsed;
  };

  it('a REQUESTED appeal parses with the appendix’s five keys and NO gapId', () => {
    const parsed = publishedBody(withAppeals({ call: [], requests: [REQUEST] }));
    const request = only(parsed.appeals.requests, 'appeals.requests');
    expect([Object.keys(request).sort(), request]).toEqual([
      ['addresses', 'authority', 'legalBasis', 'restsOn', 'text'],
      REQUEST,
    ]);
  });

  it('a CALLED appeal parses with the appendix’s four keys and NO gapId', () => {
    const parsed = publishedBody(withAppeals({ call: [CALL_ITEM], requests: [] }));
    const item = only(parsed.appeals.call, 'appeals.call');
    expect([Object.keys(item).sort(), item]).toEqual([
      ['unit', 'whatIsNeeded', 'whoWouldHaveSeenIt', 'window'],
      CALL_ITEM,
    ]);
  });

  it('no module of the public thesis surface reaches the signed-in session: no authHeaders, no lib/session, no AuthContext', () => {
    const offenders = publicThesisModules().flatMap((module) => {
      const file = join(FRONTEND, module);
      const imported = importsOf(file)
        .filter((found) => found.module === 'src/lib/session.ts' || found.module === 'src/context/AuthContext.tsx')
        .map((found) => `${module} imports ${String(found.module)}`);
      const named = stringsIn(file)
        .filter((found) => found.text.includes('authHeaders'))
        .map((found) => `${module}:${String(found.line)} names authHeaders`);
      return [...imported, ...named];
    });
    expect(offenders).toEqual([]);
  });
});
