// ---------------------------------------------------------------------------
// MCP Tool: run_ai_analysis  [WRITE — STAGING GATE]
//
// Synchronously runs Devil's Advocate AI analysis on the head version of a
// thesis and returns the full critique result. Unlike the REST POST /analyze
// endpoint (which fires-and-forgets returning 202), this tool awaits completion
// so the calling LLM can immediately continue the research loop.
//
// The stored analysis is returned only when it is still an answer to the same
// input — see analysisInputHash in triggerAIAnalysis.
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

  // Whether the stored critique still answers the facts is decided in one place,
  // by comparing the fingerprint of the critic's actual input. This tool used to
  // make that call itself with `status === COMPLETE`, which is a property of the
  // VERSION and says nothing about whether the analysis is still current.
  const { ran } = await triggerAIAnalysis(hv.id, hv.userContent);

  const updated = await prisma.thesisVersion.findUniqueOrThrow({ where: { id: hv.id } });

  return JSON.stringify({
    thesisId: input.thesisId,
    versionId: updated.id,
    status: updated.status,
    cached: !ran,
    aiAnalysis: updated.aiAnalysis,
  });
}
