'use client';

import { useMessages } from 'next-intl';

/**
 * How a record's target entity is displayed.
 *
 * The backend resolves `targetEntity` (what the model observed) into
 * `canonicalTargetEntity` (a language-free key). Turning that key into a label
 * is presentation, so it happens here.
 *
 * Keeping language out of the key is the point. The same ministry was stored as
 * "Ministry of Health" and "משרד הבריאות", so an exact-match filter on either
 * returned half the evidence with no sign the other half existed — and seven
 * further records named a hostname, which is a source rather than an entity.
 *
 * Names live in the message catalogues rather than in this file, so a translator
 * can improve one without a backend deploy. The ids mirror `KNOWN_ENTITIES` in
 * the backend.
 */
export function useTargetEntityName(): (
  canonicalId: string | null | undefined,
  raw: string,
) => string {
  const names = (useMessages() as { entityDisplayNames?: Record<string, string> })
    .entityDisplayNames;

  return (canonicalId, raw) => {
    // Falls back to the raw observation when the key is unresolved. That is
    // honest: an unresolved record is a gap in the vocabulary, and showing what
    // the model actually said beats showing nothing or inventing a label.
    if (!canonicalId) return raw;
    return names?.[canonicalId] ?? raw;
  };
}
