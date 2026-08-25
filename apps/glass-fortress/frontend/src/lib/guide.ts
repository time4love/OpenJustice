/**
 * The help-centre manifest.
 *
 * Structure lives here; prose lives in `messages/{he,en}.json` under the
 * `guide` namespace. The split matters: a phase's ORDER, its tool list and
 * whether it has been verified are facts about the system, identical in every
 * locale, and must never be forkable by a translator.
 *
 * Every message key these pages render is DERIVED from the ids below
 * (`guide.phases.<slug>.steps.<stepId>.title`), which is exactly the kind of
 * key nobody reads while editing and that renders as its own name when it is
 * missing. So the ids are not free strings: they are typed against the message
 * files themselves, and the two locales are locked to the same shape. A slug or
 * step id with no translation behind it is a type error, not a Hebrew page
 * displaying `guide.phases.scan.steps.addUrl.title` to the public.
 */

/** Type-only imports — the JSON never reaches the bundle. */
type HeMessages = (typeof import('../../messages/he.json'));
type EnMessages = (typeof import('../../messages/en.json'));

type Assert<T extends true> = T;

/**
 * Neither locale may hold a key the other lacks — in ANY namespace, not just
 * this one. Mutual assignability over the two JSON module types compares key
 * shape (every leaf is `string`), so this is a whole-file structural equality
 * check that costs nothing at runtime.
 */
export type LocaleShapesMatch = Assert<
  HeMessages extends EnMessages ? (EnMessages extends HeMessages ? true : false) : false
>;

type PhaseMessages = HeMessages['guide']['phases'];

/** Slugs are whatever the messages define — they cannot be invented here. */
export type GuideSlug = keyof PhaseMessages & string;

type StepIdOf<S extends GuideSlug> = keyof PhaseMessages[S]['steps'] & string;

/**
 * A screenshot id is its file basename under `public/guide/`, and it must have a
 * caption. Phases with no screenshots have `screenshots: {}` in the messages, so
 * `keyof` is `never` and the only list the type admits is an empty one — an
 * image cannot be listed without someone having written what it shows.
 */
type ScreenshotIdOf<S extends GuideSlug> = keyof PhaseMessages[S]['screenshots'] & string;

/**
 * A prompt id under this phase's `prompts` key, if the phase has one.
 *
 * Not every phase carries prompts — most have none, and forcing `"prompts": {}`
 * into every phase just to satisfy the type would add twenty-odd empty objects
 * that exist only for the compiler. A conditional type lets phases without the
 * key resolve to `never`, which makes `examplePrompts: []` the only valid list.
 */
type PromptIdOf<S extends GuideSlug> =
  'prompts' extends keyof PhaseMessages[S]
    ? keyof PhaseMessages[S]['prompts'] & string
    : never;

/**
 * The arcs a page groups into. `prepare` holds the PREREQUISITES — an approved
 * account and a connected client — which are not phases: they happen once,
 * before any data is touched, and numbering them would renumber the nine that
 * `docs/production-help-center-build.md` §7 names.
 */
export type GuideArc = 'prepare' | 'collect' | 'measure' | 'argue';

export const GUIDE_ARC_ACCENT: Record<GuideArc, string> = {
  prepare: '#64748b',
  collect: '#3b82f6',
  measure: '#8b5cf6',
  argue: '#10b981',
};

/**
 * A page is `verified` only once a LATER phase has actually depended on it.
 *
 * Derived from `verifiedBy` rather than stored as its own field, so the status
 * can never disagree with the dependency it claims to rest on. In the staging
 * run several steps were proved wrong only at the following step — a page
 * marked correct at the moment of writing would have taught the wrong thing.
 */
export type GuideStatus = 'draft' | 'verified';

interface GuidePhaseFields {
  /**
   * Phase number in `docs/production-help-center-build.md` §7, or `null` for a
   * prerequisite — a page that is genuinely not one of the nine.
   */
  phase: number | null;
  arc: GuideArc;
  /** MCP tools this phase drives, in the order a researcher calls them. */
  tools: readonly string[];
  /**
   * The later phase that leaned on this one and was not proved wrong by doing
   * so. `null` until that has actually happened.
   */
  verifiedBy: GuideSlug | null;
  /**
   * Whether the production replay has filled in this page's worked example.
   * Distinct from `verifiedBy`: a page can be fully written and honest with no
   * production run behind it yet, and saying so is better than implying one.
   */
  hasProductionExample: boolean;
  /** True where the phase performs an irreversible act (on-chain, or public). */
  irreversible: boolean;
  /**
   * True where the page involves choosing between environments.
   *
   * Flagged visually because attaching to the wrong database is the one failure
   * in this system with no recovery path, and it happens at exactly two points:
   * when the connectors are set up, and when the first write is about to run.
   */
  environmentCritical: boolean;
}

