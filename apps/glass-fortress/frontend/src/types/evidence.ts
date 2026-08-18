// Shared evidence types — used by the vault, figures, and timeline pages.
// EvidenceTier lives in @/components/TierBadge (it's paired with the
// tier-to-style lookup there), not here.

export type EvidenceRole = 'Incriminating' | 'ContextAnchor';

export type EvidencePerspective = 'Internal Knowledge' | 'Public Statement' | 'Citizen Experience';

export interface EvidenceMetadata {
  evidenceId?: string;
  fileHash: string;
  status?: string;
  evidenceRole?: EvidenceRole;
  investigativeCategories: string[];
  tier: string;
  tierReasoning?: string;
  evidencePerspective?: EvidencePerspective;
  summary: string;
  targetEntity: string;
  evidenceDate?: string;
  figures?: { id: string; name: string }[];
  medicalConditions?: string[];
  statisticalClaims?: string[];
  regulatoryMentions?: string[];
  euaOmissionStatus?: string;
  sourceUrl?: string | null;
  fileUrl?: string | null;
  urlVersionDiffId?: string | null;
  trackedUrlId?: string | null;
  timestamp: number;
  submitterAddress?: string;
}
