// ---------------------------------------------------------------------------
// THE GATE'S SUPABASE DOUBLE — UI-3. What the route files mock `src/middleware/supabaseAuth` with, in a module that
// IMPORTS NOTHING: a `jest.mock` factory runs while the module graph is still loading, and a factory reaching a helper
// that itself imports `researcherIdentity` (which imports the mocked module) reads that helper half-built — the double
// arrived `undefined` and every gated route answered "Auth check failed" (the R53 chunk-4 run).
// ---------------------------------------------------------------------------

/** The bearer tokens a case sends, and the Supabase users they verify to — any other token does not verify. */
export const TOKEN = { good: 'good', stranger: 'stranger', pending: 'pending', unverified: 'unverified' } as const;
const SUPABASE_USER: Readonly<Record<string, string>> = { good: 'sb-author', stranger: 'sb-stranger', pending: 'sb-pending' };

export const supabaseAuthDouble = {
  verifySupabaseUserId: (token: string): Promise<string | null> => Promise.resolve(SUPABASE_USER[token] ?? null),
};
