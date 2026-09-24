import { publicApiUrl } from './publicRoutes';
import { hashToken, tokensEqual } from './tokenHash';

// ---------------------------------------------------------------------------
// THE SIGNED TEXT LINK — docs/gf-document-flows.md A5 :1504-:1505 and A4 :1425 as ruled 2026-09-24 (Q1 of
// step 30's close): every `textUrl` `read_document` hands is A5 :1504's SIGNED ARM, `{ url, expiresAt }` as
// `bytesUrl` is — the same route for the envelope's link and each version's, never a bucket object and never a
// second route.
//
// THE SIGNATURE is HMAC-SHA256 with TOKEN_HMAC_SECRET — the server's existing secret, through `tokenHash`'s one
// reader of it, so no new variable exists (the researcher, 2026-09-24) — over a FIXED `document-text:` LABEL FIRST,
// then the commitment, the version hash and the expiry. The label separates this MAC from every other use of the
// secret: a bearer token's hash can never verify as a text link, nor the reverse.
//
// A BEARER LINK TO GATED TEXT that may carry names as printed (§5 as ruled), minted for a read being made now, so
// it lives TEN MINUTES — a stale link costs one more `read_document`. It reads no caller identity: the signature
// proves the mint.
// ---------------------------------------------------------------------------

/** How long a text link lives — an operational parameter beside the sweep's, changed by measurement (A5 :1505). */
export const TEXT_LINK_SECONDS = 600;

/** The label the MAC is taken over FIRST — this link's purpose, and no other's. */
const LABEL = 'document-text:';

/** A MAC as `hashToken` prints it — 64 lowercase hex. Anything else is not a signature, and is never compared. */
const MAC = /^[0-9a-f]{64}$/;

/** What the content route reads off a link — each a query value as sent, never trusted. */
export interface SignedTextQuery {
  commitment: string;
  version?: string;
  expires?: string;
  sig?: string;
}

/** A request's query as Express parses it — each value a string, a list or an object, never trusted. */
interface LinkQuery {
  version?: unknown;
  expires?: unknown;
  sig?: unknown;
}

const one = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** The link's query, as a request carries it — ONE spelling for the content route and the staging gate's exemption. */
export function signedTextQueryOf(commitment: string, query: LinkQuery): SignedTextQuery {
  return { commitment, version: one(query.version), expires: one(query.expires), sig: one(query.sig) };
}

/** The one path a text link names — `GET /api/documents/:commitment/content` (A5 :1504). */
const TEXT_PATH = /^\/api\/documents\/([^/]+)\/content$/;

/**
 * Whether a request is a VALID SIGNED TEXT READ: GET, on the content path, carrying a signature `verifyTextLink` accepts
 * now. The staging gate's ONE exemption (Q1 of R79's round 2, ruled 2026-09-24) — every other request, and this path
 * unsigned, is not one.
 */
export function isSignedTextRead(method: string, path: string, query: LinkQuery, now: number = Date.now()): boolean {
  if (method !== 'GET') return false;
  const commitment = TEXT_PATH.exec(path)?.at(1);
  return commitment !== undefined && verifyTextLink(signedTextQueryOf(commitment, query), now);
}

const macOf = (commitment: string, version: string, expires: string): string => hashToken(`${LABEL}${commitment}:${version}:${expires}`);

/** A signed link to ONE version's text, expiring `TEXT_LINK_SECONDS` after `now`. */
export function mintTextLink(commitment: string, version: string, now: number = Date.now()): { url: string; expiresAt: Date } {
  const expiresAt = new Date(now + TEXT_LINK_SECONDS * 1000);
  const expires = String(Math.floor(expiresAt.getTime() / 1000));
  const query = new URLSearchParams({ version, expires, sig: macOf(commitment, version, expires) });
  return { url: publicApiUrl(`/api/documents/${commitment}/content?${query.toString()}`), expiresAt };
}

/** Whether the query carries a signature this server minted, for these values, that has not expired at `now`. */
export function verifyTextLink(query: SignedTextQuery, now: number = Date.now()): boolean {
  const { commitment, version, expires, sig } = query;
  if (version === undefined || expires === undefined || sig === undefined || !MAC.test(sig) || !/^\d+$/.test(expires)) return false;
  if (Number(expires) * 1000 < now) return false;
  return tokensEqual(macOf(commitment, version, expires), sig);
}
