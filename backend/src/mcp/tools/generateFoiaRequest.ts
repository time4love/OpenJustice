import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { DevilsAdvocateOutputSchema } from '../../services/DevilsAdvocateAgent';
import { FoiaLetterAgent } from '../../services/FoiaLetterAgent';
import { extractText } from '../../services/thesisAnalysis';

let _agent: FoiaLetterAgent | null = null;

function getAgent(): FoiaLetterAgent {
  if (!_agent) _agent = new FoiaLetterAgent();
  return _agent;
}

export const generateFoiaRequestSchema = {
  thesisId: z.string().uuid().describe('UUID of the thesis containing the evidence gap'),
  gapIndex: z
    .number()
    .int()
    .min(0)
    .describe('Zero-based index into evidenceGaps[] from the Devil\'s Advocate analysis'),
};

export interface GenerateFoiaRequestResult {
  letterText: string;
  targetMinistry: string;
  legalBasis: string;
  gapDescription: string;
  thesisId: string;
  gapIndex: number;
}

export async function generateFoiaRequestHandler(input: {
  thesisId: string;
  gapIndex: number;
}): Promise<string> {
  const { thesisId, gapIndex } = input;

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: { headVersion: true },
  });

  if (!thesis?.headVersion) {
    return JSON.stringify({ error: `Thesis not found: "${thesisId}"` });
  }

  const hv = thesis.headVersion;

  if (hv.status !== 'COMPLETE' || hv.aiAnalysis === null) {
    return JSON.stringify({
      error: 'Thesis head version has no completed AI analysis. Run run_ai_analysis first.',
    });
  }

  const critique = DevilsAdvocateOutputSchema.safeParse(hv.aiAnalysis);
  if (!critique.success) {
    return JSON.stringify({ error: 'AI analysis schema mismatch — cannot extract gaps.' });
  }

  const { evidenceGaps } = critique.data;

  if (gapIndex < 0 || gapIndex >= evidenceGaps.length) {
    return JSON.stringify({
      error: `gapIndex ${gapIndex} is out of range — thesis has ${evidenceGaps.length} gap(s) (indices 0–${evidenceGaps.length - 1}).`,
    });
  }

  const gap = evidenceGaps[gapIndex];
  if (!gap) {
    return JSON.stringify({ error: `Gap at index ${gapIndex} not found.` });
  }

  // Derive thesis title: prefer stored title, fall back to first line of body
  const thesisTitle =
    thesis.title?.trim() ||
    extractText(hv.userContent).split('\n').find((l) => l.trim().length > 0) ||
    `Thesis ${thesisId.slice(0, 8)}`;

  const letter = await getAgent().generate({
    thesisTitle,
    gapDescription: gap.description,
    suggestedSearch: gap.suggestedSearch,
  });

  const result: GenerateFoiaRequestResult = {
    letterText: letter.letterText,
    targetMinistry: letter.targetMinistry,
    legalBasis: letter.legalBasis,
    gapDescription: gap.description,
    thesisId,
    gapIndex,
  };

  return JSON.stringify(result);
}
