// ---------------------------------------------------------------------------
// MCP Tool: run_ai_analysis  [WRITE — STAGING GATE]
//
// Synchronously runs Devil's Advocate AI analysis on the head version of a
// thesis and returns the full critique result. Unlike the REST POST /analyze
// endpoint (which fires-and-forgets returning 202), this tool awaits completion
// so the calling LLM can immediately continue the research loop.
//
// If the head version is already COMPLETE, returns the existing analysis.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { triggerAIAnalysis } from '../../services/thesisAnalysis';

export const runAiAnalysisSchema = {
  thesisId: z.string().min(1).describe('ID of the thesis to analyse (operates on the head version)'),
};

export async function runAiAnalysisHandler(input: { thesisId: string }): Promise<string> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: input.thesisId },
    include: { headVersion: true },
  });

  if (!thesis?.headVersion) {
    return JSON.stringify({ error: `Thesis or head version not found: ${input.thesisId}` });
  }

  const hv = thesis.headVersion;

  if (hv.status === 'COMPLETE' && hv.aiAnalysis !== null) {
    return JSON.stringify({
      thesisId: input.thesisId,
      versionId: hv.id,
      status: 'COMPLETE',
      cached: true,
      aiAnalysis: hv.aiAnalysis,
    });
  }

  // Await synchronously so the MCP caller gets the result immediately
  await triggerAIAnalysis(hv.id, hv.userContent);

  const updated = await prisma.thesisVersion.findUniqueOrThrow({ where: { id: hv.id } });

  return JSON.stringify({
    thesisId: input.thesisId,
    versionId: updated.id,
    status: updated.status,
    cached: false,
    aiAnalysis: updated.aiAnalysis,
  });
}
