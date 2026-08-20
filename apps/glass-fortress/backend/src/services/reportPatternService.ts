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
// Disclosure control (SUPPRESSION_THRESHOLD, NCHS/CDC WONDER's own standard)
// is applied here, server-side, before any row leaves this function — never
// left to the frontend to enforce. Withholding the count is only the first of
// three things that has to happen; see applyDisclosureControl below for the
// two that a naive threshold misses, both of which republish the very numbers
// the threshold was meant to protect.
// ---------------------------------------------------------------------------

export interface PatternCell {
  // Only dimensions NOT rolled up at this row are present — e.g. a row
  // representing "totals by symptomCategory alone" omits reporterAgeRange
  // entirely, rather than setting it to null (null is reserved for "the
  // underlying data value was genuinely null", which GROUPING() lets us
  // tell apart from "this dimension was aggregated away").
  dimensions: Partial<Record<string, string | null>>;
  // Always a real, publishable count. Suppressed cells are removed entirely
  // rather than blanked (see applyDisclosureControl), so "present but
  // withheld" is not a state this type can express — a returned cell is
  // always safe to display as-is.
  count: number;
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

  const decoded = rows.map((row) => {
    const cellDimensions: Partial<Record<string, string | null>> = {};
    dimensions.forEach((dimension, i) => {
      const isRolledUp = Number(row[`g${String(i)}`]) === 1;
      if (!isRolledUp) {
        cellDimensions[dimension] = (row[`d${String(i)}`] as string | null) ?? null;
      }
    });
    return { dimensions: cellDimensions, count: row.count };
  });

  return applyDisclosureControl(decoded);
}

/** A decoded CUBE row before any disclosure control has been applied. */
interface RawCell {
  dimensions: Partial<Record<string, string | null>>;
  count: number;
}

/**
 * True when `ancestor` is a strictly coarser rollup covering `cell` — it names
 * a subset of the dimensions and agrees on every value it does name. Its count
 * therefore includes `cell`'s, which is exactly what makes it subtractable.
 */
function isAncestorOf(ancestor: RawCell, cell: RawCell): boolean {
  const ancestorKeys = Object.keys(ancestor.dimensions);
  const cellKeys = Object.keys(cell.dimensions);
  if (ancestorKeys.length >= cellKeys.length) return false;
  return ancestorKeys.every((k) => k in cell.dimensions && ancestor.dimensions[k] === cell.dimensions[k]);
}

// ---------------------------------------------------------------------------
// applyDisclosureControl
//
// Nulling a count below the threshold is necessary and NOT sufficient. Two
// further leaks survive it, and both hand back the number that was withheld:
//
// 1. EXISTENCE. A cell returned with count: null still says a report with that
//    exact combination of values exists. With reporterAgeRange and
//    reporterGender available as dimensions, "a man aged 18-29 reported a
//    cancer diagnosis" is disclosed with no count at all — the
//    quasi-identifier re-identification the dev plan §2.8 cites Sweeney for.
//    Suppressed cells are therefore DROPPED, not blanked.
//
// 2. RECOVERY BY SUBTRACTION. CUBE returns every rollup level, so a coarser
//    cell's count is the sum of the finer cells beneath it:
//        total 100, CARDIOVASCULAR 40, NEUROLOGICAL 30, AUTOIMMUNE 25,
//        ONCOLOGIC suppressed  =>  100 - 95 = 5, published exactly.
//    Official practice pairs primary suppression with COMPLEMENTARY
//    suppression; Phase 6 implemented only the first.
//
// The complementary step here removes the ANCESTORS of each suppressed cell
// rather than sacrificing a sibling. Both close the equation, but suppressing
// a sibling is strictly worse on both counts: it destroys a legitimate, often
// large count, and it still leaves the surviving total bounding the hidden
// values as a narrow range (drop ONCOLOGIC=5 and AUTOIMMUNE=25 above, keep
// total=100, and the pair is known to sum to 30). Removing the total instead
// publishes MORE real numbers and leaves the hidden one bounded only by the
// threshold itself.
//
// Ancestors are removed transitively: a cell suppressed at the finest level
// takes out its parent, which takes out the grand total, so no chain of
// subtractions reaches it.
// ---------------------------------------------------------------------------
function applyDisclosureControl(cells: RawCell[]): PatternCell[] {
  const suppressed = cells.filter((c) => c.count < SUPPRESSION_THRESHOLD);
  if (suppressed.length === 0) {
    return cells.map((c) => ({ dimensions: c.dimensions, count: c.count }));
  }

  const survivors = cells.filter(
    (cell) =>
      cell.count >= SUPPRESSION_THRESHOLD &&
      !suppressed.some((hidden) => isAncestorOf(cell, hidden)),
  );

  return survivors.map((c) => ({ dimensions: c.dimensions, count: c.count }));
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
