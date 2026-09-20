import { RESEARCH_REFUSALS, researchFetch, returnToOf } from '@/lib/researchFetch';
import { parsePages } from '@/lib/researchBody';
import { globalFetchDouble } from './render';
import { requireSubjects } from './scan';
import { pages } from './fixtures/research/reads';

// ---------------------------------------------------------------------------
// THE ONE GATED READER — docs/gf-ui-flows.md §13 :469–:480, §7 :310–:313, §37 :1037; plan UI-8 :713–:715, :771.
//
// THE REAL MODULE, NOT A DOUBLE OF IT. These cases exercise `researchFetch` through `authedFetch` and
// `apiUrl`, with `global.fetch` answered by URL — the shape `publicRead.test.ts` (UI-5) uses for the public
// door. A double of the reader would hold the double.
// ---------------------------------------------------------------------------

const SESSION_KEY = 'gf_access_token';
const PATH = '/api/research/pages';

function signIn(): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'token-one', refreshToken: null, expiresAt: null }));
}

function answering(answers: Record<string, { status: number; body?: unknown }>) {
  return globalFetchDouble(answers);
}

afterEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
});

describe('research-fetch — the door', () => {
  it('RF-1 A BODY IS PARSED BY THE CALLER`S OWN PARSER, and the request is a GET carrying the bearer', async () => {
    signIn();
    const fetching = answering({ [PATH]: { status: 200, body: pages } });
    try {
      const read = await researchFetch(PATH, parsePages);
      expect(read.state).toBe('BODY');
      if (read.state !== 'BODY') throw new Error('the read did not answer a body');
      expect(requireSubjects('the parsed pages', read.body).length).toBe(pages.length);

      const call = requireSubjects('the calls made', fetching.calls)[0];
      // EVERY REQUEST GOES TO `apiUrl(...)`. With no `NEXT_PUBLIC_API_URL` set, that is the path itself —
      // which is what `lib/stagingApiAuth.ts` recognises as a backend call and attaches the staging token to.
      expect(call.url).toBe(PATH);
      expect(call.init?.method).toBe('GET');
      expect(new Headers(call.init?.headers).get('authorization')).toBe('Bearer token-one');
      // `scope` IS NEVER SENT — the route fixes it, and a `scope` in the query is a malformed parameter.
      expect(call.url).not.toMatch(/scope/);
    } finally {
      fetching.restore();
    }
  });

  it('RF-2 A 401 IS THE SIGNED-OUT STATE, and the `returnTo` it carries is BARE — the locale is NOT in it', async () => {
    window.history.pushState({}, '', '/he/research/theses/thesis-one?since=2026-01-01');
    const fetching = answering({ [PATH]: { status: 401, body: { error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' } } });
    try {
      const read = await researchFetch(PATH, parsePages);
      expect(read.state).toBe('SIGNED_OUT');
      if (read.state !== 'SIGNED_OUT') throw new Error('the read did not answer the signed-out state');
      // A PREFIXED `returnTo` COMES BACK `/he/he/…`, WHICH IS A 404 — `/auth/callback` pushes it through the
      // locale-aware router, which prefixes the locale again (OAuth plan §7.0f, found on the first sign-in).
      expect(read.returnTo).toBe('/research/theses/thesis-one?since=2026-01-01');
      expect(read.returnTo).not.toMatch(/^\/he\//);
    } finally {
      fetching.restore();
    }
  });

  it('RF-3 A 403 IS ITS OWN STATE — one sentence, and never the signed-out redirect', async () => {
    signIn();
    const fetching = answering({ [PATH]: { status: 403, body: { error: 'Forbidden', message: 'not an approved researcher' } } });
    try {
      const read = await researchFetch(PATH, parsePages);
      expect(read.state).toBe('NOT_A_RESEARCHER');
    } finally {
      fetching.restore();
    }
  });

  it('RF-4 A 404 INSIDE THE PREFIX NAMES ITS REFUSAL — every one of the five, and a sixth THROWS', async () => {
    signIn();
    for (const code of requireSubjects('the named refusals', RESEARCH_REFUSALS)) {
      const fetching = answering({ [PATH]: { status: 404, body: { error: 'not found', code } } });
      try {
        const read = await researchFetch(PATH, parsePages);
        expect(read).toEqual({ state: 'REFUSED', code });
      } finally {
        fetching.restore();
      }
    }

    // A REFUSAL WITH NO APPROVED SENTENCE IS LOUD. Copy lands approved or not at all, so a page must not
    // render a sixth code through one of the five sentences.
    const unknown = answering({ [PATH]: { status: 404, body: { error: 'not found', code: 'NO_SUCH_THING' } } });
    try {
      await expect(researchFetch(PATH, parsePages)).rejects.toThrow(/NO_SUCH_THING/);
    } finally {
      unknown.restore();
    }
  });

  it('RF-5 A 400 IS THE FILTERS` STATE, and an unreachable backend is a STATE and not a throw', async () => {
    signIn();
    const refused = answering({ [PATH]: { status: 400, body: { error: 'bad request', code: 'INVALID_OUTCOME' } } });
    try {
      expect((await researchFetch(PATH, parsePages)).state).toBe('FILTERS_REFUSED');
    } finally {
      refused.restore();
    }

    // The double rejects a URL it was not given, which is what a dead backend does to a fetch.
    const offline = answering({});
    try {
      expect((await researchFetch(PATH, parsePages)).state).toBe('UNREACHABLE');
    } finally {
      offline.restore();
    }
  });

  it('RF-6 A BODY THAT DRIFTED FROM THE APPENDIX FAILS AT THE READ, naming the field', async () => {
    signIn();
    const drifted = pages.map((page) => ({ ...page, public: undefined }));
    const fetching = answering({ [PATH]: { status: 200, body: drifted } });
    try {
      await expect(researchFetch(PATH, parsePages)).rejects.toThrow(/pages\[0\]\.public/);
    } finally {
      fetching.restore();
    }
  });

  it('RF-7 `returnToOf` IS THE ONE SPELLING OF THE BARE PATH — both locales, the root, and a path with neither', () => {
    expect(returnToOf({ pathname: '/he/research', search: '' })).toBe('/research');
    expect(returnToOf({ pathname: '/en/research/corpus', search: '?page=one' })).toBe('/research/corpus?page=one');
    expect(returnToOf({ pathname: '/he', search: '' })).toBe('/');
    expect(returnToOf({ pathname: '/research', search: '' })).toBe('/research');
  });
});

describe('research-fetch — the headers are MERGED, never spread', () => {
  it('RF-8 A `Headers` INSTANCE FROM THE CALLER SURVIVES, and the bearer is set beside it', async () => {
    signIn();
    const fetching = answering({ [PATH]: { status: 200, body: pages } });
    try {
      // A plain-object spread drops a `Headers` instance to nothing — the caller's header AND the bearer with
      // it, which is a request that then reads as signed out for a reason no state names.
      await researchFetch(PATH, parsePages, { headers: new Headers({ 'X-Case': 'rf-8' }) });
      const sent = new Headers(requireSubjects('the calls made', fetching.calls)[0].init?.headers);
      expect(sent.get('x-case')).toBe('rf-8');
      expect(sent.get('authorization')).toBe('Bearer token-one');
    } finally {
      fetching.restore();
    }
  });
});
