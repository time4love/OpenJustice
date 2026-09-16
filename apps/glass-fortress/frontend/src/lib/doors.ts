/**
 * THE DOOR FLAG — docs/gf-ui-flows.md §17 :546–:548, §23 :644–:645; docs/gf-ui-refactor-plan.md UI-5 :416–:418;
 * docs/gf-document-refactor-plan.md :506–:509 (the intake-down window).
 *
 * ONE constant, and the document plan's step 32 is the only thing that sets it. Until then the public pages carry
 * the intake instruction as TEXT and draw no door — a page that pointed at a channel which is not open would be
 * asking the public to send documents nobody can receive.
 *
 * Read by: `components/SiteNav.tsx`' `/safety` entry (§32 :808 "when live"), UI-6's door card, and
 * `test/noDoorBeforeItExists.test.tsx`. Typed `boolean`, not the literal, so a reader's condition is a real one.
 */
export const DOORS_OPEN: boolean = false;
