import { z } from 'zod';
import { IntakeAgent } from '../../services/IntakeAgent';
import { getResearcherId } from '../../context/researcherContext';
import { persistScreenshotEvidence, type PersistedEvidenceResult } from '../../lib/persistScreenshotEvidence';
import { MAX_EVIDENCE_FILE_BYTES } from '../../lib/evidenceFileConstraints';

function getAgent(): IntakeAgent {
  return new IntakeAgent();
}

export const recoverEvidenceFromScreenshotSchema = {
  failedUrl: z
    .string()
    .url()
    .describe('The source URL that could not be fetched directly (blocked, not in Wayback Machine)'),
  failureReason: z
    .string()
    .optional()
    .describe('Why the direct fetch failed, e.g. "HTTP 403" — becomes provenance context'),
  screenshots: z
    .array(
      z.object({
        base64: z.string(),
        mimeType: z.enum(['image/jpeg', 'image/png']),
      }),
    )
    .min(1)
    .max(10)
    .describe('One or more screenshots, in reading order, together covering the full page'),
};

export type RecoverEvidenceFromScreenshotResult = PersistedEvidenceResult;

export async function recoverEvidenceFromScreenshotHandler(input: {
  failedUrl: string;
  failureReason?: string;
  screenshots: { base64: string; mimeType: 'image/jpeg' | 'image/png' }[];
}): Promise<string> {
  const images = input.screenshots.map(({ base64, mimeType }) => {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error(
        `Screenshot exceeds the ${MAX_EVIDENCE_FILE_BYTES / (1024 * 1024)} MB size limit (${buffer.length} bytes).`,
      );
    }
    return { buffer, mimeType };
  });

  const contextNote =
    `Source URL (blocked — not fetched directly): ${input.failedUrl}` +
    (input.failureReason ? `\nFailure reason: ${input.failureReason}` : '');

  const analysis = await getAgent().analyzeMultiImageEvidence(images, contextNote);

  const result = await persistScreenshotEvidence({
    images,
    analysis,
    sourceUrl: input.failedUrl,
    createdById: getResearcherId(),
  });

  return JSON.stringify(result);
}
