import { Prisma } from '@prisma/client';

/**
 * A P2002 on THE unique index over `columns`, AND NOTHING ELSE.
 *
 * ONE SPELLING (thesis step 22, the researcher's ruling R18). A compare-and-set on an append-only log meets the
 * unique index when two callers read the same state and write the same next row; the loser must be told apart from
 * every other unique violation. P2002 is *a* unique violation, not *this* one — so the error is identified by
 * `meta.target`, never by the code alone, and a P2002 from any other constraint propagates.
 *
 * BOTH FORMS OF THE TARGET, because the driver reports either: the constraint's NAME
 * (`ThesisGapDecision_thesisId_gapId_sequence_key`) or the list of FIELDS it covers. Taken together the target must
 * name EVERY column asked for, so a target naming only some of them — or the primary key — is not this index.
 *
 * PURE: it imports the Prisma error class for `instanceof` and nothing of the application. Its callers hold the
 * client; `services/framingRounds.ts`, `services/reviewEvidence.ts` and `services/openDebate.ts` carried private copies until thesis step 22 and
 * call it now.
 */
export function isUniqueViolation(err: unknown, columns: readonly string[]): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const text =
    typeof target === 'string'
      ? target
      : Array.isArray(target)
        ? target.filter((t): t is string => typeof t === 'string').join(',')
        : '';
  return columns.length > 0 && columns.every((column) => text.includes(column));
}
