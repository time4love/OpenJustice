import nextJest from 'next/jest.js';

// ---------------------------------------------------------------------------
// THE FRONTEND'S JEST PROJECT (docs/gf-ui-refactor-plan.md UI-1).
//
// THROUGH next/jest, which ships with Next and resolves from the repository
// root by hoisting — no transformer is installed. `dir: './'` is the workspace
// jest runs in (every invocation starts there); it gives the `@/*` paths, the
// app-directory flag and next.config's settings. It also loads `.env` files
// from that directory into the environment; test/harness.test.tsx holds that
// it finds none.
//
// `next/jest.js`, with the extension: `next` has no `exports` map, so the bare
// subpath does not resolve as an ES module, which is how Node 22 (CI) may load
// this file; Node 20 loads it through ts-node.
//
// THE ESM LIST. next-intl and the packages beneath it ship ES modules only, and
// next/jest transforms nothing under node_modules but its own list. A custom
// `transformIgnorePatterns` entry cannot help — jest ignores a file when ANY
// pattern matches, so an appended pattern only ignores more — so the one pattern
// next/jest writes is rewritten to carry these names too. next.config.ts is not
// touched. If next/jest ever writes that pattern differently, this refuses
// loudly rather than silently transforming nothing.
// ---------------------------------------------------------------------------

const createJestConfig = nextJest({ dir: './' });

const config = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
} satisfies Parameters<typeof createJestConfig>[0];

const ESM_PACKAGES = ['next-intl', 'use-intl', 'intl-messageformat', '@formatjs', '@schummar/icu-type-parser', 'icu-minify', 'po-parser'];

export default async function jestConfig() {
  const resolved = await createJestConfig(config)();
  const [nodeModules, ...rest] = resolved.transformIgnorePatterns ?? [];
  const opening = '(?!(';
  if (nodeModules === undefined || nodeModules.split(opening).length !== 2) {
    throw new Error(`jest.config.ts: next/jest's first transformIgnorePatterns entry changed shape — got ${JSON.stringify(nodeModules)}`);
  }
  return { ...resolved, transformIgnorePatterns: [nodeModules.replace(opening, `${opening}${ESM_PACKAGES.join('|')}|`), ...rest] };
}
