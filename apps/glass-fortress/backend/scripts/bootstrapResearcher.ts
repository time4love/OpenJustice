/**
 * researcher:bootstrap — approve the first researcher in a fresh environment.
 *
 * The approval chain in Glass Fortress has no root: only an ADMIN can approve a
 * researcher, and a new environment has none. This is the one supported way out
 * of that, and it is deliberately a committed, reviewed script rather than a
 * hand-typed UPDATE — the same reasoning as db:simulate. Ad-hoc SQL against a
 * live database is untracked, unrepeatable, and is the class of access that
 * wiped staging on 2026-08-21.
 *
 * See src/services/bootstrapResearcher.ts for why this refuses to run in a
 * populated environment, and why auto-approving the first registrant in the
 * signup route was rejected.
 *
 * Usage:
 *   npm run researcher:bootstrap -- --handle "<the handle chosen at signup>"
 *
 * The handle is passed at runtime, never hardcoded: it identifies a person, and
 * this repository is public.
 *
 * Exit codes: 0 = approved, or already approved (safe to re-run).
 *             1 = refused, or the handle does not exist.
 */

import { PrismaClient } from '@prisma/client';
import { identifyEnvironment } from '../src/lib/dbEnvironment';
import { bootstrapResearcher } from '../src/services/bootstrapResearcher';

function parseHandle(argv: string[]): string | null {
  const index = argv.indexOf('--handle');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--') || value.trim() === '') return null;
  return value.trim();
}

function banner(text: string): void {
  console.log('\n' + '='.repeat(72));
  console.log(text);
  console.log('='.repeat(72));
}

async function main(): Promise<number> {
  const handle = parseHandle(process.argv.slice(2));
  if (handle === null) {
    console.error('Usage: npm run researcher:bootstrap -- --handle "<handle>"');
    return 1;
  }

  const env = identifyEnvironment();
  banner(`researcher:bootstrap  —  target: ${env.label}`);

  // Naming the target is the whole point of the banner, so an unrecognised one
  // is worth calling out rather than passing over: it means DATABASE_URL points
  // somewhere this codebase has no name for.
  if (env.isUnrecognised) {
    console.log('  ⚠️  This database ref is not a known Glass Fortress environment.');
  }
  if (env.isProduction) {
    console.log('  ⚠️  This is PRODUCTION.');
  }
  console.log(`  handle requested: ${handle}\n`);

  const prisma = new PrismaClient();
  try {
    const outcome = await bootstrapResearcher(prisma, handle);

    switch (outcome.kind) {
      case 'approved':
        console.log(`✅ Approved "${outcome.handle}" (${outcome.researcherId}).`);
        console.log('   Role left unchanged — approval alone grants full write access,');
        console.log('   including promote_evidence. ADMIN is a separate concern.\n');
        console.log('   Next: reconnect the MCP connector. The OAuth flow resolves an');
        console.log('   account only for an approved researcher, so it will fail if run');
        console.log('   before this point.');
        return 0;

      case 'already_approved':
        console.log(`✅ "${outcome.handle}" (${outcome.researcherId}) is already approved.`);
        console.log('   Nothing to do — this command is safe to re-run.');
        return 0;

      case 'refused_not_fresh':
        console.log('⛔ REFUSED — this environment already has an approved researcher:');
        outcome.approvedHandles.forEach((h) => console.log(`     • ${h}`));
        console.log('\n   This tool only ever bootstraps an empty environment. Approving');
        console.log('   further accounts is an ADMIN action through');
        console.log('   PATCH /api/auth/researchers/:id, where it is audited and reversible.');
        return 1;

      case 'no_such_handle':
        console.log(`⛔ No researcher with handle "${outcome.handle}".`);
        if (outcome.availableHandles.length === 0) {
          console.log('   This environment has no researchers at all — register through');
          console.log('   the frontend first (/login), then re-run this.');
        } else {
          console.log('   Registered handles:');
          outcome.availableHandles.forEach((h) => console.log(`     • ${h}`));
        }
        return 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error('researcher:bootstrap failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
