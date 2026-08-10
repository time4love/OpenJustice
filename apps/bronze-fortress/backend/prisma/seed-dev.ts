// DEV FIXTURE SEED — not for production.
// Creates a realistic test scenario:
//   - 1 active judge (כב' השופט דניאל שרון, Tel Aviv)
//   - 1 active social worker (עו"ס מירב כהן, Rishon LeZion)
//   - 4 mock cases with commitments spanning multiple pattern domains
//
// Run: npx ts-node --project tsconfig.json prisma/seed-dev.ts
// Idempotent — safe to run multiple times.

import { PrismaClient, KeyFigureType, KeyFigureStatus, PatternCategory, CooperationLevel } from '../src/generated/prisma';
import crypto from 'crypto';

const prisma = new PrismaClient();

function commitmentHash(figureId: string, pattern: PatternCategory, courtId: string): string {
  return crypto.createHash('sha256').update(`${figureId}|${pattern}|${courtId}`).digest('hex');
}

const JUDGE_ID        = 'dev-judge-sharon';
const WORKER_ID       = 'dev-worker-cohen';
const COURT_TEL_AVIV  = 'court-rishon-lezion';  // closest to TLV in seed
const COURT_JERUSALEM = 'court-jerusalem';

// ── Figures ──────────────────────────────────────────────────────────────────

const FIGURES = [
  {
    id: JUDGE_ID,
    name: 'כב\' השופט דניאל שרון',
    type: KeyFigureType.JUDGE,
    organization: null,
    courtId: COURT_TEL_AVIV,
    status: KeyFigureStatus.ACTIVE,
    activatedAt: new Date('2025-09-01'),
    registryVerified: false,
    registrySource: null,
  },
  {
    id: WORKER_ID,
    name: 'עו"ס מירב כהן',
    type: KeyFigureType.SOCIAL_WORKER,
    organization: 'לשכת הרווחה ראשון לציון',
    courtId: null,
    status: KeyFigureStatus.ACTIVE,
    activatedAt: new Date('2025-10-15'),
    registryVerified: false,
    registrySource: null,
  },
];

// ── Cases (mock petitioners — fake supabaseUserIds for dev only) ──────────────

const CASES = [
  { id: 'dev-case-001', supabaseUserId: 'dev-user-001', cooperationLevel: CooperationLevel.ANONYMOUS_TIMELINE },
  { id: 'dev-case-002', supabaseUserId: 'dev-user-002', cooperationLevel: CooperationLevel.NONE },
  { id: 'dev-case-003', supabaseUserId: 'dev-user-003', cooperationLevel: CooperationLevel.NONE },
  { id: 'dev-case-004', supabaseUserId: 'dev-user-004', cooperationLevel: CooperationLevel.ANONYMOUS_MESSAGING },
];

// ── Commitments ───────────────────────────────────────────────────────────────
// Each entry: caseId, figureId, courtId, patternCategory, eventStartDate, eventEndDate

