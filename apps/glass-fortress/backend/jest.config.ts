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
  // Hides the chain variables at the moments a `.env` loader can bring them
  // back — after the test file's imports, not only before them. See its header.
  setupFilesAfterEnv: ['<rootDir>/test/setupNoRealChain.ts'],
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
      testPathIgnorePatterns: [
        '<rootDir>/test/extraction/',
        '<rootDir>/test/walk/',
        // The evidence acceptance suite is RED BY DESIGN until steps 12-15 build
        // what it asserts (refactor plan §4 rule 4). Without this line `unit` —
        // the required CI check — runs those files and `npm test` goes red on a
        // suite that is doing its job.
        '<rootDir>/test/evidence/',
        // And the THESIS acceptance suite, for the same reason: red by design
        // until thesis steps 18-24 build what it names (thesis plan §3 step 17).
        '<rootDir>/test/thesis/',
      ],
    },
    {
      ...shared,
      displayName: 'walk',
      testMatch: ['<rootDir>/test/walk/**/*.test.ts'],
    },
    {
      ...shared,
      // `evidence` is the acceptance suite of evidence steps 11-16, written from
      // docs/gf-evidence-flows.md's appendix BEFORE the code and red until each
      // step builds the module it names — the same shape, and the same reason,
      // as `walk` above. Its own project so `npm run test:evidence` reports its
      // progress on every PR without gating the required run.
      displayName: 'evidence',
      testMatch: ['<rootDir>/test/evidence/**/*.test.ts'],
    },
    {
      ...shared,
      // `thesis` is the acceptance suite of thesis steps 17-26, written from
      // docs/gf-thesis-flows.md's appendix BEFORE the code (thesis plan §3 step
      // 17) and red until each step builds the module it names. Every absent
      // module is reached through test/thesis/absent.ts, never a literal
      // `import()`: a literal specifier to a missing module is a file-level
      // TS2307 that sinks the whole file uncounted, where the loader fails each
      // case BY NAME with the step that owes it. Its own project so `npm run
      // test:thesis` reports progress without gating; it joins the required run
      // at step 25's remainder, in the commit that turns it green.
      displayName: 'thesis',
      testMatch: ['<rootDir>/test/thesis/**/*.test.ts'],
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
