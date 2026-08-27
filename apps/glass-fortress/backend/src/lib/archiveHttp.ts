import axios, { type AxiosError } from 'axios';

// ---------------------------------------------------------------------------
// Talking to the Internet Archive.
//
// Shared by the forensic scanner (which walks a page's whole history) and the
// verification tools (which re-fetch one capture to check a claim against it).
// Both hit the same third-party service with the same failure modes, so what
// counts as "transient", how long to wait, and how an outage is distinguished
// from a missing capture are decided in ONE place. Two copies would drift, and
// the first symptom would be a verification tool reporting "phrase absent" for
// a page the archive simply failed to return.
// ---------------------------------------------------------------------------

/**
 * Timeout for the CDX index query.
 *
 * The Internet Archive's CDX API is slow rather than unavailable: a measured
 * query for a government page with years of snapshots took 48s on 2026-08-22,
 * against a previous 30s ceiling that failed the whole scan. Generous here is
 * cheap — the alternative is a scan that reports FAILED on a URL the archive
 * holds perfectly well.
 */
export const CDX_TIMEOUT_MS = 60_000;

/** Timeout for fetching one archived snapshot. Plain page loads — far quicker than CDX. */
export const SNAPSHOT_TIMEOUT_MS = 25_000;

/**
 * Retry attempts for the CDX index query.
 *
 * Generous, because CDX runs ONCE per batch and its failure kills the whole
 * scan — there is nothing to skip past.
 */
export const CDX_MAX_RETRIES = 4;

/**
 * Retry attempts for one archived snapshot fetch.
 *
 * Deliberately far smaller than CDX's. A batch fetches up to MAX_SNAPSHOTS
 * snapshots and an individual failure is already handled gracefully — the pair
 * is skipped and the scan continues. Sharing CDX's budget meant each timing-out
 * snapshot burned 8+16+32+64 = 120s of back-off, so a slow archive could leave
 * one job sleeping for well over an hour while reporting SCANNING and showing
 * no progress. One retry absorbs a blip; anything more pays a large cost for a
 * skippable item.
 */
export const SNAPSHOT_MAX_RETRIES = 1;

/** Base delay (ms) for exponential back-off on 503 retries. Doubles each attempt. */
export const CDX_RETRY_BASE_MS = 8_000;

/**
 * The retry budget for a researcher-facing call, as opposed to a background scan.
 *
 * The scanner can afford 8+16+32+64 seconds of back-off because nobody is
 * waiting on it. The verification tools are called synchronously by a
 * researcher mid-sentence, and they are BUILT to report an unreachable archive
 * honestly — so failing fast and saying "the archive did not answer" is a
 * better answer than a two-minute silence followed by the same words.
 */
export const INTERACTIVE_RETRY: { maxRetries: number; baseDelayMs: number } = {
  maxRetries: 1,
  baseDelayMs: 1_000,
};

/** Sent on CDX index queries — identifies this project to the archive. */
export const CDX_USER_AGENT = 'GlassFortress-ForensicScanner/1.0 (legal research)';

/**
 * Sent on archived page fetches. A browser UA, because some archived responses
 * are served differently to an unrecognised client.
 */
export const SNAPSHOT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Pause — used for back-off here and for inter-request pacing by the scanner. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True for Wayback failures worth retrying.
 *
 * The Internet Archive fails in two distinct ways and only one of them carries
 * an HTTP status. A timeout, connection reset, or DNS failure produces an axios
 * error with NO response, so a status-only check reads `undefined` and gives up
 * immediately — which is what happened to the retry logic here until
 * 2026-08-22: four retries with exponential back-off, dead code for the
 * archive's most common failure mode.
 *
 * Deliberately does not retry 4xx other than 429. A 404 means the archive does
 * not hold the URL, and retrying it just costs time to reach the same answer.
 */
export function isTransientWaybackError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true; // timeout / reset / DNS — no status to inspect
  const status = err.response.status;
  return status === 429 || status >= 500;
}

