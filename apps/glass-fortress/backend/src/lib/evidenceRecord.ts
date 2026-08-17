// Shared shape for "evidence as a list-card" responses — GET /api/evidence/timeline,
// GET /api/evidence/search, and GET /api/figures/:id all render the same
// EvidenceHighlightCard-style component on the frontend, so their responses must
// stay identical. Route handlers previously hand-built this object independently
// in three places and drifted (figures/:id was missing evidenceId/status). One
// mapper now backs all three call sites.
export interface EvidenceRecord {
  evidenceId: string;
  fileHash: string;
  status: string;
  evidenceRole: string;
  investigativeCategories: string[];
  tier: string;
  evidencePerspective?: string | null;
  tierReasoning?: string | null;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  figures: { id: string; name: string }[];
  medicalConditions: string[];
  statisticalClaims: string[];
  regulatoryMentions: string[];
  euaOmissionStatus: string;
  sourceUrl?: string | null;
  fileUrl?: string | null;
  urlVersionDiffId?: string | null;
  trackedUrlId?: string | null;
  timestamp: number;
}

/** The subset of an Evidence row (with its `figures` relation loaded) needed to map to an EvidenceRecord. */
export interface EvidenceRecordRow {
  id: string;
  fileHash: string;
  status: string;
  evidenceRole: string;
  investigativeCategories: string[];
  evidenceTier: string;
  evidencePerspective: string | null;
  tierReasoning: string | null;
  summary: string;
  targetEntity: string;
  evidenceDate: string;
  figures: { id: string; name: string }[];
  medicalConditions: string;
  statisticalClaims: string;
  regulatoryMentions: string;
  euaOmissionStatus: string;
  sourceUrl: string | null;
  fileUrl: string | null;
  urlVersionDiffId: string | null;
  createdAt: Date;
}

/**
 * `trackedUrlId` isn't on the Evidence row itself — it comes from the
 * `urlVersionDiff` relation, which not every caller joins (GET /search doesn't).
 * Pass it explicitly when available; omit it to leave it null.
 */
export function mapEvidenceToRecord(row: EvidenceRecordRow, trackedUrlId: string | null = null): EvidenceRecord {
  return {
    evidenceId: row.id,
    fileHash: row.fileHash,
    status: row.status,
    evidenceRole: row.evidenceRole,
    investigativeCategories: row.investigativeCategories,
    tier: row.evidenceTier,
    evidencePerspective: row.evidencePerspective,
    tierReasoning: row.tierReasoning,
    summary: row.summary,
    targetEntity: row.targetEntity,
    evidenceDate: row.evidenceDate,
    figures: row.figures,
    medicalConditions: JSON.parse(row.medicalConditions || '[]') as string[],
    statisticalClaims: JSON.parse(row.statisticalClaims || '[]') as string[],
    regulatoryMentions: JSON.parse(row.regulatoryMentions || '[]') as string[],
    euaOmissionStatus: row.euaOmissionStatus,
    sourceUrl: row.sourceUrl,
    fileUrl: row.fileUrl,
    urlVersionDiffId: row.urlVersionDiffId,
    trackedUrlId,
    timestamp: row.createdAt.getTime(),
  };
}
