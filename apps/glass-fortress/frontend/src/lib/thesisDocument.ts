import { apiUrl, authHeaders } from '@/lib/api';

export function appendEvidenceMention(
  doc: Record<string, unknown>,
  fileHash: string,
  label: string,
): Record<string, unknown> {
  const content = [...((doc.content as unknown[]) ?? [])];
  content.push({
    type: 'paragraph',
    content: [{ type: 'evidenceMention', attrs: { id: fileHash, label: label.slice(0, 30) } }],
  });
  return { ...doc, content };
}

/**
 * Append an evidence mention to a thesis version and save it. Shared by any
 * "add this evidence to a thesis" UI. When the caller already has the
 * thesis's current content in hand (e.g. the thesis edit page, which is
 * already viewing one specific thesis), pass it as `currentContent` to skip
 * the extra fetch; callers picking from a list of theses (which don't have
 * that content loaded yet) can omit it.
 */
export async function addEvidenceToThesis(
  thesisId: string,
  fileHash: string,
  label: string,
  currentContent?: Record<string, unknown>,
): Promise<void> {
  let content = currentContent;
  if (!content) {
    const res = await fetch(apiUrl(`/api/thesis/${thesisId}`), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to load thesis (${res.status})`);
    const data = (await res.json()) as {
      thesis: { version: { userContent: Record<string, unknown> } | null };
    };
    content = data.thesis.version?.userContent ?? { type: 'doc', content: [] };
  }

  const newContent = appendEvidenceMention(content, fileHash, label);
  const res = await fetch(apiUrl(`/api/thesis/${thesisId}/version`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userContent: newContent }),
  });
  if (!res.ok) throw new Error(`Failed to save thesis version (${res.status})`);
}