/**
 * Thin retry wrapper for Wayback Machine HTTP requests.
 *
 * Retries on transient failures with exponential back-off. Non-transient errors
 * are rethrown immediately.
 *
 * `maxRetries` is required rather than defaulted: the two call sites have
 * genuinely different economics (see CDX_MAX_RETRIES and SNAPSHOT_MAX_RETRIES),
 * and a default is how they came to share one budget in the first place.
 *
 * `baseDelayMs` exists so tests can exercise the budget without sleeping.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries, baseDelayMs = CDX_RETRY_BASE_MS }: { maxRetries: number; baseDelayMs?: number },
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isTransientWaybackError(err) && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        const reason = axios.isAxiosError(err)
          ? (err.response?.status ?? err.code ?? 'no response')
          : 'unknown';
        console.warn(
          `[archiveHttp] transient failure (${String(reason)}) — retrying in ${String(delay)}ms ` +
            `(attempt ${String(attempt + 1)}/${String(maxRetries)})`,
        );
        await sleep(delay);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Thrown when a Wayback Machine HTTP request fails after retries are exhausted.
 * Carries enough detail to classify the failure — an archive.org outage
 * (retry later, our pipeline is fine) vs. something else worth investigating.
 */
/**
 * Why a Wayback fetch failed, naming the CAUSE rather than a status that may be
 * irrelevant to it.
 *
 * This exists because `HTTP ${err.response?.status ?? 'unknown'}` cost diagnosis
 * TWICE during live operations — once on a staging backfill, where a capture had
 * to be curled to establish it was fine, and once inside a production migration
 * window, where it reported `HTTP 200` for what the retry line above it showed
 * was an ECONNABORTED timeout.
 *
 * The message was not lying. A response really had arrived with 200 and axios
 * threw for another reason — a timeout mid-body, or maxContentLength exceeded —
 * so the status was accurate and beside the point, while the actual cause
 * (`err.code`) was dropped. **An accurate fact reported in place of the relevant
 * one reads as an explanation and prevents the next question from being asked.**
 *
 * What it must distinguish, because retry-or-stop turns on it:
 *
 *   no response          → transient almost always; retry
 *   HTTP 4xx/5xx         → the archive answered; 404 is permanent, 503 is not
 *   failed AFTER a 2xx   → the archive answered FINE and the transfer broke;
 *                          transient, and the case that read as success twice
 */
function describeFetchFailure(err: AxiosError): { detail: string; status: number | null } {
  const code = err.code ?? 'no error code';
  const status = err.response?.status ?? null;

  if (status === null) {
    return { detail: `no response from the archive (${code}: ${err.message})`, status: null };
  }
  if (status >= 200 && status < 300) {
    return {
      detail: `the transfer failed AFTER a successful HTTP ${String(status)} — ` +
        `the archive answered and the body did not arrive (${code}: ${err.message})`,
      status,
    };
  }
  return { detail: `HTTP ${String(status)} (${code})`, status };
}

export class WaybackFetchError extends Error {
  readonly offline: boolean;
  /**
   * HTTP status the archive returned, or null when there was no response at all.
   *
   * A 2xx here does NOT mean success — see describeFetchFailure. It means the
   * archive answered and the transfer failed afterwards. Never treat this field
   * as a success signal; it records what was returned, not whether the fetch
   * worked, and the fetch demonstrably did not.
   */
  readonly status: number | null;
  constructor(message: string, offline: boolean, status: number | null = null) {
    super(message);
    this.name = 'WaybackFetchError';
    this.offline = offline;
    this.status = status;
  }
}

/**
 * True when the archive responded 503 — the signature of the Internet Archive's
 * own "Temporarily Offline" outage page, as opposed to a one-off or rate-limit
 * style failure (404, timeout, etc).
 */
export function isWaybackOffline(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 503;
}

/**
 * The URL that serves an archived capture as it was, without the Wayback
 * Machine's own toolbar injection — the `id_` modifier.
 *
 * Verification reads this and nothing else: the viewer URL (`/web/<ts>/`)
 * wraps the page in archive.org's chrome, and a phrase check run against that
 * would be checking archive.org's markup as much as the captured page.
 */
export function rawCaptureUrl(timestamp: string, url: string): string {
  return `http://web.archive.org/web/${timestamp}id_/${url}`;
}

/** The human-facing Wayback viewer URL for a capture — what a reader opens to check. */
export function viewerCaptureUrl(timestamp: string, url: string): string {
  return `https://web.archive.org/web/${timestamp}/${url}`;
}

