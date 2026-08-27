jest.mock('axios');

import axios from 'axios';
import { fetchCaptureBytes, fetchCaptureHtml, WaybackFetchError } from '../src/lib/archiveHttp';

const mockGet = axios.get as jest.Mock;
const isAxiosError = axios.isAxiosError as unknown as jest.Mock;

const URL_ = 'https://corona.health.gov.il/vaccine-for-covid/';
const TS = '20231129211127';
/**
 * Retries off. These tests are about the MESSAGE, not the retry policy — and a
 * transient code (ECONNRESET, ECONNABORTED) would otherwise spend the backoff
 * before the message is ever built.
 */
const NO_RETRY = { maxRetries: 0 };

/** An axios failure, shaped the way axios actually shapes them. */
function axiosFailure(opts: { code?: string; message: string; status?: number }) {
  return Object.assign(new Error(opts.message), {
    isAxiosError: true,
    code: opts.code,
    ...(opts.status === undefined ? {} : { response: { status: opts.status, headers: {} } }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  isAxiosError.mockImplementation(
    (e: unknown) => typeof e === 'object' && e !== null && 'isAxiosError' in e,
  );
});

// ---------------------------------------------------------------------------
// The message must name the CAUSE, not a status that is irrelevant to it.
//
// `HTTP ${err.response?.status ?? 'unknown'}` cost diagnosis twice during live
// operations. It was not lying — a response really had arrived with 200 and
// axios threw for another reason — so an accurate fact was reported in place of
// the relevant one, which reads as an explanation and stops the next question
// being asked.
// ---------------------------------------------------------------------------

describe.each([
  ['fetchCaptureBytes', fetchCaptureBytes],
  ['fetchCaptureHtml', fetchCaptureHtml],
])('%s failure messages', (_name, fetchFn) => {
  it('does NOT report a bare HTTP 200 when the transfer broke after a good response', async () => {
    // THE CASE THAT MISLED TWICE. A timeout mid-body leaves response.status 200.
    mockGet.mockRejectedValue(
      axiosFailure({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded', status: 200 }),
    );

    const err = await fetchFn(URL_, TS, NO_RETRY).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WaybackFetchError);
    const msg = (err as Error).message;
    expect(msg).toMatch(/AFTER a successful HTTP 200/);
    expect(msg).toContain('ECONNABORTED');
    // The old message was exactly this, and it is what has to stop appearing.
    expect(msg).not.toMatch(/snapshot 20231129211127: HTTP 200$/);
  });

  it('says NO RESPONSE when the archive never answered', async () => {
    mockGet.mockRejectedValue(axiosFailure({ code: 'ECONNRESET', message: 'socket hang up' }));

    const err = await fetchFn(URL_, TS, NO_RETRY).catch((e: unknown) => e);

    expect((err as Error).message).toMatch(/no response from the archive/);
    expect((err as Error).message).toContain('ECONNRESET');
    // Distinguishable from a real status, because retry-or-stop turns on it.
    expect((err as Error).message).not.toMatch(/HTTP \d/);
    expect((err as WaybackFetchError).status).toBeNull();
  });

  it('reports a real error status plainly, and keeps it on the error', async () => {
    mockGet.mockRejectedValue(
      axiosFailure({ code: 'ERR_BAD_REQUEST', message: 'Request failed', status: 404 }),
    );

    const err = await fetchFn(URL_, TS, NO_RETRY).catch((e: unknown) => e);

    expect((err as Error).message).toMatch(/HTTP 404/);
    expect((err as WaybackFetchError).status).toBe(404);
  });

  it('never drops the error code — it is what separates transient from permanent', async () => {
    mockGet.mockRejectedValue(axiosFailure({ message: 'maxContentLength exceeded', status: 200 }));

    const err = await fetchFn(URL_, TS, NO_RETRY).catch((e: unknown) => e);

    // No `code` on this one; the message still has to carry the reason rather
    // than silently rendering `undefined`.
    expect((err as Error).message).toContain('maxContentLength exceeded');
    expect((err as Error).message).not.toContain('undefined');
  });
});

describe('WaybackFetchError.status is not a success signal', () => {
  it('records 200 on a failed transfer, and the message says the fetch failed', async () => {
    // The field stays faithful to what the archive returned — but a consumer
    // reading `status` alone would see 200 for a fetch that produced nothing.
    // The doc comment on the field says so; this pins the behaviour it warns about.
    mockGet.mockRejectedValue(
      axiosFailure({ code: 'ECONNABORTED', message: 'timeout', status: 200 }),
    );

    const err = (await fetchCaptureBytes(URL_, TS, NO_RETRY).catch((e: unknown) => e)) as WaybackFetchError;

    expect(err.status).toBe(200);
    expect(err.message).toMatch(/failed/i);
  });
});

// ---------------------------------------------------------------------------
// `null` and `identity` must stay distinguishable.
//
// Third time this project has found a column conflating "we never looked" with
// "there was nothing to record" — after §3's UNAVAILABLE-vs-data rule and the
// 404 living in a scan job's JSON blob. This one appeared in a column added
// specifically to remove an ambiguity.
// ---------------------------------------------------------------------------

describe('content-encoding normalisation', () => {
  function ok(headers: Record<string, string>) {
    return { data: new ArrayBuffer(8), status: 200, statusText: 'OK', headers, config: {} };
  }

  it('normalises an ABSENT header to identity, never to null', () => {
    // The server said nothing; HTTP convention names nothing as identity. This
    // is a normalisation, not an observation — and it is what keeps null free to
    // mean "we never observed the headers".
    mockGet.mockResolvedValue(ok({ 'content-type': 'text/html' }));
    return expect(fetchCaptureBytes(URL_, TS, NO_RETRY)).resolves.toMatchObject({
      contentEncoding: 'identity',
    });
  });

  it('passes a DECLARED encoding through verbatim', () => {
    mockGet.mockResolvedValue(ok({ 'content-type': 'text/html', 'content-encoding': 'gzip' }));
    return expect(fetchCaptureBytes(URL_, TS, NO_RETRY)).resolves.toMatchObject({
      contentEncoding: 'gzip',
    });
  });

  it('never returns null, so null in the column can only mean "never observed"', async () => {
    mockGet.mockResolvedValue(ok({}));
    const { contentEncoding } = await fetchCaptureBytes(URL_, TS, NO_RETRY);
    expect(contentEncoding).not.toBeNull();
    expect(contentEncoding).toBe('identity');
  });
});
