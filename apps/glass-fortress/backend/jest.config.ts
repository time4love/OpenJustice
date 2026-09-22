import type { Config } from 'jest';

// ---------------------------------------------------------------------------
// Six projects; `npm test` selects FIVE of them.
//
// `document` is the sixth and is deliberately NOT in that list: document
// refactor plan step 27 (:121) writes it RED and keeps it "informational in CI
// until step 36", which is the step that puts it into the required run. Until
// then it is reached by `npm run test:document` alone, and a red file in it is
// the acceptance suite doing its job rather than a broken build.
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
// the code, and RED by design until each step built the module it names. It is
// its own project so `npm run test:walk` runs it alone. This comment said it
// would join the required run at step 8, the switch; it did not — it ran in a
// non-gating CI job, green, until thesis refactor plan step 25's remainder
// (2026-09-15) put `walk`, `evidence` and `thesis` into `npm test`, which the
// required check runs.
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
      testPathIgnorePatterns: [
        '<rootDir>/test/extraction/',
        '<rootDir>/test/walk/',
        // The acceptance suites are their OWN projects below — ignored here only so no
        // file runs twice. `npm test` selects evidence and thesis; it does NOT select
        // `document`, which is informational until step 36, and WITHOUT this entry the
        // `unit` project's `test/**/*.test.ts` would sweep test/document/ back into the
        // required run and defeat that.
        '<rootDir>/test/evidence/',
        '<rootDir>/test/thesis/',
        '<rootDir>/test/document/',
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
      // step built the module it names — the same shape as `walk` above. Its own
      // project so `npm run test:evidence` runs it alone; green on every file, it
      // is in `npm test` and the required run since 2026-09-15.
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
      // test:thesis` runs it alone; green on every file since thesis step 24, it
      // joined `npm test` and the required run at step 25's remainder (2026-09-15).
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
    {
      ...shared,
      // `document` is the acceptance suite of document steps 27-37, written from
      // docs/gf-document-flows.md's appendix BEFORE the code (document plan step
      // 27) and red until each step builds the module it names — the same shape
      // as `walk`, `evidence` and `thesis`. Every absent module is reached
      // through test/document/built.ts, never a literal `import()`, for the
      // reason test/thesis/absent.ts states: a literal specifier to a missing
      // module is a file-level TS2307 that sinks the whole file uncounted, where
      // the loader fails each case BY NAME with the step that owes it.
      //
      // NOT in `npm test`'s --selectProjects list until step 36 (plan :121).
      displayName: 'document',
      testMatch: ['<rootDir>/test/document/**/*.test.ts'],
    },
  ],
};

export default config;
