import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  MedicalDimension,
  SocialEconomicDimension,
  MEDICAL_DIMENSIONS,
  SOCIAL_ECONOMIC_DIMENSIONS,
  isMedicalDimension,
  isSocialEconomicDimension,
  SUPPRESSION_THRESHOLD,
} from '../lib/reportDimensions';

// ---------------------------------------------------------------------------
// Phase 6 — the actual point of the Report model (§0 of the dev plan): turns
// individually-meaningless rows into an aggregate pattern a thesis can cite.
//
// Uses Postgres's native GROUP BY CUBE (standard since 9.5) rather than a
// hand-rolled groupBy per dimension combination — see
// docs/gf-adverse-event-report-schema-dev-plan.md Phase 6 for why. CUBE
// returns every rollup level in one query (totals by each dimension alone,
// and by their combination), which is what lets a frontend drill down
// without a new round-trip per view — not decoration, the actual reason to
// use it over a plain GROUP BY.
//
// Suppression (SUPPRESSION_THRESHOLD, NCHS/CDC WONDER's own standard) is
// applied here, server-side, before any row leaves this function — never
// left to the frontend to enforce.
// ---------------------------------------------------------------------------

export interface PatternCell {
  // Only dimensions NOT rolled up at this row are present — e.g. a row
  // representing "totals by symptomCategory alone" omits reporterAgeRange
  // entirely, rather than setting it to null (null is reserved for "the
  // underlying data value was genuinely null", which GROUPING() lets us
  // tell apart from "this dimension was aggregated away").
  dimensions: Partial<Record<string, string | null>>;
  // null = suppressed (real count was below SUPPRESSION_THRESHOLD).
  count: number | null;
}

interface RawCubeRow {
  // ::int in the SQL, not the bigint COUNT(*) would default to — report
  // volumes stay well within int range, and JS number avoids BigInt-vs-JSON
  // friction downstream.
  count: number;
  [key: string]: unknown;
}

function buildFilterClause(
  dimensionColumns: Record<string, { sqlColumn: string }>,
  filters: Record<string, string[]> | undefined,
): Prisma.Sql {
  if (!filters) return Prisma.empty;
  const clauses: Prisma.Sql[] = [];
  for (const [dimension, values] of Object.entries(filters)) {
    const column = dimensionColumns[dimension];
    if (!column || !values || values.length === 0) continue;
    clauses.push(Prisma.sql`${Prisma.raw(column.sqlColumn)} IN (${Prisma.join(values)})`);
  }
  if (clauses.length === 0) return Prisma.empty;
  return Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`;
}

async function runCubeQuery(
  dimensions: string[],
  dimensionColumns: Record<string, { sqlColumn: string }>,
  fromClause: Prisma.Sql,
  filters: Record<string, string[]> | undefined,
): Promise<PatternCell[]> {
  const columnSql = dimensions.map((d) => Prisma.raw(dimensionColumns[d].sqlColumn));
  const groupingSql = dimensions.map(
    (d, i) => Prisma.sql`GROUPING(${Prisma.raw(dimensionColumns[d].sqlColumn)}) AS g${Prisma.raw(String(i))}`,
  );
  const aliasedColumnSql = dimensions.map(
    (d, i) => Prisma.sql`${Prisma.raw(dimensionColumns[d].sqlColumn)} AS d${Prisma.raw(String(i))}`,
  );

  const whereSql = buildFilterClause(dimensionColumns, filters);

  const query = Prisma.sql`
    SELECT
      ${Prisma.join(aliasedColumnSql)},
      COUNT(*)::int AS count,
      ${Prisma.join(groupingSql)}
    FROM ${fromClause}
    ${whereSql}
    GROUP BY CUBE(${Prisma.join(columnSql)})
  `;

  const rows = await prisma.$queryRaw<RawCubeRow[]>(query);

  return rows.map((row) => {
    const cellDimensions: Partial<Record<string, string | null>> = {};
    dimensions.forEach((dimension, i) => {
      const isRolledUp = Number(row[`g${String(i)}`]) === 1;
      if (!isRolledUp) {
        cellDimensions[dimension] = (row[`d${String(i)}`] as string | null) ?? null;
      }
    });
    const rawCount = row.count;
    return {
      dimensions: cellDimensions,
      count: rawCount < SUPPRESSION_THRESHOLD ? null : rawCount,
    };
  });
}

export async function getMedicalPattern(
  dimensions: MedicalDimension[],
  filters?: Partial<Record<MedicalDimension, string[]>>,
): Promise<PatternCell[]> {
  return runCubeQuery(
    dimensions,
    MEDICAL_DIMENSIONS,
    Prisma.sql`"MedicalAdverseEventReport" m JOIN "Report" r ON r."medicalReportId" = m.id`,
    filters,
  );
}

export async function getSocialEconomicPattern(
  dimensions: SocialEconomicDimension[],
  filters?: Partial<Record<SocialEconomicDimension, string[]>>,
): Promise<PatternCell[]> {
  return runCubeQuery(
    dimensions,
    SOCIAL_ECONOMIC_DIMENSIONS,
    Prisma.sql`"SocialEconomicImpactReport" s JOIN "Report" r ON r."socialEconomicReportId" = s.id`,
    filters,
  );
}

export { isMedicalDimension, isSocialEconomicDimension };
