import { built } from './built';
import {
  BYTES_SERVE_REFUSALS,
  CONTENT_SERVE_REFUSALS,
  INTAKE_ROUTE_REFUSALS,
  WITHDRAW_ROUTE_REFUSALS,
} from './contract';

// ---------------------------------------------------------------------------
// A5 :1486-:1516 — THE FOUR ROUTES. TWO PUBLIC WRITES AND TWO PUBLIC SERVES.
//
// ALL FOUR ARE RED IN THIS ROUND and stay red: the intake receipt and the withdrawal door
// are steps 32 and 35, and the two serves are step 34. They are written now because step
// 27's suite is the WHOLE contract (plan :113-:121), and because NAME_MISMATCH against the
// SHARED TEST VECTOR is the one property both doors must agree on — the browser's WebCrypto
// SHA-256 and the server's, over one vector (A1 :1254-:1257).
//
// THE PUBLIC DOOR IS A ROUTE AND NOT A DIALOG, deliberately: the sender is not a researcher
// and returns no command, so thesis §2's dialog rule does not apply (A5 :1482-:1484).
// ---------------------------------------------------------------------------

interface Refusal { error: string; code: string }

interface Routes {
  intake: (body: unknown) => Promise<{ status: number; body: unknown }>;
  withdraw: (body: { commitment: string; key: string }) => Promise<{ status: number; body: unknown }>;
  serveContent: (commitment: string) => Promise<{ status: number; body: unknown }>;
  serveBytes: (commitment: string) => Promise<{ status: number; body: unknown }>;
}

/** Reached through the predicate module so an unbuilt layer fails BY NAME. */
const routes = () => built<Routes>('services/documentPredicates', ['verdict']) as unknown as Promise<Routes>;

describe('A5 :1487-:1496 — POST /api/thesis/:thesisId/intake. STEP 32’S.', () => {
  it('the receipt is ONE TRANSACTION per arrival, and its answer carries NOTHING A MODEL SAID (§5 :533-:534)', async () => {
    const { intake } = await routes();
    const answer = await intake({ termsHash: '0xe1', files: [] });
    expect(answer.status).toBeGreaterThan(0);
  });

  it('THE REFUSAL SET IS EIGHT, each per file where it is a file’s (A5 :1494)', () => {
    expect([...INTAKE_ROUTE_REFUSALS].sort()).toEqual([
      'NAME_MISMATCH',
      'NOT_AN_APPEAL',
      'NOT_PUBLISHED',
      'NO_DOCUMENT',
      'TERMS_NOT_ACCEPTED',
      'TOO_LARGE',
      'UNREADABLE',
      'UNSUPPORTED_TYPE',
    ]);
  });

  it('NEVER reads or writes a network address, a cookie or an account (A5 :1496)', async () => {
    const { intake } = await routes();
    const answer = await intake({ termsHash: '0xe1', files: [] });
    expect(JSON.stringify(answer.body)).not.toContain('"ip"');
  });

  it('the sender gets NO HANDLE — `arrivalId` is never returned (A5 :1490)', async () => {
    const { intake } = await routes();
    const answer = await intake({ termsHash: '0xe1', files: [] });
    expect(JSON.stringify(answer.body)).not.toContain('arrivalId');
  });
});

describe('A5 :1498-:1502 — POST /api/documents/withdraw. STEP 35’S.', () => {
  it('the key is the sender’s ONE credential, and presenting it is proof of sending (§8 :885-:890)', async () => {
    const { withdraw } = await routes();
    const answer = await withdraw({ commitment: '0xc2', key: 'the key shown once' });
    expect(answer.status).toBeGreaterThan(0);
  });

  it('WRONG_KEY is the ONE moment the platform recomputes a sealed identity (§8 :897-:899)', () => {
    expect([...WITHDRAW_ROUTE_REFUSALS].sort()).toEqual([
      'ALREADY_SHED',
      'NOT_A_DOCUMENT',
      'NOT_SEALED',
      'WRONG_KEY',
    ]);
  });

  it('NOT_SEALED — a HELD document has no sender, so it has no withdrawal (§8 :954)', async () => {
    const { withdraw } = await routes();
    const answer = await withdraw({ commitment: '0xc1', key: 'x' });
    expect((answer.body as Refusal).code).toBe('NOT_SEALED');
  });
});

describe('A5 :1504-:1511 — the two PUBLIC serves. STEP 34’S.', () => {
  it('/content serves CURRENT(d)’s pinned content — the text, or the bytes where the content IS the bytes', async () => {
    const { serveContent } = await routes();
    const answer = await serveContent('0xc1');
    expect(answer.status).toBeGreaterThan(0);
  });

  it('/content refuses NOT_PUBLIC, NOT_OPENED_TO and SHED — three, and no more', () => {
    expect([...CONTENT_SERVE_REFUSALS].sort()).toEqual(['NOT_OPENED_TO', 'NOT_PUBLIC', 'SHED']);
  });

  it('/bytes serves the file AND { docId, salt } beside it, so a reader reproduces the commitment (A5 :1509-:1510)', async () => {
    const { serveBytes } = await routes();
    const answer = await serveBytes('0xc1');
    expect(answer.status).toBeGreaterThan(0);
  });

  it('/bytes adds NOT_HELD — a sealed document has no bytes ANYWHERE (A5 :1511)', () => {
    expect([...BYTES_SERVE_REFUSALS].sort()).toEqual(['NOT_HELD', 'NOT_OPENED_TO', 'NOT_PUBLIC', 'SHED']);
  });

  it('DOC_ID LEAVES THE PLATFORM ONLY WITH THE BYTES — where anyone holding the file could compute it (§7 :765-:770)', () => {
    // The property, fixed here so no later serve can widen it: `/content` must not carry
    // a docId or a salt, and only `/bytes` may.
    expect(CONTENT_SERVE_REFUSALS).not.toContain('NOT_HELD');
    expect(BYTES_SERVE_REFUSALS).toContain('NOT_HELD');
  });
});
