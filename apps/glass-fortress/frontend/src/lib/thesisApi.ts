import { apiUrl, authHeaders } from '@/lib/api';
import type { PublicationReport, PublishOutcome, ThesisSummary } from '@/types/thesis';

/**
 * Fetch the thesis list. Callers differ in trigger pattern (on-mount, on-demand,
 * combined with other fetches) and in filter/sort — those stay local to each
 * page; this only shares the fetch + parse mechanics.
 */
export async function fetchTheses(query?: string): Promise<ThesisSummary[]> {
  const url = query ? apiUrl(`/api/thesis?${query}`) : apiUrl('/api/thesis');
  const res = await fetch(url, { headers: authHeaders() });
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

// ---------------------------------------------------------------------------
// Publication — the web half of the gate. Researcher-only on the backend.
// ---------------------------------------------------------------------------

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as T };
}

export async function checkPublicationReadiness(
  thesisId: string,
  input: { rationale?: string; publicInterestStatement?: string },
): Promise<PublicationReport> {
  const { status, data } = await postJson<PublicationReport | { error: string }>(
    `/api/thesis/${thesisId}/publication-readiness`,
    input,
  );
  if (status !== 200 || 'error' in data) throw new Error(`Readiness check failed (${status})`);
  return data;
}

export async function publishThesis(
  thesisId: string,
  input: { rationale: string; publicInterestStatement?: string },
): Promise<PublishOutcome> {
  const { status, data } = await postJson<PublishOutcome | { error: string; message?: string }>(
    `/api/thesis/${thesisId}/publish`,
    input,
  );
  if (status === 200 || status === 422 || status === 409) return data as PublishOutcome;
  throw new Error(`Publish failed (${status})`);
}

export async function unpublishThesis(thesisId: string, reason: string): Promise<void> {
  const { status } = await postJson<unknown>(`/api/thesis/${thesisId}/unpublish`, { reason });
  if (status !== 200) throw new Error(`Unpublish failed (${status})`);
}