/**
 * Fetch one archived capture's HTML exactly as captured.
 *
 * Throws WaybackFetchError carrying the status, so a caller can tell
 * "the archive does not hold this capture" (404) from "the archive did not
 * answer" (timeout, 503) — a distinction the verification tools report as two
 * different unavailable states and must never collapse into one.
 */
/**
 * Fetch a capture as the PAYLOAD, not as a decoded string.
 *
 * `fetchCaptureHtml` asks axios for `responseType: 'text'`, which decodes the
 * body using a charset axios infers. That is one transformation away from what
 * the Archive served, and Level 1 was reopened precisely because a
 * transformation was stored under the name of the thing itself. Bytes plus the
 * declared Content-Type is the pair that can be re-decoded forever.
 *
 * The text path is kept for callers that genuinely want text and nothing else
 * (Readability extraction), so this is an addition rather than a replacement.
 */
export async function fetchCaptureBytes(
  url: string,
  timestamp: string,
  retry: { maxRetries: number; baseDelayMs?: number } = { maxRetries: SNAPSHOT_MAX_RETRIES },
): Promise<{ bytes: Buffer; contentType: string | null; contentEncoding: string | null }> {
  try {
    const response = await withRetry(
      () =>
        axios.get<ArrayBuffer>(rawCaptureUrl(timestamp, url), {
          timeout: SNAPSHOT_TIMEOUT_MS,
          headers: {
            'User-Agent': SNAPSHOT_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            // Ask for the bytes as archived. Without this the Archive may serve
            // gzip and axios will inflate it before we ever see it.
            'Accept-Encoding': 'identity',
          },
          responseType: 'arraybuffer',
          // THE LINE WHOSE ABSENCE REOPENED LEVEL 1 A SECOND TIME.
          //
          // axios decompresses transparently in Node, so a gzipped archived
          // record arrived INFLATED and was stored under the name of the
          // payload — a derivative under the name of the original, the same
          // defect as rawText one layer lower and better disguised, because
          // responseType: 'arraybuffer' looks like it settles the question.
          //
          // Measured 2026-08-27: 76 of 83 captures matched their CDX digest
          // anyway, because the Archive served those uncompressed and the
          // inflate was a no-op — a green result from a mechanism that never
          // checked. The 7 served gzipped did not match, and re-fetching with
          // this line set reproduces the CDX digest exactly.
          decompress: false,
          maxContentLength: 5 * 1024 * 1024,
        }),
      retry,
    );
    const type = response.headers['content-type'];
    const encoding = response.headers['content-encoding'];
    return {
      bytes: Buffer.from(response.data),
      contentType: typeof type === 'string' ? type : null,
      // Stored, not discarded: the meaning of the bytes depends on it. This is
      // the SECOND response header to prove load-bearing — charset was the
      // first and happened not to matter. Encoding mattered on 8% of captures.
      contentEncoding: typeof encoding === 'string' ? encoding : null,
    };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      // One call for both, so the message a human reads and the status code
      // reads cannot drift apart.
      const failure = describeFetchFailure(err);
      throw new WaybackFetchError(
        `Failed to fetch snapshot ${timestamp}: ${failure.detail}`,
        isWaybackOffline(err),
        failure.status,
      );
    }
    throw err;
  }
}

export async function fetchCaptureHtml(
  url: string,
  timestamp: string,
  retry: { maxRetries: number; baseDelayMs?: number } = { maxRetries: SNAPSHOT_MAX_RETRIES },
): Promise<string> {
  try {
    const response = await withRetry(
      () =>
        axios.get<string>(rawCaptureUrl(timestamp, url), {
          timeout: SNAPSHOT_TIMEOUT_MS,
          headers: {
            'User-Agent': SNAPSHOT_USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          responseType: 'text',
          maxContentLength: 5 * 1024 * 1024,
        }),
      retry,
    );
    return response.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      // One call for both, so the message a human reads and the status code
      // reads cannot drift apart.
      const failure = describeFetchFailure(err);
      throw new WaybackFetchError(
        `Failed to fetch snapshot ${timestamp}: ${failure.detail}`,
        isWaybackOffline(err),
        failure.status,
      );
    }
    throw err;
  }
}
