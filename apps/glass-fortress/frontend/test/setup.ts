import '@testing-library/jest-dom';

// next-intl/server resolves, under jest, to its client build, whose every function throws — there is no request
// to read a locale from. Server components render through ONE stand-in, test/render.tsx's `nextIntlServer`, over
// the real messages, so a component is exercised as written and only its request boundary is replaced.
jest.mock('next-intl/server', () => jest.requireActual<typeof import('./render')>('./render').nextIntlServer);

// No `.env` is read here or anywhere in the suite. The config's own load path — next/jest calls
// @next/env's loadEnvConfig on this workspace — is held by the harness's env case.
