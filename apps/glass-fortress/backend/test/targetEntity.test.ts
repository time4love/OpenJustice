import { canonicaliseTargetEntity, entityDisplayName, KNOWN_ENTITIES } from '../src/lib/targetEntity';

/**
 * The fixture is not invented: these are the exact `targetEntity` values the two
 * live environments held when this was written. A resolver tested against values
 * nobody has ever produced proves nothing about the vault it has to clean.
 */
const VALUES_IN_THE_WILD = [
  { raw: 'corona.health.gov.il', expect: 'MOH_IL', count: 7 },
  { raw: 'Ministry of Health', expect: 'MOH_IL', count: 2 },
  { raw: 'משרד הבריאות', expect: 'MOH_IL', count: 1 },
] as const;

describe('the values both environments actually hold all resolve', () => {
  it.each(VALUES_IN_THE_WILD)('$raw -> $expect ($count record(s))', ({ raw, expect: id }) => {
    expect(canonicaliseTargetEntity(raw)).toBe(id);
  });

  it('collapses what the split had separated', () => {
    // The defect: ?targetEntity=Ministry of Health returned 1 record and
    // ?targetEntity=משרד הבריאות returned 1 record, and they were the same body.
    const ids = VALUES_IN_THE_WILD.map((v) => canonicaliseTargetEntity(v.raw));
    expect(new Set(ids).size).toBe(1);
  });
});

describe('a domain names a source, not an entity', () => {
  it.each([
    'corona.health.gov.il',
    'https://corona.health.gov.il/vaccine-for-covid/',
    'www.health.gov.il',
    'HEALTH.GOV.IL',
  ])('%s resolves through its publisher', (raw) => {
    expect(canonicaliseTargetEntity(raw)).toBe('MOH_IL');
  });

  it('does not match a domain that merely ends in similar text', () => {
    expect(canonicaliseTargetEntity('nothealth.gov.il.example.com')).toBeNull();
  });
});

describe('normalisation is exact, never fuzzy', () => {
  it.each(['  Ministry   of Health ', 'MINISTRY OF HEALTH', 'ministry of health'])(
    'tolerates case and whitespace: %s',
    (raw) => expect(canonicaliseTargetEntity(raw)).toBe('MOH_IL'),
  );

  it('refuses a near miss rather than guessing', () => {
    // Fuzzy matching would reintroduce exactly the ambiguity this removes, and
    // would do it invisibly. An unresolved value is a vocabulary gap to fix.
    expect(canonicaliseTargetEntity('Ministry of Healthcare')).toBeNull();
    expect(canonicaliseTargetEntity('Department of Health')).toBeNull();
  });
});

describe('null means not-yet-resolved, never "unknown entity"', () => {
  it.each([null, undefined, '', '   ', 'Unknown', 'UNKNOWN'])('%s -> null', (raw) => {
    expect(canonicaliseTargetEntity(raw as string | null | undefined)).toBeNull();
  });

  it('an entity absent from the vocabulary is a gap, not a failure', () => {
    expect(canonicaliseTargetEntity('Clalit Health Services')).toBeNull();
  });
});

describe('the vocabulary itself is well formed', () => {
  it('has unique ids', () => {
    const ids = KNOWN_ENTITIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no alias is claimed by two entities', () => {
    const seen = new Map<string, string>();
    for (const e of KNOWN_ENTITIES) {
      for (const a of e.aliases) {
        const key = a.trim().toLowerCase();
        expect(seen.has(key) ? `${key} also claimed by ${seen.get(key)}` : null).toBeNull();
        seen.set(key, e.id);
      }
    }
  });

  it('no domain is claimed by two entities', () => {
    const all = KNOWN_ENTITIES.flatMap((e) => e.domains);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every entity carries both display languages', () => {
    for (const e of KNOWN_ENTITIES) {
      expect(e.he.trim()).not.toBe('');
      expect(e.en.trim()).not.toBe('');
      // Hebrew display names must actually be Hebrew — a Cyrillic lookalike
      // slipped into one on first writing and typechecked perfectly.
      expect(e.he).toMatch(/[֐-׿]/);
      expect(e.he).not.toMatch(/[Ѐ-ӿͰ-Ͽ]/);
    }
  });

  it('resolves its own ids and renders both languages', () => {
    for (const e of KNOWN_ENTITIES) {
      expect(canonicaliseTargetEntity(e.id)).toBe(e.id);
      expect(entityDisplayName(e.id, 'he')).toBe(e.he);
      expect(entityDisplayName(e.id, 'en')).toBe(e.en);
    }
    expect(entityDisplayName('NO_SUCH_ENTITY', 'he')).toBeNull();
    expect(entityDisplayName(null, 'en')).toBeNull();
  });
});
