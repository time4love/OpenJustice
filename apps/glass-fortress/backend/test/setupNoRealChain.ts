import { hideChainVariables } from './chainIsolation';

// Jest `setupFilesAfterEnv`, because the root hooks need the test framework.
// One list, three moments (the rule and why it needs them: ./chainIsolation):
//   - now, before the test file is evaluated — for anything read at import;
//   - root `beforeAll` — after every import-time `.env` load, and before the
//     file's own `beforeAll` hooks;
//   - root `beforeEach` — before every case, whatever an earlier hook or case
//     loaded.
hideChainVariables();
beforeAll(hideChainVariables);
beforeEach(hideChainVariables);
