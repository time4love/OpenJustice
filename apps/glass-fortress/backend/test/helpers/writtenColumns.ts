/**
 * The columns one tagged-template raw UPDATE actually wrote, addressed BY NAME.
 *
 * WHY THIS EXISTS. Assertions on these writes used to read
 * `expect(params).toContain(VALUE)` — membership in the parameter bag. That is
 * column-blind: it passes whether the value lands in the column intended, in a
 * neighbouring one, or anywhere else in the statement. It looks semantic and is
 * merely positional-agnostic, which is worse than positional.
 *
 * It is not a hypothetical weakness. `reconcileAgainstCdx` wrote the CDX digest
 * — base32(SHA-1) — into `documentHash`, a column defined as SHA-256, and the
 * test written to prove that repair worked ASSERTED THE DEFECT: the CDX digest
 * was in the bag, so `toContain` was satisfied. The corruption reached all 83
 * captures in both environments with that test green.
 *
 * Parsing the template's own `"col" = $n` fragments makes an assertion say which
 * column it means, and keeps it honest if the column order ever changes.
 *
 * Takes the WHOLE mock call — `[templateStrings, ...values]` — not `slice(1)`,
 * because the column names live in the template strings that slicing discards.
 */
export function writtenColumns(call: unknown[]): Record<string, unknown> {
  const [strings, ...values] = call as [string[], ...unknown[]];
  const written: Record<string, unknown> = {};
  strings.forEach((fragment, i) => {
    const match = /"([A-Za-z]+)"\s*=\s*$/.exec(fragment);
    if (match?.[1] !== undefined && i < values.length) written[match[1]] = values[i];
  });
  return written;
}
