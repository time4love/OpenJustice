import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { IntakeAgent } from '../../services/IntakeAgent';
import { getResearcherId } from '../../context/researcherContext';
import { Web3Service } from '../../services/Web3Service';
import { buildEvidenceAnalysisData } from '../../lib/evidenceCreateData';
import { upsertKeyFigures } from '../../lib/upsertKeyFigures';
import { extractArticleText } from '../../lib/archiveText';
import {
  CAPTURE_EXTRACTOR_READABILITY,
  evidenceHashFromCapture,
} from '../../lib/evidenceCapture';

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
  // The exact text the hash is taken over, stored so the identity can be
  // recomputed from the database alone. Null on the PDF path: those bytes are
  // already stable across fetches, and a binary does not belong in a text
  // column — that record reads as "cannot be checked", never as a mismatch.
  let capturedText: string | null = null;
  const capturedAt = new Date();

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
    // 2b. HTML path — Readability's article, which is the SAME extraction the
    //     forensic scan path stores as UrlSnapshot.fullText.
    //
    //     It used to be a crude tag-strip, and that is FINDING 79: the strip kept
    //     page furniture, so a live view counter ("49552 צפיות") landed in the
    //     hashed text and three fetches seconds apart produced three different
    //     identities. Measured on that article: crude strip 20,442 chars and
    //     UNSTABLE; extractArticleText 12,984 chars and stable, counter absent.
    //
    //     Stability is not why this matters, though — `capturedText` below is.
    //     Readability drops that counter because it sits outside the article
    //     body on that page; a timestamp inside the body would defeat it. Only
    //     the stored text makes the identity checkable rather than merely
    //     reproducible-for-now.
    const html = await response.text();
    const text = extractArticleText(html, input.url);

    if (text.length < 100) {
      throw new Error(`Fetched content too short to analyse (${text.length} chars). Is the URL publicly accessible?`);
    }
    analysis = await agent.analyzeText(text, input.url);
    fileHash = evidenceHashFromCapture(input.url, text);
    capturedText = text;
  }

  // 5. Check for duplicate.
  //
  //    This check only ever worked for stable identities. Under the old crude
  //    strip it could not fire at all on a page with a counter, which is why the
  //    tool's documented "duplicate URLs return the existing record" was false
  //    (FINDING 79). It holds now because the hash holds.
  const existing = await prisma.evidence.findUnique({
    where: { fileHash },
    include: { capture: { select: { id: true } } },
  });
  if (existing) {
    // Backfill a capture for a record that predates them — but ONLY when this
    // text actually reproduces that record's hash. Storing a capture that does
    // not would turn a quiet "cannot be checked" into a loud false mismatch,
    // and a verifier that cries wolf is one nobody reads.
    if (existing.capture === null && capturedText !== null) {
      await prisma.evidenceCapture.create({
        data: {
          evidenceId: existing.id,
          sourceUrl: input.url,
          extractor: CAPTURE_EXTRACTOR_READABILITY,
          text: capturedText,
          capturedAt,
        },
      });
    }
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
  await upsertKeyFigures(analysis.keyFigures);

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
      // Written in the same statement as the record it explains. A capture
      // created separately could fail after the evidence row lands, leaving an
      // unverifiable record that looks exactly like one created before captures
      // existed — indistinguishable from the state this fix removes.
      ...(capturedText !== null
        ? {
            capture: {
              create: {
                sourceUrl: input.url,
                extractor: CAPTURE_EXTRACTOR_READABILITY,
                text: capturedText,
                capturedAt,
              },
            },
          }
        : {}),
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
