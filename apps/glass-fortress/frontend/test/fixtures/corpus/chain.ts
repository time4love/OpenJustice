import type { ChainAnswer } from '@/types/corpus';

// Hand-written from the appendix (plan §4 :880–:883), never captured from a live response, so the fixture
// asserts what the CONTRACT says rather than what one environment answered on one day. Each is TYPED, so
// `tsc` checks it against `types/corpus.ts` — a fixture that drifts from the appendix fails the build.
//
// RE-WRITTEN 2026-09-19. Its first version was a FLAT, single-capture object with `verdict` and
// `verdictVersion`, a shape nothing serves: A4 :1111–:1115 names the FIELDS and not the ENVELOPE, and the
// envelope was guessed. The route answers a `captures` array — see the type's own note for the measurement.

/** `check_on_chain_status`' answer for a registered, attributed capture (A4 :1111–:1114). */
export const chainAnswer: ChainAnswer = {
  available: true,
  page: { url: 'https://example.gov/one/', public: true },
  captures: [
    {
      capture: '20211223211940',
      documentHash: '3333333333333333333333333333333333333333333333333333333333333333',
      isRegistered: true,
      registryIndex: 7,
      submitter: '0x1111111111111111111111111111111111111111',
      attributed: true,
      anchoredHash: '3333333333333333333333333333333333333333333333333333333333333333',
      anchoredHashMatchesDocumentHash: true,
      storedVerdict: { verdict: 'VERIFIED', verifierVersion: 'verdict-fixture-1', checkedAt: '2026-09-15T05:06:27.851Z', attributed: true },
    },
  ],
  registry: { chainId: 84532, registryAddress: '0x9999999999999999999999999999999999999999' },
};
