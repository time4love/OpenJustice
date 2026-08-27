import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Every operational script loads its environment FIRST.
//
// `scripts/dbSimulate.ts` had no dotenv import. Invoked as
// `DOTENV_CONFIG_PATH=.env.production.local npm run db:simulate -- '<statement>'`
// on 2026-08-27, it printed:
//
//     target      : staging
//     project ref : elwsznbcfmbmkldpntae
//     LOW RISK — Safe to proceed on the evidence of this simulation alone
//
// A TRUE STATEMENT ABOUT THE WRONG DATABASE, for a statement written for
// production. DOTENV_CONFIG_PATH is honoured by whoever imports dotenv and by
// nobody else; with no importer, Prisma Client quietly auto-loads `.env`.
//
// It was not one script. Four lacked it — dbSimulate, rediffFromSnapshots,
// bootstrapResearcher, canonicaliseTargetEntities — and three of those WRITE:
// forensics:rediff is an authorised production operation, bootstrapResearcher
// grants ADMIN, canonicaliseTargetEntities updates Evidence. Twelve others had
// it. One rule, sixteen implementations, twelve of them right — which is this
// repository's dominant defect shape and the reason the guard is a source scan
// rather than four fixes.
//
// POSITION IS ASSERTED, NOT MERELY PRESENCE. `src/lib/prisma.ts` constructs
// PrismaClient at module load and CommonJS executes imports in source order, so
// a dotenv import placed after anything reaching that module loads the
// environment too late to matter. Presence would pass; the connection would
// still be wrong.
// ---------------------------------------------------------------------------

const SCRIPTS = join(__dirname, '..', 'scripts');

const files = readdirSync(SCRIPTS).filter((f) => f.endsWith('.ts'));

/** The module specifiers a file imports, in source order. */
function importsInOrder(source: string): string[] {
  return [...source.matchAll(/^import\s[^;]*?['"]([^'"]+)['"];/gm)].map((m) => m[1] ?? '');
}

describe('every operational script loads its environment before anything else', () => {
  it('finds the scripts at all — a silent zero would make this vacuous', () => {
    // Sixteen at the time of writing. A collapse to zero means the directory
    // moved or the pattern broke, which would turn every case below into a pass
    // that proves nothing.
    expect(files.length).toBeGreaterThanOrEqual(16);
  });

  it.each(files)('%s imports dotenv/config first', (file) => {
    const specifiers = importsInOrder(readFileSync(join(SCRIPTS, file), 'utf8'));
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers[0]).toBe('dotenv/config');
  });
});
