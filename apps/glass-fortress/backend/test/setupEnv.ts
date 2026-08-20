// Runs before each test file's own imports are evaluated (Jest `setupFiles`,
// not `setupFilesAfterEnv`) — required because src/oauth/oidcProvider.ts
// reads OAUTH_JWKS/OAUTH_COOKIE_KEYS eagerly at module load (it constructs a
// real Provider synchronously at import time), so per-test `process.env[...]
// = ...` inside `beforeAll` (the pattern used for TOKEN_HMAC_SECRET
// elsewhere) is too late — imports are hoisted ahead of any test-body code.
//
// Fixture key below is a throwaway P-256 keypair with no purpose beyond
// letting oidc-provider construct successfully in tests; nothing in the test
// suite verifies signatures against it.
process.env['OAUTH_JWKS'] ??= JSON.stringify({
  keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      x: '0-2TiekK42bxGhi5HVQUiffZsFPBtvgtm4iQXnK5pIk',
      y: '22MD2IbORQOPSZGFLzN2LgLYazTWwyfGbJIM_0UHmgU',
      d: 'IvhoBrIFqxl-YN5AqFI1HkyHqJc8pK79oaNMnnzXpVY',
    },
  ],
});
process.env['OAUTH_COOKIE_KEYS'] ??= 'jest-oauth-cookie-key';
