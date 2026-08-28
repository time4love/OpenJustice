#!/usr/bin/env node
/**
 * Does our MIGRATION HISTORY produce the modelled schema?
 *
 * A DIFFERENT QUESTION FROM db:check-drift, and the names must not be allowed to
 * suggest one covers both:
 *
 *   db:check-drift        does the LIVE DATABASE match the model?
 *   db:verify-migrations  does replaying every migration from empty PRODUCE the model?
 *
 * Staging having drifted and staging's HISTORY being wrong are separate failures,
 * and only the second one travels to production. A hand-written migration can be
 * green on the first check and wrong on the second: the live database is whatever
 * the SQL actually did, so drift compares the model against the mistake.
 *
 * WHY THIS EXISTS. Migrations here are hand-written, and the operations that
 * matter — a rename, a type conversion, a CHECK — are exactly the ones where a
 * typo yields a schema that WORKS but is not the one modelled. The failure mode is
 * quiet: a column ending up a different type in the database than in the model
 * surfaces only when Prisma Client returns a value its own types called
 * impossible.
 *
 * (An earlier version of this comment named a specific migration that has since
 * been withdrawn. The tool is not about one migration.)
 *
 * Runs against a THROWAWAY database, never a real one. Prisma resets the shadow
 * database repeatedly, which is why pointing this at staging or production would
 * be catastrophic rather than merely wrong — hence the refusal below.
 *
 *   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=shadow --name gf-shadow pgvector/pgvector:pg16
 *   SHADOW_DATABASE_URL=postgresql://postgres:shadow@localhost:5433/postgres npm run db:verify-migrations
 *
 * Empty output from the diff is the proof. Non-empty output IS the drift, printed
 * as the SQL that would close it.
 *
 * KNOWN BLOCKER, recorded 2026-08-28: THIS CANNOT PASS TODAY.
 * `20260824150000_claim_trajectory_pattern_hash` calls `digest()`, which comes
 * from pgcrypto, and the migration history declares only `vector`. Replaying from
 * empty therefore fails at that migration. It works in every real environment
 * because Supabase pre-installs pgcrypto — so no deploy can catch it, which is
 * exactly why a shadow replay is the only thing that would have.
 *
 * Not fixable by amending that migration: it is applied, and applied migrations
 * are never edited. A later `CREATE EXTENSION` would not help either, since the
 * replay fails before reaching it. Recorded as a finding rather than worked
 * around.
 */
const { execFileSync } = require('node:child_process');

const shadow = process.env.SHADOW_DATABASE_URL;

// Refuse loudly rather than skipping. A verification tool that silently does
// nothing when unconfigured reports success for a check it never ran — the
// vacuous pass this codebase has been bitten by repeatedly.
if (!shadow) {
  console.error(
    'SHADOW_DATABASE_URL is not set, so nothing was verified.\n\n' +
      'This replays every migration into a THROWAWAY database and diffs the result\n' +
      'against schema.prisma. It needs any local Postgres — not the target:\n\n' +
      '  docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=shadow --name gf-shadow pgvector/pgvector:pg16\n' +
      '  SHADOW_DATABASE_URL=postgresql://postgres:shadow@localhost:5433/postgres \\\n' +
      '    npm run db:verify-migrations\n',
  );
  process.exit(1);
}

// The shadow database is RESET repeatedly by Prisma. Pointing it at a real
// environment would destroy it, so the two known project refs are refused
// outright — identified by data in the connection string rather than by trusting
// the caller to have passed the right one.
for (const ref of ['fqmczumacfbunffgodlo', 'elwsznbcfmbmkldpntae']) {
  if (shadow.includes(ref)) {
    console.error(
      `REFUSING: SHADOW_DATABASE_URL points at a REAL environment (${ref.slice(0, 4)}…).\n` +
        'Prisma resets the shadow database repeatedly. Use a throwaway Postgres.',
    );
    process.exit(1);
  }
}
if (shadow.includes('pooler.supabase.com') || shadow.includes('supabase.co')) {
  console.error(
    'REFUSING: SHADOW_DATABASE_URL points at Supabase. The shadow database is reset\n' +
      'repeatedly — use a throwaway Postgres.',
  );
  process.exit(1);
}

let output = '';
try {
  output = execFileSync(
    'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      './prisma/migrations',
      '--to-schema-datamodel',
      './prisma/schema.prisma',
      '--shadow-database-url',
      shadow,
      '--script',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
} catch (err) {
  console.error('prisma migrate diff failed — the migration history did not apply.');
  process.exit(1);
}

// Prisma prints a comment line for an empty diff rather than nothing at all.
const statements = output
  .split('\n')
  .filter((line) => line.trim() !== '' && !line.trim().startsWith('--'))
  .join('\n');

if (statements === '') {
  console.log('The migration history reproduces schema.prisma exactly.');
  process.exit(0);
}

console.error(
  'THE MIGRATION HISTORY DOES NOT PRODUCE THE MODELLED SCHEMA.\n\n' +
    'What follows is the difference, as the SQL that would close it — so it is\n' +
    'also the correction the hand-written migration is missing.\n',
);
console.error(output);
process.exit(2);