const COMMITMENTS = [
  // Case 001 — judge: ex parte + systemic delays + evaluator rubber stamp
  { caseId: 'dev-case-001', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.EX_PARTE_HEARING,             eventStartDate: new Date('2022-03-15'), eventEndDate: new Date('2022-03-15') },
  { caseId: 'dev-case-001', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS,       eventStartDate: new Date('2022-04-01'), eventEndDate: new Date('2023-06-01') },
  { caseId: 'dev-case-001', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.JUDGE_RUBBER_STAMPS_EVALUATOR,  eventStartDate: new Date('2022-09-20'), eventEndDate: null },
  { caseId: 'dev-case-001', figureId: WORKER_ID, courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING, eventStartDate: new Date('2022-03-15'), eventEndDate: null },
  { caseId: 'dev-case-001', figureId: WORKER_ID, courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.WELFARE_REPORT_ONE_SIDED_INTERVIEW, eventStartDate: new Date('2022-05-10'), eventEndDate: null },

  // Case 002 — judge: ex parte + nzakut no hearing + alienation ignored
  { caseId: 'dev-case-002', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.EX_PARTE_HEARING,              eventStartDate: new Date('2021-11-08'), eventEndDate: null },
  { caseId: 'dev-case-002', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.NZAKUT_NO_EVIDENTIARY_HEARING,  eventStartDate: new Date('2021-11-08'), eventEndDate: new Date('2023-02-01') },
  { caseId: 'dev-case-002', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.ALIENATION_RAISED_IGNORED,      eventStartDate: new Date('2022-07-14'), eventEndDate: null },
  { caseId: 'dev-case-002', figureId: WORKER_ID, courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.WELFARE_REPORT_CITES_DROPPED_ALLEGATIONS, eventStartDate: new Date('2021-12-01'), eventEndDate: null },

  // Case 003 — judge: systemic delays + multiple handoffs + recusal denied
  { caseId: 'dev-case-003', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.SYSTEMIC_HEARING_DELAYS,        eventStartDate: new Date('2020-06-01'), eventEndDate: new Date('2022-01-01') },
  { caseId: 'dev-case-003', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.MULTIPLE_JUDGE_HANDOFFS,         eventStartDate: new Date('2020-06-01'), eventEndDate: new Date('2021-03-01') },
  { caseId: 'dev-case-003', figureId: JUDGE_ID,  courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.RECUSAL_DENIED_CONFLICT,         eventStartDate: new Date('2021-05-20'), eventEndDate: null },
  { caseId: 'dev-case-003', figureId: WORKER_ID, courtId: COURT_TEL_AVIV,  patternCategory: PatternCategory.WELFARE_REFERRAL_AT_FIRST_HEARING, eventStartDate: new Date('2020-06-15'), eventEndDate: null },

  // Case 004 — Jerusalem court — judge ex parte + child removed + alienation window
  { caseId: 'dev-case-004', figureId: JUDGE_ID,  courtId: COURT_JERUSALEM, patternCategory: PatternCategory.EX_PARTE_HEARING,              eventStartDate: new Date('2023-02-01'), eventEndDate: null },
  { caseId: 'dev-case-004', figureId: JUDGE_ID,  courtId: COURT_JERUSALEM, patternCategory: PatternCategory.CHILD_REMOVED_OVER_YEAR_NO_HEARING, eventStartDate: new Date('2023-02-01'), eventEndDate: new Date('2024-05-01') },
  { caseId: 'dev-case-004', figureId: JUDGE_ID,  courtId: COURT_JERUSALEM, patternCategory: PatternCategory.SEPARATION_WINDOW_USED_FOR_ALIENATION, eventStartDate: new Date('2023-02-01'), eventEndDate: new Date('2024-05-01') },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding dev fixtures...\n');

  // Upsert figures
  for (const figure of FIGURES) {
    await prisma.keyFigure.upsert({
      where: { id: figure.id },
      update: { status: figure.status, activatedAt: figure.activatedAt },
      create: figure,
    });
    console.log(`  ✓ Figure: ${figure.name} (${figure.type})`);
  }

  // Upsert cases + members
  for (const c of CASES) {
    await prisma.case.upsert({
      where: { id: c.id },
      update: { cooperationLevel: c.cooperationLevel },
      create: {
        id: c.id,
        publicKeyHex: `dev-pubkey-${c.id}`,
        cooperationLevel: c.cooperationLevel,
      },
    });
    await prisma.caseMember.upsert({
      where: { supabaseUserId: c.supabaseUserId },
      update: {},
      create: {
        caseId: c.id,
        supabaseUserId: c.supabaseUserId,
        role: 'PRIMARY_CONTACT',
      },
    });
    console.log(`  ✓ Case: ${c.id}`);
  }

  // Upsert commitments
  let created = 0;
  for (const c of COMMITMENTS) {
    const hash = commitmentHash(c.figureId, c.patternCategory, c.courtId);
    await prisma.commitment.upsert({
      where: { commitmentHash: hash },
      update: {},
      create: {
        caseId: c.caseId,
        figureId: c.figureId,
        courtId: c.courtId,
        patternCategory: c.patternCategory,
        commitmentHash: hash,
        eventStartDate: c.eventStartDate,
        eventEndDate: c.eventEndDate ?? null,
      },
    });
    created++;
  }
  console.log(`  ✓ ${created} commitments`);

  console.log('\nDev fixtures ready.');
  console.log(`\nTry it:\n  build_pattern_thesis { figureId: "${JUDGE_ID}" }`);
  console.log(`  build_pattern_thesis { figureId: "${WORKER_ID}" }`);
  console.log(`  list_active_figures {}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
