import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { docIdOf } from '../src/lib/documentHash';

// ---------------------------------------------------------------------------
// THE BROWSER/SERVER HASH VECTOR — docs/gf-document-refactor-plan.md §4 :412: "the browser's WebCrypto SHA-256
// … and the server's … agree on one vector, and NAME_MISMATCH fires when one byte is altered". The browser half
// lands at step 30 with the upload dialog (plan :182).
//
// THE VECTOR IS READ FROM THE SERVER'S SOURCE, `backend/src/lib/documentIdentity.ts` :143 (`HASH_VECTOR`), and
// never copied here: a second copy of the vector would be a second spelling that could agree with a drifted
// implementation. The server suite (`backend/test/document/identity.test.ts`) recomputes the same pin.
// ---------------------------------------------------------------------------

const IDENTITY = join(__dirname, '..', '..', 'backend', 'src', 'lib', 'documentIdentity.ts');

function serverVector(): { bytes: Uint8Array<ArrayBuffer>; docId: string } {
  const source = readFileSync(IDENTITY, 'utf8');
  const block = /export const HASH_VECTOR = \{([\s\S]*?)\} as const;/.exec(source)?.[1];
  const bytes = block === undefined ? undefined : /bytes: '([A-Za-z0-9+/=]+)'/.exec(block)?.[1];
  const docId = block === undefined ? undefined : /docId: '(0x[0-9a-f]{64})'/.exec(block)?.[1];
  if (bytes === undefined || docId === undefined) throw new Error(`no HASH_VECTOR with bytes and docId in ${IDENTITY}`);
  return { bytes: new Uint8Array(Buffer.from(bytes, 'base64')), docId };
}

const subtle = webcrypto.subtle as unknown as SubtleCrypto;

describe('the browser half of the shared vector (plan §4 :412)', () => {
  it('reads the server’s vector at all — 27 bytes, and a 0x + 64 hex name', () => {
    const { bytes, docId } = serverVector();
    expect(bytes).toHaveLength(27);
    expect(docId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('WebCrypto SHA-256 over the file’s bytes, AS GIVEN, is the server’s DOC_ID for them', async () => {
    const { bytes, docId } = serverVector();
    expect(await docIdOf(bytes, subtle)).toBe(docId);
  });

  it('one altered byte is another name — the world NAME_MISMATCH refuses', async () => {
    const { bytes, docId } = serverVector();
    const altered = new Uint8Array(bytes);
    altered[0] = (altered.at(0) ?? 0) ^ 0x01;
    expect(await docIdOf(altered, subtle)).not.toBe(docId);
  });
});
