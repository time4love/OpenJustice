// ---------------------------------------------------------------------------
// Canonical target entities.
//
// `Evidence.targetEntity` is what the intake model SAID the document is about.
// It is freeform by design and stays that way — it is an observation about the
// document, and re-running intake to tidy it would re-roll tier, date, figures
// and summary too, non-deterministically, on records already reviewed.
//
// `Evidence.canonicalTargetEntity` is the KEY. Resolving one from the other is a
// lookup, not a judgement, so it happens here — deterministically, with no model
// involved — rather than as one more instruction on a prompt that already
// carries fifteen and got three of them subtly wrong in a single day.
//
// The defect that produced this: `targetEntity` was doing two incompatible jobs,
// display label and exact-match filter key, with nothing pinning its form. One
// prompt produced "Ministry of Health" and "משרד הבריאות" for the same body, and
// `?targetEntity=` returned one record for each — half the evidence, with no
// indication the other half existed. Seven further records named
// `corona.health.gov.il`, which is a SOURCE rather than an entity at all.
//
// Matching is exact and explicit on purpose. Fuzzy matching would reintroduce
// precisely the ambiguity this removes, and would do it invisibly.
// ---------------------------------------------------------------------------

export interface KnownEntity {
  /** The key. Never displayed; language belongs to presentation, not to identity. */
  id: string;
  he: string;
  en: string;
  /** Exact spellings seen in the wild, normalised before comparison. */
  aliases: readonly string[];
  /**
   * Hostnames this body publishes under. A record naming a domain is naming a
   * source; the entity is whoever publishes it. Deterministic and obviously
   * correct — and the model was never going to know it reliably.
   */
  domains: readonly string[];
}

/**
 * Seeded from values the two environments actually hold, plus bodies the intake
 * prompt itself references. Deliberately not speculative: an entity nobody has
 * recorded is an entity nobody can canonicalise wrongly.
 *
 * This list grows as the vault does. `canonicalTargetEntity` is null until an
 * entity is here, which is a visible queue rather than a silent default.
 */
export const KNOWN_ENTITIES: readonly KnownEntity[] = [
  {
    id: 'MOH_IL',
    he: 'משרד הבריאות',
    en: 'Ministry of Health (Israel)',
    aliases: [
      'ministry of health',
      'israeli ministry of health',
      'israel ministry of health',
      'moh',
      'משרד הבריאות',
      'משרד הבריאות הישראלי',
    ],
    domains: ['corona.health.gov.il', 'health.gov.il'],
  },
  {
    id: 'FDA',
    he: 'מנהל המזון והתרופות האמריקאי',
    en: 'U.S. Food and Drug Administration',
    aliases: ['fda', 'u.s. food and drug administration', 'us food and drug administration', 'ה-fda'],
    domains: ['fda.gov'],
  },
  {
    id: 'WHO',
    he: 'ארגון הבריאות העולמי',
    en: 'World Health Organization',
    aliases: ['who', 'world health organization', 'world health organisation'],
    domains: ['who.int'],
  },
  {
    id: 'PFIZER',
    he: 'פייזר',
    en: 'Pfizer',
    aliases: ['pfizer', 'פייזר', 'biontech', 'pfizer/biontech'],
    domains: ['pfizer.com'],
  },
];

/** Trim, collapse internal whitespace, lowercase. A no-op for Hebrew casing. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Strip scheme, path and any leading www. from something that looks like a URL. */
function hostOf(value: string): string {
  return value
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .replace(/^www\./i, '')
    .toLowerCase();
}

/**
 * The canonical id for a raw target entity, or null when nothing matches.
 *
 * `null` means "not yet resolved" and never "unknown entity" — the same
 * distinction an absent EvidenceCapture carries. A record that cannot be
 * canonicalised is a gap in the vocabulary, which is a thing to fix rather than
 * a property of the record.
 */
export function canonicaliseTargetEntity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = normalise(raw);
  if (value === '' || value === 'unknown') return null;

  for (const entity of KNOWN_ENTITIES) {
    if (normalise(entity.id) === value) return entity.id;
    if (entity.aliases.some((a) => normalise(a) === value)) return entity.id;
  }

  const host = hostOf(raw);
  for (const entity of KNOWN_ENTITIES) {
    if (entity.domains.some((d) => host === d || host.endsWith(`.${d}`))) return entity.id;
  }

  return null;
}

/** Display name for a canonical id, or null when the id is unknown. */
export function entityDisplayName(id: string | null, locale: 'he' | 'en'): string | null {
  if (!id) return null;
  const entity = KNOWN_ENTITIES.find((e) => e.id === id);
  return entity ? entity[locale] : null;
}
