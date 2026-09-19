import type { ClassifierOpinion } from '@/types/corpus';

/**
 * THE CLASSIFIER'S OPINION, hand-written from evidence A4 :1086–:1087 — all six fields, because the appendix
 * names six and a fixture that carried only what a component reads could never witness the ones it must not.
 *
 * ITS `significance` IS LONG ON PURPOSE AND ITS WORDS ARE MINE. The researcher's measurement of 2026-09-18
 * — the clause that replaced the chip with a two-line clamp — is that a real `significance` runs 197
 * characters where a chip at 375px shows about forty. What a case can hold is that the FULL string reaches the
 * DOM; the length is what makes that assertion mean something, so this string is at least as long as the
 * measured one. It is NOT the corpus's sentence: a fixture captured from a live body asserts whatever the body
 * was that day, and this repository writes them from the appendix instead (UI plan §4).
 */
export const classifierOpinion: ClassifierOpinion = {
  significance:
    'השינוי גורע מגוף הדף את הפסקה שבה נמסר מידע על תופעות לוואי אפשריות, ואת הקישור שבאמצעותו ניתן היה לדווח עליהן, ומשאיר את ההמלצה להתחסן במקומה ללא המידע הנלווה שהיה בה קודם לכן, כך שהדף המעודכן ממליץ בלא למסור.',
  categories: ['SAFETY_CLAIM_ALTERATION', 'WITHHOLDING_INFORMATION'],
  legallySignificant: true,
  editorial: true,
  classifierVersion: 'v5-editorial-verdict',
  draws: 2,
};
