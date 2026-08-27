-- CreateEnum
CREATE TYPE "CdxEntryStatus" AS ENUM ('STORED', 'UNSERVABLE', 'UNFETCHED', 'UNCHANGED');

-- CreateTable
CREATE TABLE "CdxIndexEntry" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "waybackTimestamp" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "status" "CdxEntryStatus" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "snapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CdxIndexEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CdxQuery" (
    "id" TEXT NOT NULL,
    "trackedUrlId" TEXT NOT NULL,
    "queriedAt" TIMESTAMP(3) NOT NULL,
    "fromDate" TEXT,
    "rowCount" INTEGER NOT NULL,
    "hasMore" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CdxQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CdxIndexEntry_snapshotId_key" ON "CdxIndexEntry"("snapshotId");

-- CreateIndex
CREATE INDEX "CdxIndexEntry_trackedUrlId_status_idx" ON "CdxIndexEntry"("trackedUrlId", "status");

-- CreateIndex
CREATE INDEX "CdxIndexEntry_trackedUrlId_waybackTimestamp_idx" ON "CdxIndexEntry"("trackedUrlId", "waybackTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "CdxIndexEntry_trackedUrlId_waybackTimestamp_digest_key" ON "CdxIndexEntry"("trackedUrlId", "waybackTimestamp", "digest");

-- CreateIndex
CREATE INDEX "CdxQuery_trackedUrlId_queriedAt_idx" ON "CdxQuery"("trackedUrlId", "queriedAt");

-- AddForeignKey
ALTER TABLE "CdxIndexEntry" ADD CONSTRAINT "CdxIndexEntry_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CdxIndexEntry" ADD CONSTRAINT "CdxIndexEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "UrlSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CdxQuery" ADD CONSTRAINT "CdxQuery_trackedUrlId_fkey" FOREIGN KEY ("trackedUrlId") REFERENCES "TrackedUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