type GuidePhaseFor<S extends GuideSlug> = GuidePhaseFields & {
  slug: S;
  /** Step ids, in render order. Each must exist under THIS slug's messages. */
  steps: readonly StepIdOf<S>[];
  /**
   * Screenshots, in render order. `id` is the file basename under
   * `public/guide/` and must have a caption in THIS slug's messages.
   *
   * Allowed only for interfaces, never for content: see Rule C in
   * `docs/gf-help-centre-redaction-policy.md`. Listing one here is the
   * declaration that it was reviewed as a permanent public artifact, which is
   * what committing it to this repository makes it.
   *
   * The intrinsic dimensions are recorded rather than measured at runtime, so
   * the page reserves the right box before the image loads and a reader is not
   * shown text that then jumps.
   */
  screenshots: readonly { id: ScreenshotIdOf<S>; width: number; height: number }[];
  /**
   * Steps that carry a collapsed "how this works underneath" block.
   *
   * The step BODY stays at flow level — what a researcher does. Implementation
   * depth goes in the collapsed block, so it never competes with the step it
   * explains. A page where every mechanism is stated inline reads as a spec, and
   * the flow it is supposed to teach disappears into it.
   */
  detailSteps: readonly StepIdOf<S>[];
  /**
   * Copyable tool calls a researcher can paste into their MCP chat.
   *
   * Each id must have a matching `prompts.<id>.{command, note}` in the messages.
   * The command is the copyable text; the note explains what happens. Phases
   * without prompts just have an empty array — the conditional `PromptIdOf` type
   * makes `never[]` the only valid value, so a prompt cannot be listed without
   * someone having written its text.
   */
  examplePrompts: readonly PromptIdOf<S>[];
};

export type GuidePhase = { [S in GuideSlug]: GuidePhaseFor<S> }[GuideSlug];

