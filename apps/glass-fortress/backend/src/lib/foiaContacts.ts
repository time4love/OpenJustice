import { normaliseClaim } from './normalise';

/**
 * WHERE A FREEDOM-OF-INFORMATION REQUEST IS SENT — a CODE TABLE, the researcher's ruling of 2026-09-14 (R48 §6-R20).
 *
 * An address is a FACT the platform states on a public page beside a request any citizen may send (T4 :677–:679), never
 * a model's recall of one: the drafter names the AUTHORITY, and `draft_foia_request` fills `addresses` from here. An
 * authority the table does not know gets NO address — said by the tool, never guessed.
 *
 * The rows are the three the legacy drafting prompt carried and the researcher approved at the sketch (§d3, round 1).
 * Extending the table is a code change, reviewed like any other statement the platform makes in public.
 */
export const FOIA_CONTACTS: Readonly<Record<string, readonly string[]>> = {
  'משרד הבריאות': ['chofesh.mida@moh.health.gov.il', 'רחוב בן טבאי 2, ירושלים 9101002'],
  'משרד ראש הממשלה': ['dover@pmo.gov.il', 'שדרות קפלן 3, ירושלים 9101001'],
  'משרד המשפטים': ['cfm@justice.gov.il', 'רחוב צלאח א-דין 29, ירושלים 9107701'],
};

/** The addresses of the authority the drafter named — matched on NORMALISE's form, the one symbol — or none. */
export function foiaAddressesOf(authority: string): readonly string[] {
  const wanted = normaliseClaim(authority);
  const hit = Object.entries(FOIA_CONTACTS).find(([name]) => normaliseClaim(name) === wanted);
  return hit === undefined ? [] : hit[1];
}
