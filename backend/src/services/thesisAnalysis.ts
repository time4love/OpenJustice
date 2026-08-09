// ---------------------------------------------------------------------------
// Shared thesis AI analysis logic
//
// Extracted so both thesisRoutes.ts (fire-and-forget REST) and the MCP
// run_ai_analysis tool (synchronous) can reuse the same implementation.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  DevilsAdvocateAgent,
  type ReferencedEvidence,
} from './DevilsAdvocateAgent';

let _agent: DevilsAdvocateAgent | null = null;

function getAgent(): DevilsAdvocateAgent {
  if (!_agent) _agent = new DevilsAdvocateAgent();
  return _agent;
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Walk a TipTap document JSON and extract plain text, resolving mention nodes
 * to human-readable tokens (e.g. @Netanyahu, #ev_abc123).
 */
export function extractText(doc: unknown): string {
  function walk(node: Record<string, unknown>): string {
    if (node.type === 'text') return String(node.text ?? '');
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (node.type === 'keyFigureMention') return `@${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'evidenceMention') return `#ev_${String(attrs?.['id'] ?? '')}`;
    if (node.type === 'trackedUrlMention') return `#url_${String(attrs?.['id'] ?? '')}`;
    const content = node.content;
    if (!Array.isArray(content)) return '';
    return (content as unknown[]).map((c) => walk(c as Record<string, unknown>)).join(' ');
  }
  return walk(doc as Record<string, unknown>)
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPreview(doc: unknown): string {
  return extractText(doc).slice(0, 120);
}

/**
 * Run Devil's Advocate analysis on a ThesisVersion and persist the result.
 * Safe to call fire-and-forget (errors are caught and logged) or awaited
 * for synchronous use (MCP tool).
 */
export async function triggerAIAnalysis(
  versionId: string,
  userContent: unknown,
): Promise<void> {
  try {
    const version = await prisma.thesisVersion.findUnique({
      where: { id: versionId },
      include: { mentions: { where: { type: 'EVIDENCE' } } },
    });
    if (!version) return;

    const evidenceRecords = await prisma.evidence.findMany({
      where: { fileHash: { in: version.mentions.map((m) => m.refId) } },
      select: {
        fileHash: true,
        category: true,
        targetEntity: true,
        evidenceTier: true,
        evidenceRole: true,
        evidenceDate: true,
        summary: true,
      },
    });

    const referenced: ReferencedEvidence[] = evidenceRecords;
    const thesisText = extractText(userContent);
    const aiAnalysis = await getAgent().analyze(thesisText, referenced);
    const contentHash = sha256({ userContent, aiAnalysis });

    await prisma.thesisVersion.update({
      where: { id: versionId },
      data: { aiAnalysis, contentHash, status: 'COMPLETE' },
    });
  } catch (err) {
    console.error('[thesis] AI analysis failed for version', versionId, err);
    throw err;
  }
}