export const GUIDE_PHASES: readonly GuidePhase[] = [
  {
    slug: 'access',
    phase: null,
    arc: 'prepare',
    tools: [],
    steps: ['signIn', 'chooseHandle', 'awaitApproval', 'bootstrapFirst'],
    // `connect` depended on this and proved it: the OAuth flow resolves an
    // account only for an APPROVED researcher, so an authorisation granted
    // before approval carried no write access.
    verifiedBy: 'connect',
    hasProductionExample: true,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'connect',
    phase: null,
    arc: 'prepare',
    tools: [],
    steps: ['addServer', 'fixAuthType', 'authorize', 'nameEnvironments'],
    // `setup` depended on this: the environment was identified through the
    // connector this page describes.
    verifiedBy: 'setup',
    hasProductionExample: true,
    // Dimensions are the files' real intrinsic sizes, so the page reserves the
    // right box before the image loads rather than reflowing the text under it.
    screenshots: [
      { id: 'prereq-add-custom-connector-1', width: 1270, height: 1068 },
      { id: 'prereq-add-custom-connector-2', width: 1280, height: 1798 },
      { id: 'prereq-allow-access', width: 752, height: 452 },
    ],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: true,
    irreversible: false,
  },
  {
    slug: 'setup',
    phase: 0,
    arc: 'collect',
    tools: ['search_evidence', 'check_on_chain_status', 'create_research_session'],
    steps: ['verifyEnvironment', 'openSession', 'proveWritePath', 'recordAsYouGo'],
    // `evidence` depended on this: the first record was written only after the
    // environment had been identified three independent ways.
    verifiedBy: 'evidence',
    hasProductionExample: true,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: true,
    irreversible: false,
  },
  {
    slug: 'evidence',
    phase: 1,
    arc: 'collect',
    tools: [
      'create_evidence_from_url',
      'promote_from_diff_debate',
      'promote_scan_findings',
      'delete_evidence',
      'check_on_chain_status',
      'promote_evidence',
    ],
    // create -> review -> (reject) -> promote, in that order. The page used to
    // open at preCheck, which assumed a record already existed and was already
    // sound — skipping the human review that is the entire reason PENDING_REVIEW
    // exists, and never mentioning how a record is created in the first place.
    steps: ['create', 'review', 'reviewClassification', 'reject', 'preCheck', 'promote', 'verify'],
    verifiedBy: null,
    hasProductionExample: true,
    // Captured from the real production pages after the first record was
    // anchored — not mock-ups, and not staging. Rule C allows an interface;
    // these are public pages showing a record the review approved.
    //
    // Cropped to the content: no browser chrome, no site navigation, no chat
    // widget. A screenshot of a whole window makes the reader hunt for the part
    // that matters, and dates faster — the surrounding furniture changes far
    // more often than the panel being illustrated.
    screenshots: [
      { id: 'evidence-vault-public', width: 1252, height: 460 },
      { id: 'evidence-record-anchored', width: 776, height: 682 },
    ],
    // The classification mechanics — how a tier is decided, why the figures list
    // is the sharpest legal exposure, what the rules-version stamp is for — are
    // implementation depth. They belong behind a fold, not in the flow.
    detailSteps: ['review', 'reviewClassification', 'verify'],
    examplePrompts: ['seeVault', 'checkAnchor', 'promoteRecord'],
    environmentCritical: false,
    irreversible: true,
  },
  {
    slug: 'scan',
    phase: 2,
    arc: 'collect',
    tools: ['start_forensic_scan', 'get_scan_findings', 'list_captures'],
    steps: ['addUrl', 'runScan', 'readFindings', 'listCaptures'],
    verifiedBy: null,
    hasProductionExample: true,
    // Captured logged OUT, from the real production page after a full scan.
    // Being signed out is not incidental: the redaction policy bars account
    // identity from any published image, and a logged-out capture satisfies
    // that by construction rather than by someone remembering to crop.
    //
    // Both frames are interface and deterministic facts — a URL, a status, a
    // count, a date. The diff cards themselves are never photographed: they
    // carry a classifier's assertions about named people, which the policy bars
    // from images and from quotation alike.
    screenshots: [
      { id: 'scan-start', width: 1720, height: 388 },
      { id: 'scan-tracked-url', width: 1720, height: 240 },
    ],
    // How the archive's capture count relates to the stored one is mechanism,
    // not flow. A researcher needs it to read the verification, but it must not
    // sit in front of the four steps it explains.
    detailSteps: ['listCaptures'],
    examplePrompts: [],
    environmentCritical: false,
    // Every capture the scan stores has its content hash anchored on the public
    // chain automatically, so this phase spends one permanent transaction per
    // capture — far more than `evidence`, which spends one. This flag was false
    // because the phase promotes nothing, which is a statement about Evidence
    // and not about the chain. The two questions are separate and only one of
    // them is what this flag asks.
    irreversible: true,
  },
  {
    slug: 'classification',
    phase: 3,
    arc: 'collect',
    tools: ['get_scan_findings', 'open_diff_debate', 'respond_in_diff_debate', 'get_diff_debate'],
    steps: ['readDiffs', 'openDebate', 'respond', 'closeDebate'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'trajectories',
    phase: 4,
    arc: 'measure',
    tools: ['get_claim_trajectories'],
    steps: ['compute', 'readGroups', 'flipThreshold', 'storedState'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'framing',
    phase: 5,
    arc: 'measure',
    tools: ['open_thesis_framing', 'assess_thesis_framing', 'get_thesis_framing'],
    steps: ['open', 'assess', 'revise', 'record'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'thesis',
    phase: 6,
    arc: 'measure',
    tools: ['suggest_thesis', 'create_thesis_draft', 'get_thesis_context', 'add_thesis_version'],
    steps: ['suggest', 'draft', 'context', 'version'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'citation',
    phase: 7,
    arc: 'argue',
    tools: [
      'verify_claim_text',
      'cite_trajectories',
      'get_thesis_trajectory_citations',
      'audit_thesis_claims',
    ],
    steps: ['verifyText', 'cite', 'readCitations', 'audit'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'critique',
    phase: 8,
    arc: 'argue',
    tools: ['run_ai_analysis', 'get_research_agenda'],
    steps: ['run', 'readVerdict', 'staleness', 'agenda'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: false,
  },
  {
    slug: 'gate',
    phase: 9,
    arc: 'argue',
    tools: ['check_publication_readiness'],
    steps: ['check', 'hardChecks', 'rationale', 'stop'],
    verifiedBy: null,
    hasProductionExample: false,
    screenshots: [],
    detailSteps: [],
    examplePrompts: [],
    environmentCritical: false,
    irreversible: true,
  },
];

export function guideStatus(phase: GuidePhase): GuideStatus {
  return phase.verifiedBy === null ? 'draft' : 'verified';
}

export function findGuidePhase(slug: string): GuidePhase | undefined {
  return GUIDE_PHASES.find((p) => p.slug === slug);
}

/** Previous and next phase in reading order, for the page footer. */
export function guideNeighbours(slug: GuideSlug): {
  previous: GuidePhase | null;
  next: GuidePhase | null;
} {
  const index = GUIDE_PHASES.findIndex((p) => p.slug === slug);
  return {
    previous: index > 0 ? (GUIDE_PHASES[index - 1] ?? null) : null,
    next: index < GUIDE_PHASES.length - 1 ? (GUIDE_PHASES[index + 1] ?? null) : null,
  };
}

export interface GuideScreenshot {
  /** File basename under `public/guide/`. */
  id: string;
  width: number;
  height: number;
}

/**
 * Screenshots as the renderer needs them.
 *
 * The per-slug `id` type exists to stop the MANIFEST naming an image with no
 * caption; it is not something JSX needs to carry. Until a page declares its
 * first screenshot that type is `never`, which is correct and also unusable at
 * a call site — so the widening happens here, once, rather than as a cast in
 * every component that renders one.
 */
export function guideScreenshots(phase: GuidePhase): readonly GuideScreenshot[] {
  return phase.screenshots;
}

/**
 * Example prompts as the renderer needs them — widened from the per-slug union
 * to plain strings, same reason as `guideScreenshots`.
 */
export function guideExamplePrompts(phase: GuidePhase): readonly string[] {
  return phase.examplePrompts;
}

/** Pages that are prerequisites rather than one of the nine numbered phases. */
export function isPrerequisite(phase: GuidePhase): boolean {
  return phase.phase === null;
}

/** How many pages have been verified — the help centre's own maturity. */
export function guideMaturity(): { verified: number; total: number } {
  return {
    verified: GUIDE_PHASES.filter((p) => guideStatus(p) === 'verified').length,
    total: GUIDE_PHASES.length,
  };
}
