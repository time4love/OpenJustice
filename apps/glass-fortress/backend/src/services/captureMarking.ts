import { prisma } from '../lib/prisma';
import { captureHtml } from '../lib/captureDocument';
import {
  chromeRemovalFraction,
  deriveTextUnderRuleset,
  documentOutline,
  inertDocument,
  type OutlineNode,
} from '../lib/chromeRulesetApply';

// ---------------------------------------------------------------------------
// LEVEL 4 — one capture, rendered for a human and derived under draft rules.
//
// SEPARATE FROM `calibrationRun.ts` ON PURPOSE, and it is the same boundary step
// 1 drew: this module needs a real HTML parser, and jsdom's dependency chain is
// ESM-only, so anything importing it cannot be reached from a `unit` suite. The
// calibration service stays parser-free so the run can be read, appended to and
// committed without one; only the two operations that genuinely look at a
// document live here.
//
// NOTHING HERE WRITES A CAPTURE. It reads stored bytes and derives from them.
// The document is already held — this is a VIEW over it, which is what makes a
// wrong mark a wrong view rather than lost data.
// ---------------------------------------------------------------------------

export interface CaptureForMarking {
  snapshotId: string;
  capturedAt: Date;
  waybackTimestamp: string | null;
  snapshotUrl: string;
  /**
   * The document with scripts and event handlers removed, for rendering.
   *
   * TO BE RENDERED IN A SANDBOXED FRAME AND NOWHERE ELSE. `sandbox=""` is what
   * actually stops an archived page's code running in the researcher's
   * authenticated origin; this is the second layer, not the first.
   */
  html: string;
  outline: OutlineNode;
  /** True when the outline was cut short by depth or node count. */
  outlineTruncated: boolean;
  /**
   * Characters the researcher cannot reach because the outline was cut there.
   *
   * `outlineTruncated` alone is what the MOH page reported while putting 76% of
   * itself out of reach. A bare boolean cannot tell a cut that lost a footnote
   * from one that lost the article.
   */
  outlineUnreachableTextLength: number;
}

export interface CapturePreview {
  snapshotId: string;
  /** What survives the rules — the text the pipeline would consume. */
  keptText: string;
  /**
   * What the rules removed.
   *
   * THE HALF THAT MAKES THE PAGE HONEST, and the plan calls it non-optional:
   * over-matching is the dangerous direction and it is INVISIBLE in the kept
   * text — a rule that swallows a paragraph leaves something clean, short and
   * plausible on screen. Anything rendering a capture for marking shows this
   * beside it.
   */
  removedText: string;
  matchCounts: Readonly<Record<string, number>>;
  /** Selectors the parser rejected — a typo, not a rule that matched nothing. */
  invalidSelectors: readonly string[];
  removalFraction: number;
  derivedTextLength: number;
}

async function loadBytes(snapshotId: string) {
  const snapshot = await prisma.urlSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      trackedUrlId: true,
      capturedAt: true,
      waybackTimestamp: true,
      snapshotUrl: true,
      document: true,
      documentContentType: true,
      documentContentEncoding: true,
    },
  });
  if (!snapshot) throw new Error(`Capture ${snapshotId} not found.`);
  return snapshot;
}

/** One capture, ready to look at. */
export async function loadCaptureForMarking(snapshotId: string): Promise<CaptureForMarking> {
  const snapshot = await loadBytes(snapshotId);
  const html = captureHtml({
    document: snapshot.document,
    documentContentType: snapshot.documentContentType,
    documentContentEncoding: snapshot.documentContentEncoding,
  });
  const outline = documentOutline(html);
  return {
    snapshotId: snapshot.id,
    capturedAt: snapshot.capturedAt,
    waybackTimestamp: snapshot.waybackTimestamp,
    snapshotUrl: snapshot.snapshotUrl,
    html: inertDocument(html),
    outline: outline.root,
    outlineTruncated: outline.truncated,
    outlineUnreachableTextLength: outline.unreachableTextLength,
  };
}

/**
 * What a draft ruleset would do to one capture. PURE — it writes nothing.
 *
 * Called on every edit while the researcher is choosing selectors, so it must
 * not leave a row behind per keystroke. The observation is recorded once, when a
 * capture is actually SHOWN, by the function below.
 */
export async function previewUnderSelectors(
  snapshotId: string,
  selectors: readonly string[],
): Promise<CapturePreview> {
  const snapshot = await loadBytes(snapshotId);
  const derived = deriveTextUnderRuleset(
    snapshot.document,
    snapshot.documentContentType,
    snapshot.documentContentEncoding,
    { selectors },
  );
  return {
    snapshotId,
    keptText: derived.text,
    removedText: derived.chrome.removedText,
    matchCounts: derived.chrome.matchCounts,
    invalidSelectors: derived.chrome.invalidSelectors,
    removalFraction: chromeRemovalFraction(derived),
    derivedTextLength: derived.text.length,
  };
}

/**
 * Record what one ruleset did to one capture, computed HERE.
 *
 * THE NUMBER IS THE BACKEND'S, NEVER THE BROWSER'S. The page has just displayed
 * a preview and could simply post the figures back, which would be one round
 * trip cheaper and would make the stored deviation baseline something a client
 * asserts. Deriving again server-side costs one parse per capture a human
 * actually looks at — tens per run — and keeps every stored observation
 * computed by the same code that will compute the scan's.
 */
export async function recordObservationForCapture(input: {
  articleRulesetId: string;
  snapshotId: string;
  selectors: readonly string[];
}): Promise<{ observationId: string; preview: CapturePreview }> {
  const preview = await previewUnderSelectors(input.snapshotId, input.selectors);
  const observation = await prisma.rulesetObservation.upsert({
    where: {
      articleRulesetId_snapshotId: {
        articleRulesetId: input.articleRulesetId,
        snapshotId: input.snapshotId,
      },
    },
    update: {
      matchCounts: preview.matchCounts,
      removalFraction: preview.removalFraction,
      derivedTextLength: preview.derivedTextLength,
      observedAt: new Date(),
    },
    create: {
      articleRulesetId: input.articleRulesetId,
      snapshotId: input.snapshotId,
      matchCounts: preview.matchCounts,
      removalFraction: preview.removalFraction,
      derivedTextLength: preview.derivedTextLength,
    },
    select: { id: true },
  });
  return { observationId: observation.id, preview };
}
