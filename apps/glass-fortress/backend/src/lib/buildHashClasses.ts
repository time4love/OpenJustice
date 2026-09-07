// ---------------------------------------------------------------------------
// BUILD-HASH CLASS FAMILIES — docs/gf-interaction-flows.md A8 and MARKING,
// amended 2026-09-06: "a class that is a BUILD ARTEFACT is not a name."
//
// A LIST of patterns naming classes a build tool generates — emotion and
// styled-components emit `css-<hash>` — and regenerates at every build. Measured
// in measurement part 2 (34 of walla's 37 silent-rule entries carried one) and
// live in step 5's staging exercise (at each of four redesigns every rule
// carrying one died; every hashless class rule survived). The selector the
// marking page offers sets these aside before forming its class candidate, so
// `header.no-mobile-app.css-1mryvlz.main-header` is offered as
// `header.no-mobile-app.main-header`; when the hashless form is not unique the
// hashed one is offered next and TAGGED, the way a positional selector is.
//
// ONE IMPORTABLE SYMBOL. A new site with a new family adds an entry here; the
// design does not change. The list is an operational parameter, not a judgement
// (A8), and it is never consulted at match time: a rule is the string the
// researcher approved.
// ---------------------------------------------------------------------------

export const BUILD_HASH_CLASS_FAMILIES: readonly RegExp[] = [
  /** emotion / styled-components: `css-` followed by a base-36 hash. */
  /^css-[0-9a-z]+$/,
];

/** True when a class name is a build artefact under one of the families above. */
export function isBuildHashClass(className: string): boolean {
  return BUILD_HASH_CLASS_FAMILIES.some((family) => family.test(className));
}
