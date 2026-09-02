-- Level 4, build order: a line drawn under a URL's calibration.
--
-- SUPERSEDES, NEVER DELETES. Every decision stays in the log with its authority
-- ended; `governingEras` folds only what was recorded after the newest reset.
--
-- AN EVENT ON THE URL, NOT A DECISION IN A RUN. A run is a working session and its
-- decisions inherit its lifecycle; a reset has no work attached and no lifecycle.
--
-- Purely additive: one new table, verified against `prisma migrate diff` to be
-- exactly this and nothing else. `db:check-drift` was clean before it was written.
CREATE TABLE "CalibrationReset" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationReset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalibrationReset_trackedUrlId_createdAt_idx" ON "CalibrationReset"("trackedUrlId", "createdAt");

ALTER TABLE "CalibrationReset" ADD CONSTRAINT "CalibrationReset_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalibrationReset" ADD CONSTRAINT "CalibrationReset_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
