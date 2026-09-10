// ---------------------------------------------------------------------------
// NO UNIT TEST MAY REACH A REAL CHAIN — enforced by the harness, not remembered
// per file. Applied by test/setupNoRealChain.ts; held by
// test/chainVariablesHidden.test.ts.
//
// The three variables `Web3Service`'s constructor requires — and that
// `readChainIdentity` needs before it opens a provider — are hidden from every
// test, so a test that forgets to mock the chain fails loudly at construction
// instead of quietly spending a request, or worse, getting a real answer. They
// are deleted rather than set to placeholders, because a placeholder RPC
// endpoint is a network call that hangs instead of one that fails.
//
// FOUND, NOT ANTICIPATED — TWICE.
//
// First: `evidenceConfirmPromotionGate` (deleted since, at evidence step 11a)
// asserted that the /confirm route does NOT answer 409 for a non-contradicted
// diff, and passed only because RPC_URL
// happened to be unset. The moment a `@prisma/client` value import entered that
// route's module graph, Prisma loaded `.env` on import and the test made a live
// call to Base Sepolia, whose honest "already registered" reply came back as
// exactly the 409 the test rules out. That file was repaired to mock the chain,
// and the variables were deleted in `setupFiles` as the fix for the class.
//
// Second, 2026-09-10: that deletion never held against the loader that
// motivated it. `setupFiles` runs BEFORE the test file's imports, and the
// generated Prisma client dotenv-loads `backend/.env` AT IMPORT
// (`warnEnvConflicts` → `tryLoadEnvs`, whose expander writes every key in the
// file back to `process.env`); constructing a PrismaClient loads it again. So
// on a laptop with a `.env`, every test importing `@prisma/client` saw RPC_URL
// again — and in CI, which has no `.env`, none did. `onChainVerification` then
// raced a live RPC against an 8 s timeout inside jest's 5 s one, and `staging`
// ran 1,460/1,462 locally on source CI had passed at 1,462.
//
// Deleting at the right MOMENTS is the only enforcement that loader leaves
// open. A key that is present but undefined gets overwritten by the write-back,
// and a key made read-only would also break the tests that set these variables
// on purpose. A test needing chain behaviour mocks `Web3Service` and
// `lib/chainIdentity`, or sets the variables in its OWN `beforeEach` — which
// runs after the root one — against a mocked ethers, as `web3RegistryGuard` and
// `web3ReadEvidenceRecord` do.
// ---------------------------------------------------------------------------

export const CHAIN_VARIABLES = [
  'RPC_URL',
  'REGISTRAR_PRIVATE_KEY',
  'EVIDENCE_REGISTRY_ADDRESS',
] as const;

export function hideChainVariables(): void {
  for (const name of CHAIN_VARIABLES) {
    delete process.env[name];
  }
}
