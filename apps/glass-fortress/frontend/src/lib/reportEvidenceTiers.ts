import type {
  MedicalSymptomCategory,
  SocialEconomicImpactCategory,
} from './reportEnums';

// ---------------------------------------------------------------------------
// Evidentiary tier per reported category.
//
// A `defamation-risk.md` Rule 2 requirement, not styling. The dev plan (§2.3,
// §2.5, and Phase 9's own entry) states it directly: categories backed by
// official tracked data cannot render with the same visual weight as ones that
// are real but never systematically quantified. Publishing "N reports of
// family estrangement" beside "N reports of military discharge" in identical
// bars asserts an equivalence the evidence does not support.
//
// Three tiers, taken from the plan rather than invented here:
//
//   DOCUMENTED    Officially tracked by a body that publishes counts. ~9,800 of
//                 ~10,000 COVID-era EEOC charges alleged religious-accommodation
//                 denial; 8,000+ servicemembers were discharged and the DoD runs
//                 a reinstatement programme. Government acknowledgment, not a
//                 contested claim.
//   PEER_REVIEWED Published research finds a real signal, and says explicitly it
//                 is hypothesis-generating rather than causal — the Oncotarget
//                 review's own words, and the PVS literature's. Also covers the
//                 organ-system categories, which follow VAERS/MedDRA structure:
//                 the taxonomy is established, the causal claim is not.
//   QUALITATIVE   Real and described in qualitative research, with no systematic
//                 quantification found. The plan flags this tier by name and
//                 warns that the display layer must not flatten it away.
//
// Unlisted values default to the LOWEST tier by construction below — an
// unclassified category must never be promoted into "documented" by accident.
// The Record types make that a compile error rather than a silent gap, the same
// guard the label files use.
// ---------------------------------------------------------------------------

export type EvidenceTier = 'DOCUMENTED' | 'PEER_REVIEWED' | 'QUALITATIVE';

/** Strongest first. Drives ordering of the legend, not of the data. */
export const EVIDENCE_TIERS: readonly EvidenceTier[] = ['DOCUMENTED', 'PEER_REVIEWED', 'QUALITATIVE'];

/**
 * One hue, three monotone lightness steps — the ordinal form, because tier is
 * a position in a sequence rather than an identity. Validated with the dataviz
 * skill's `validateOrdinal` against a white card surface: monotone lightness,
 * adjacent ΔL >= 0.06, single hue (24° spread), and a light end at 2.15:1,
 * clearing the 2:1 floor. An earlier amber-800/600/400 ramp was rejected by
 * that check at 1.67:1 — these values are measured, not chosen by eye.
 *
 * Colour alone never carries the tier: every bar is also labelled, the legend
 * names each tier in words, and the weakest tier is additionally hatched.
 */
export const TIER_FILL: Record<EvidenceTier, string> = {
  DOCUMENTED: '#78350f',
  PEER_REVIEWED: '#b45309',
  QUALITATIVE: '#f59e0b',
};

/** The weakest tier gets a second, non-colour channel — see above. */
export const TIER_HATCHED: Record<EvidenceTier, boolean> = {
  DOCUMENTED: false,
  PEER_REVIEWED: false,
  QUALITATIVE: true,
};

const MEDICAL_TIERS: Record<MedicalSymptomCategory, EvidenceTier> = {
  // The two the plan names explicitly as peer-reviewed-but-hypothesis-generating.
  ONCOLOGIC: 'PEER_REVIEWED',
  NEUROCOGNITIVE_PVS: 'PEER_REVIEWED',
  // Organ-system categories: VAERS/MedDRA-structured and genuinely reported, so
  // the taxonomy is established — but a report is a temporal association, never
  // a causal finding. Same tier, for the same reason.
  CARDIOVASCULAR: 'PEER_REVIEWED',
  NEUROLOGICAL: 'PEER_REVIEWED',
  AUTOIMMUNE_IMMUNE: 'PEER_REVIEWED',
  HEMATOLOGIC: 'PEER_REVIEWED',
  REPRODUCTIVE_MENSTRUAL: 'PEER_REVIEWED',
  MUSCULOSKELETAL: 'PEER_REVIEWED',
  DERMATOLOGIC: 'PEER_REVIEWED',
  GENERAL_SYSTEMIC: 'PEER_REVIEWED',
  // No specific grounding to point at, so the weakest tier.
  OTHER: 'QUALITATIVE',
};

const SOCIAL_TIERS: Record<SocialEconomicImpactCategory, EvidenceTier> = {
  // EEOC charge data and DoD's own discharge and reinstatement figures.
  EMPLOYMENT_TERMINATION: 'DOCUMENTED',
  MILITARY_DISCHARGE: 'DOCUMENTED',
  DEMOTION_REASSIGNMENT: 'DOCUMENTED',
  DENIED_HIRE: 'DOCUMENTED',
  // Real, documented mechanisms (Israel's Green Pass, NYC's Key to NYC) but
  // without published counts of individuals affected.
  ACCESS_DENIAL_SERVICES: 'PEER_REVIEWED',
  ACCESS_DENIAL_HEALTHCARE: 'PEER_REVIEWED',
  EDUCATION_ACCESS_DENIAL: 'PEER_REVIEWED',
  // The plan names these two as the weakest tier and warns against flattening.
  FAMILY_RELATIONSHIP_RUPTURE: 'QUALITATIVE',
  SOCIAL_OSTRACIZATION: 'QUALITATIVE',
  OTHER: 'QUALITATIVE',
};

/**
 * The tier for a category value. Anything unrecognised — a newly added enum
 * member that has not been classified yet — falls to QUALITATIVE. Failing
 * downward is the only safe default: the cost of understating evidence is a
 * muted bar, and the cost of overstating it is the claim Rule 2 forbids.
 */
export function evidenceTierFor(domain: 'MEDICAL' | 'SOCIAL_ECONOMIC', value: string): EvidenceTier {
  const table: Record<string, EvidenceTier> = domain === 'MEDICAL' ? MEDICAL_TIERS : SOCIAL_TIERS;
  return table[value] ?? 'QUALITATIVE';
}
