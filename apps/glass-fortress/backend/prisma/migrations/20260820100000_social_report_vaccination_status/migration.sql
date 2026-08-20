-- Adds VaccinationStatus + ReportCalendarPeriod to SocialEconomicImpactReport,
-- and drops timingRelativeToEvent.
--
-- WHY: this domain's rows were uninterpretable without a vaccination status.
-- The documented mass events here are consequences of REFUSAL (EEOC
-- religious-accommodation denials, DoD discharges — dev plan §2.5), while the
-- reverse also genuinely occurs (estrangement over having BEEN vaccinated).
-- Nothing recorded which, so both produced byte-identical rows and any count
-- mixing them was not weak evidence but meaningless — defeating a model whose
-- whole purpose is aggregate signal rather than individual proof (§0).
--
-- timingRelativeToEvent is DROPPED rather than renamed. It measured an interval
-- "after vaccination", an anchor that does not exist for a reporter who never
-- was vaccinated, so its values could not be reinterpreted onto any new meaning
-- — carrying them forward would preserve the bug in the data. occurredDuring
-- replaces it with a calendar period, which has no anchor to be wrong about and
-- is the better axis anyway: mandates arrived in dated waves, so when a
-- consequence landed is what ties it to a specific policy.
--
-- DESTRUCTIVE, and safe only because of a fact that was checked, not assumed:
-- SocialEconomicImpactReport is EMPTY. The single social report ever submitted
-- (a staging test) was deleted first, precisely because its timing value was
-- uninterpretable. Verified by direct count immediately before generating this.
-- Re-verify before applying anywhere else; on a non-empty table this migration
-- destroys data.
--
-- Both new columns are NOT NULL with defaults, so the write is safe regardless;
-- vaccinationStatus is separately REQUIRED at the zod intake boundary, since a
-- silent default on the one field that makes a row interpretable would recreate
-- the original defect behind a valid-looking value.
--
-- Generated offline via `prisma migrate diff --from-schema-datamodel <git HEAD
-- schema> --to-schema-datamodel <schema> --script` — no database connection —
-- then read before being kept, per §2.9.

-- CreateEnum
CREATE TYPE "VaccinationStatus" AS ENUM ('RECEIVED', 'NOT_RECEIVED', 'PARTIALLY_RECEIVED', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "ReportCalendarPeriod" AS ENUM ('YEAR_2020_OR_EARLIER', 'YEAR_2021_H1', 'YEAR_2021_H2', 'YEAR_2022', 'YEAR_2023_OR_LATER', 'UNKNOWN');

-- AlterTable
ALTER TABLE "SocialEconomicImpactReport" DROP COLUMN "timingRelativeToEvent",
ADD COLUMN     "occurredDuring" "ReportCalendarPeriod" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "vaccinationStatus" "VaccinationStatus" NOT NULL DEFAULT 'UNDISCLOSED';
