export function formatHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

/**
 * Truncate prose to a display-friendly label: trims to the last word boundary
 * at-or-under maxLen and appends an ellipsis, instead of cutting mid-word.
 */
export function truncateLabel(text: string, maxLen = 35): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed}…`;
}
