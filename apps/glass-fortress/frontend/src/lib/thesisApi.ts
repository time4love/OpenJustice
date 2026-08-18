import { apiUrl } from '@/lib/api';
import type { ThesisSummary } from '@/types/thesis';

/**
 * Fetch the thesis list. Callers differ in trigger pattern (on-mount, on-demand,
 * combined with other fetches) and in filter/sort — those stay local to each
 * page; this only shares the fetch + parse mechanics.
 */
export async function fetchTheses(query?: string): Promise<ThesisSummary[]> {
  const url = query ? apiUrl(`/api/thesis?${query}`) : apiUrl('/api/thesis');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch theses (${res.status})`);
  const data = (await res.json()) as { theses: ThesisSummary[] };
  return data.theses ?? [];
}

export interface FoiaLetterResult {
  letterText: string;
  targetMinistry: string;
  legalBasis: string;
  targetEmail?: string;
  targetAddress?: string;
}

export async function generateFoiaRequest(thesisId: string, gapIndex: number): Promise<FoiaLetterResult> {
  const res = await fetch(apiUrl(`/api/thesis/${thesisId}/foia-request`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gapIndex }),
  });
  if (!res.ok) throw new Error(`Failed to generate FOIA request (${res.status})`);
  return (await res.json()) as FoiaLetterResult;
}
