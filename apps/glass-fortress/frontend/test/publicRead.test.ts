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
