-- Distinguish a Wayback Machine outage from an unexpected pipeline failure.
--
-- Previously a WaybackScrapeJob whose every snapshot fetch failed (e.g. because
-- archive.org itself was down) still finished with status COMPLETED and zero
-- persisted snapshots/diffs — indistinguishable from "scanned thoroughly, found
-- nothing." failureReason is set only when the scraper marks a job FAILED, so
-- the frontend can show "Wayback Machine is unreachable, try again later"
-- instead of a silent empty result.

CREATE TYPE "WaybackFailureReason" AS ENUM ('WAYBACK_OFFLINE', 'ALL_FETCHES_FAILED');

ALTER TABLE "WaybackScrapeJob" ADD COLUMN "failureReason" "WaybackFailureReason";
