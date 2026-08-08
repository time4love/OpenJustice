import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { IntakeAgent } from '../../services/IntakeAgent';

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
  category: string;
  targetEntity: string;
  evidenceDate: string;
  keyFigures: string[];
  sourceUrl: string;
  message: string;
}

export async function createEvidenceFromUrlHandler(input: {
  url: string;
}): Promise<string> {
  // 1. Fetch the page content
  const response = await fetch(input.url, {
    headers: { 'User-Agent': 'GlassFortress/1.0 (legal evidence archiver)' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status}): ${input.url}`);
  }

  const html = await response.text();

  // 2. Strip HTML tags to get readable text (simple but effective for article bodies)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (text.length < 100) {
    throw new Error(`Fetched content too short to analyse (${text.length} chars). Is the URL publicly accessible?`);
  }

  // 3. Run IntakeAgent analysis
  const agent = getAgent();
  const analysis = await agent.analyzeText(text, input.url);

  // 4. Derive fileHash — same strategy as the confirm route for provenance consistency
  const hashInput = `${input.url}\n\n${text.slice(0, 40_000)}`;
  const fileHash =
    '0x' + crypto.createHash('sha256').update(hashInput, 'utf8').digest('hex');

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
      category: existing.category,
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
  const record = await prisma.evidence.create({
    data: {
      fileHash,
      status: 'PENDING_REVIEW',
      evidenceRole: analysis.evidenceRole,
      category: analysis.category,
      targetEntity: analysis.targetEntity,
      evidenceTier: analysis.evidenceTier,
      evidencePerspective: analysis.evidencePerspective ?? null,
      tierReasoning: analysis.tierReasoning ?? null,
      summary: analysis.summary,
      evidenceDate: analysis.evidenceDate,
      figures: { connect: analysis.keyFigures.map((name) => ({ name })) },
      medicalConditions: JSON.stringify(analysis.medicalConditions),
      statisticalClaims: JSON.stringify(analysis.statisticalClaims),
      regulatoryMentions: JSON.stringify(analysis.regulatoryMentions),
      euaOmissionStatus: analysis.euaOmissionStatus,
      sourceUrl: input.url,
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
    category: record.category,
    targetEntity: record.targetEntity,
    evidenceDate: record.evidenceDate,
    keyFigures: record.figures.map((f) => f.name),
    sourceUrl: input.url,
    message:
      'Evidence saved as PENDING_REVIEW. It will NOT appear in the public vault or be registered on-chain until a human reviewer promotes it via the UI.',
  };

  return JSON.stringify(result);
}
