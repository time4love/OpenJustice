import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { IntakeAgent } from '../../services/IntakeAgent';
import { getResearcherId } from '../../context/researcherContext';
import { Web3Service } from '../../services/Web3Service';
import { buildEvidenceAnalysisData } from '../../lib/evidenceCreateData';

// IntakeAgent is instantiated per-call — construction is cheap (no LLM work);
// only .analyzeText() triggers network I/O.
function getAgent(): IntakeAgent {
  return new IntakeAgent();
}

export const createEvidenceFromUrlSchema = {
  url: z.string().url().describe('Public URL of the article or document to analyse'),
};

export interface CreateEvidenceFromUrlResult {
  evidenceId: string;
  fileHash: string;
  status: 'PENDING_REVIEW';
  summary: string;
  evidenceTier: string;
  evidenceRole: string;
  investigativeCategories: string[];
  targetEntity: string;
  evidenceDate: string;
  keyFigures: string[];
  sourceUrl: string;
  message: string;
}

export async function createEvidenceFromUrlHandler(input: {
  url: string;
}): Promise<string> {
  // 1. Fetch the resource
  const response = await fetch(input.url, {
    headers: { 'User-Agent': 'GlassFortress/1.0 (legal evidence archiver)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status}): ${input.url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const agent = getAgent();
  let analysis: Awaited<ReturnType<typeof agent.analyzeText>>;
  let fileHash: string;

  if (contentType.includes('application/pdf')) {
    // 2a. PDF path — pass the raw buffer to analyzeEvidence so the LLM receives
    //     the document as a proper content block (Anthropic native doc / Gemini base64).
    //     Hash the buffer itself, consistent with the file-upload confirm route.
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) {
      throw new Error(`Fetched PDF too small to analyse (${buffer.length} bytes). Is the URL publicly accessible?`);
    }
    analysis = await agent.analyzeEvidence(buffer, 'application/pdf');
    fileHash = Web3Service.hashFile(buffer);
  } else {
    // 2b. HTML/text path — strip markup and feed plain text to analyzeText.
    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (text.length < 100) {
      throw new Error(`Fetched content too short to analyse (${text.length} chars). Is the URL publicly accessible?`);
    }
    analysis = await agent.analyzeText(text, input.url);
    fileHash = Web3Service.hashFile(Buffer.from(`${input.url}\n\n${text.slice(0, 40_000)}`, 'utf8'));
  }

  // 5. Check for duplicate
  const existing = await prisma.evidence.findUnique({ where: { fileHash } });
  if (existing) {
    const result: CreateEvidenceFromUrlResult = {
      evidenceId: existing.id,
      fileHash: existing.fileHash,
      status: 'PENDING_REVIEW',
      summary: existing.summary,
      evidenceTier: existing.evidenceTier,
      evidenceRole: existing.evidenceRole,
      investigativeCategories: existing.investigativeCategories,
      targetEntity: existing.targetEntity,
      evidenceDate: existing.evidenceDate,
      keyFigures: [],
      sourceUrl: input.url,
      message: `Evidence already exists with status ${existing.status}. No duplicate created.`,
    };
    return JSON.stringify(result);
  }

  // 6. Upsert KeyFigure records (idempotent)
  if (analysis.keyFigures.length > 0) {
    await prisma.keyFigure.createMany({
      data: analysis.keyFigures.map((name) => ({ name })),
      skipDuplicates: true,
    });
  }

  // 7. Persist as PENDING_REVIEW — NO on-chain hash, NO Pinecone upsert
  const researcherId = getResearcherId();
  const record = await prisma.evidence.create({
    data: {
      fileHash,
      status: 'PENDING_REVIEW',
      ...buildEvidenceAnalysisData(analysis),
      figures: { connect: analysis.keyFigures.map((name) => ({ name })) },
      sourceUrl: input.url,
      ...(researcherId ? { createdById: researcherId } : {}),
    },
    include: { figures: { select: { name: true } } },
  });

  const result: CreateEvidenceFromUrlResult = {
    evidenceId: record.id,
    fileHash: record.fileHash,
    status: 'PENDING_REVIEW',
    summary: record.summary,
    evidenceTier: record.evidenceTier,
    evidenceRole: record.evidenceRole,
    investigativeCategories: record.investigativeCategories,
    targetEntity: record.targetEntity,
    evidenceDate: record.evidenceDate,
    keyFigures: record.figures.map((f) => f.name),
    sourceUrl: input.url,
    message:
      'Evidence saved as PENDING_REVIEW. It will NOT appear in the public vault or be registered on-chain until a human reviewer promotes it via the UI.',
  };

  return JSON.stringify(result);
}
