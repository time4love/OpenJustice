import type { SurvivalLabels } from '@/components/SurvivalChip';

/**
 * The Level 5 labels, assembled once.
 *
 * FOUR CALL SITES render a diff card, and each one builds its label object by
 * hand. Repeating eleven translation keys in four places is how one of them ends
 * up a release behind the others — so the states that must never be confused get
 * one builder, and adding a sixth state is one edit rather than a search.
 *
 * Typed against the minimal shape of next-intl's translator rather than importing
 * its generic: this file must not care which namespace it was handed, only that
 * the keys below resolve inside it.
 */
export function buildSurvivalLabels(t: (key: string) => string): SurvivalLabels {
  return {
    chip: {
      UNCHECKED: t('survivalUnchecked'),
      STALE: t('survivalStale'),
      SURVIVES: t('survivalSurvives'),
      CONTRADICTED: t('survivalContradicted'),
      UNCHECKABLE: t('survivalUncheckable'),
    },
    note: {
      UNCHECKED: t('survivalUncheckedNote'),
      STALE: t('survivalStaleNote'),
      CONTRADICTED: t('survivalContradictedNote'),
      UNCHECKABLE: t('survivalUncheckableNote'),
    },
    notPromotable: t('survivalNotPromotable'),
  };
}
