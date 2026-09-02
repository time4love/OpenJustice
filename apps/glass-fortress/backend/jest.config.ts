import type { Config } from 'jest';

// ---------------------------------------------------------------------------
// Two projects, one suite.
//
// `unit` is everything as it has always been: node_modules untransformed, which
// is fast and is why every test touching the scraper mocks jsdom and
// @mozilla/readability away — jsdom's dependency chain is ESM-only and ts-jest
// cannot parse it untransformed.
//
// That mock is fine for testing the scraper's control flow and useless for
// testing the EXTRACTOR. EXTRACTION_DIVERGENCE — the finding the verification
// tools exist to surface — is a claim about what Readability really drops from
// a real archived page, so a test running against a stubbed Readability would
// assert the stub and prove nothing. The `extraction` project transforms
// node_modules so those tests can run the genuine article against frozen real
// captures. It costs a few seconds and applies to nothing else.
//
// `walk` is the acceptance suite of the article-rules refactor
// (docs/gf-refactor-plan.md, step 0): written from the flows appendix before
// the code, and RED by design until each step builds the module it names. It is
// its own project so `npm test` — the required CI check — keeps running `unit`
// and `extraction` only, while `npm run test:walk` reports the walk's progress
// on every PR without gating it. At step 8, the switch, it joins the required
// run in the same commit that turns it green.
// ---------------------------------------------------------------------------

const shared = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/setupEnv.ts'],
  clearMocks: true,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
} as const;

const config: Config = {
  forceExit: true,
  projects: [
    {
      ...shared,
      displayName: 'unit',
      testMatch: ['<rootDir>/test/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/test/extraction/', '<rootDir>/test/walk/'],
    },
    {
      ...shared,
      displayName: 'walk',
      testMatch: ['<rootDir>/test/walk/**/*.test.ts'],
    },
    {
      ...shared,
      displayName: 'extraction',
      testMatch: ['<rootDir>/test/extraction/**/*.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
        // diagnostics off: these are third-party .js files being made loadable,
        // not project code being type-checked.
        '^.+\\.m?js$': ['ts-jest', { tsconfig: 'tsconfig.test.json', diagnostics: false }],
      },
      transformIgnorePatterns: [],
    },
  ],
};

export default config;
