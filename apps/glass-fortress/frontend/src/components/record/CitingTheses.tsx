'use client';

import { useTranslations } from 'next-intl';
import type { EvidenceLink } from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CITING PUBLISHED THESES — ONE LIST, THREE SURFACES. docs/gf-ui-flows.md §26 (the sheet, the diff page
// and the record's own page each show "the citing theses as links"), A4 :1090.
//
// EXTRACTED 2026-09-20 under §26 :825's clean-code ruling — „no duplicate code to produce same element" —
// the same ruling that produced `RecordContent` and `DiffRuns`. The corpus record sheet has drawn this list
// since chunk 5b; the diff page needs the identical element from the identical field, and a second spelling
// would be a second answer to "who cites this record".
//
// `citedBy` LISTS PUBLISHED VERSIONS ONLY (A4 :1090), which is what makes these links public at all: a draft
// citing a record must not be discoverable from the record (§9.5's leak, through a list instead of a route).
//
// A THESIS IS NAMED BY ITS CLAIM AND NEVER BY ITS ID (§4), and no corpus body carries the claim — only the
// id. So the link's words are the CITED mark's own approved phrase and the id stays in the `href`, which is
// the one place a URL may carry one.
// ---------------------------------------------------------------------------

export function CitingTheses({ evidence }: { evidence: EvidenceLink | null }) {
  const t = useTranslations('corpus');
  if (evidence === null || evidence.citedBy.length === 0) return null;
  return (
    <ul data-citing-theses className="flex flex-col gap-1 text-xs">
      {evidence.citedBy.map((cite) => (
        <li key={cite.thesisId}>
          <a href={`/theses/${cite.thesisId}`} className="text-ink underline">
            {t('cited')}
          </a>
        </li>
      ))}
    </ul>
  );
}
