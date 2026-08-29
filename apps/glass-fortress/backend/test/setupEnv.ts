// Runs before each test file's own imports are evaluated (Jest `setupFiles`,
// not `setupFilesAfterEnv`) — required because src/oauth/oidcProvider.ts
// reads OAUTH_JWKS/OAUTH_COOKIE_KEYS eagerly at module load (it constructs a
// real Provider synchronously at import time), so per-test `process.env[...]
// = ...` inside `beforeAll` (the pattern used for TOKEN_HMAC_SECRET
// elsewhere) is too late — imports are hoisted ahead of any test-body code.
//
// Fixture keys below are throwaway keypairs with no purpose beyond letting
// oidc-provider construct successfully in tests; nothing in the test suite
// verifies signatures against them, and neither key is used anywhere else.
//
// BOTH an RSA and an EC key, deliberately. This fixture was EC-only until
// 2026-08-21, which is a large part of why an EC-only OAUTH_JWKS reached
// production unnoticed: the tests modelled the same broken shape as the real
// deployment, so nothing could fail. loadJwks now refuses a JWKS that cannot
// sign RS256 (see its comment), and a fixture that could not satisfy that
// guard would just push the problem back into the test environment.
process.env['OAUTH_JWKS'] ??= JSON.stringify({
  keys: [
    {
      kty: 'RSA',
      n: 'qIz3nk6ZMEkLbV-Clm_Zy8CRaqpwB7wHH2W-H9rAKO5FvPJalsoimXZoGwvGrrIcxw22ZFdfz18aYmUheA4r8Wsh2OhlXtfKnI39BV4229zp7U8g49HWbYHuV1-edCOPA1iCQePOPkPBsAlFkGA-HItUA8vAZfD9ImyY9wsgYGlDAxtJLO2FZR4WJ-V0obhv7izdS3QBAmz2qLsTTAIrI9WMyGXcwberFtFxVIoyszzIapqRc1s1qVFZAsDsiq8C7TgBF-5IjN2WWa_zPkHqqjWi2WDAKJ1JTfwV1pEJi0bJEYuLjtlGt2grd3IshuEFHn8cLnUHe6jOBxZy0WxYOw',
      e: 'AQAB',
      d: 'FYz8pimfjZxxURk6rbh8bQBgt3Y2X87LTFjqb9E8657XnNqR-aC7vsp0cizVyQVuB4d50CeZ0P50das_lcWeGb6cc8r3FyLZPZ4sAVE0C3WaFWUeK_LrC1JnIpXPwULAqOlaskkJ2E06iSMOWXDs0CKCaf_VyFMBUrL29fNevuTRW0n2z9iZjftSvqP6aElKiXi4Tdr6R67g3lWmemuu2gQuiGErStkz-Ygy8rIHi9P9W38m7pzoum2ni2DIFiXPcEwjshfVnUYDCKRSwd6499TSgswvrmp0ZY8PyyPquRRcsoFtWgH3n_kvZzcruUD9Zsm1kLy2EXib30krEJS9CQ',
      p: '3Qwz-tUDL-GGMlzPXgIcOeBfbsNBzJusEG8GF7HTgnOzerqH9hRlMjhdhE83f_DTj06buAXBUgkvjChl3Rt_8S0sxEx3Df08awoYbCEUmLIg4DMIYOZS0s_Hl-jExQPxG-3GDhMIlUTiZRREAeLC-ILMNa9MvC2n7GG4t_p1N1M',
      q: 'wzO8TYJSj5qSOyOVwixSJXEJ6fCAxu7h_93Dj635ZpHyq2ba3w3Y7m-zeNbqya1E0PJuUN-bKXBemNbc6tYwWY5xPyPdCGS3mW0ndJgk-DGs-BBpUCnsKI6_4lu6dfW6KiB7wqMjud2renTh2keWgZAxbkf5a4PQLEzIcrt5xnk',
      dp: 'yYhBr_QbpsDgH_ScH2KfJ2lYuNyOliRsGMOQc3PumeYxAbklEod_x-y53lJ3EE-aIvMRaBLfMZMsZYXDcXaMDHAae5IXjYqPVivrHlJ-u8TT0nTUs7vqUUec-vP-yn0Qi10akGRsE-Os4Wk7o9iB2B8wXdXIiVy61_o0dpCD4_8',
      dq: 'GMi70teGJgeJI4scG6BG-cwFZzeLEjcIaNU-XELJlLVZK1wO1B1M-tEh52jaPKsMPr9ZNFl_uN40lJFLUWHKl8RXKp4iFUu8Z_WM-efLYdvky0ZCKNR50Jh3UoU1An8lmO2w6QCPq6yydgTbHDzUpjSpogfvajA9QTKqjK6zAnk',
      qi: 'COi93PXmunEESKXO2EG53SjyWMmeSH9_elVJ0TX_Rf61fHPRsanKknNwjaXO5T5S6PTXKjkT7PTgAw0WlDt5vXqKHLs--bfpSfSFqoY13MqYR1xYoE6eKIVZKrgdcJJuYeiVcVPMCzdI-JGB3JG92KntpV4uNTkvbYpPIJaFubE',
    },
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

// ---------------------------------------------------------------------------
// NO UNIT TEST MAY REACH A REAL CHAIN — enforced here, not remembered per file.
//
// The three variables `Web3Service`'s constructor requires are deleted before
// any test module is evaluated, so a test that forgets to mock the chain fails
// loudly at construction instead of quietly spending a request — or, worse,
// getting a real answer.
//
// FOUND, NOT ANTICIPATED. `evidenceConfirmPromotionGate` asserted that the
// /confirm route does NOT answer 409 for a non-contradicted diff, and it passed
// because RPC_URL happened to be unset, the constructor threw, and the route
// answered 500. The moment a `@prisma/client` value import entered that route's
// module graph, Prisma loaded `.env` on import, the constructor succeeded, and
// the test made a live call to Base Sepolia — where the registry's honest
// "already registered" reply came back as exactly the 409 the test rules out.
//
// The test was repaired to mock the chain, which is the right fix for that
// file. This is the fix for the CLASS: a suite whose verdict depends on which
// ambient variables a transitive import happened to load is a suite that can
// change its answer without a line of code changing. The variables are deleted
// rather than set to placeholders, because a placeholder RPC endpoint is a
// network call that hangs instead of one that fails.
//
// This is deliberately NOT a way to avoid mocking. A test needing chain
// behaviour mocks `Web3Service`, which is what every test that already does the
// right thing already does.
delete process.env['RPC_URL'];
delete process.env['REGISTRAR_PRIVATE_KEY'];
delete process.env['EVIDENCE_REGISTRY_ADDRESS'];
