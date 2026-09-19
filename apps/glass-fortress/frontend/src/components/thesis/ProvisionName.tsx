import { useTranslations } from 'next-intl';

/**
 * THE PROVISION NAMED BY ITS TABLE ENTRY — docs/gf-ui-flows.md §17 :532 (region 2, the claim's line);
 * thesis A1 :1251–:1254. *(This citation read ":529–:530" until 2026-09-19, which is the PUBLIC-INTEREST
 * STATEMENT and the LEGAL DISCLAIMER — it drifted when lines were inserted above it.)*
 *
 * THE LABEL IS A CODE→LANGUAGE MAPPING AND THEREFORE LIVES IN THE MESSAGE CATALOGUE (the researcher,
 * 2026-09-19): „מדובר על תרגום של קוד מערכת לשפה שהמשתמש יכול לקרוא, אני חושב שזה נופל בהגדרה של טבלת מיפוי
 * מרובת שפות." It is not a fact the backend holds ABOUT A THESIS; it is this platform's word for a code, and it
 * has one per language. A1 defines PROVISION as a table of ELEMENT SHAPES and fixes no display label, so the
 * read's `provisionTitle` was a UI-5 implementation choice and never an appendix requirement — which made it a
 * second renderer for a label that has one home, and one the frontend could not translate.
 *
 * ONE MECHANISM: every surface that names a provision calls THIS component and reads THIS catalogue. Two
 * renderers for one label is the defect this repository names as its own.
 *
 * THE LABEL IS SHORT, and that is the point of it. The backend table's longest entry, `PATIENT_RIGHTS_13`, runs
 * to 120 characters (`NUREMBERG_2` to 106) and reads as a second sentence beside a claim of 558; what a reader
 * needs here is WHICH provision, not its text.
 *
 * A CODE WITH NO LABEL RENDERS THE RAW CODE — never a throw, never blank. A missing message THROWS here, on the
 * server and in the suite alike, so the read is GUARDED: a provision that reaches the backend table before its
 * two strings reach the catalogue shows `NUREMBERG_11` rather than taking the page down. `provision-is-a-lookup`
 * holds both halves.
 *
 * `dir="auto"` because the label's direction now FOLLOWS THE LOCALE — Hebrew under `he`, Latin under `en` — so
 * it is DETECTED rather than fixed. *(The clause read "because the label is Hebrew on an English page too" until
 * 2026-09-19. That was true of the backend field, which was Hebrew for every caller, and this chunk is what
 * ended it: `/en` now renders "Patients' Rights Law, section 13". A reason a change falsifies goes with it.)*
 * A thesis with no provision renders nothing.
 */
export function ProvisionName({ provision }: { provision: string | null }) {
  const t = useTranslations('provision');
  if (provision === null || provision === '') return null;
  return (
    <p dir="auto" className="text-sm text-ink-muted">
      {t.has(provision) ? t(provision) : provision}
    </p>
  );
}
