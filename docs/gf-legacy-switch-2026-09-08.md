# The legacy switch — three deletion PRs, one per layer, 2026-09-08

**A dated record, never edited.** What left the tree in evidence step 11a, why each thing left, and
what each layer's build step still owes. Every number below was read on the day, from the tree or
from a suite run; none is carried forward from a plan.

The decision is `docs/gf-refactor-plan.md` §3b, the note above step 11, widened the same evening to
three PRs — with the thesis half's note above step 17 of `docs/gf-thesis-refactor-plan.md` and the
document half's above step 36 of `docs/gf-document-refactor-plan.md`. The reasoning is
`docs/gf-architecture-target.md` §9; the contract is `docs/gf-evidence-flows.md`'s appendix, composed
with `docs/gf-interaction-flows.md` A1–A8 and amended by the document and thesis flows.

| PR | branch | merge | what left |
|---|---|---|---|
| #398 | `refactor/gf-11a-evidence-deletion` | `73a00b6` | the evidence layer |
| #399 | `refactor/gf-11a-thesis-deletion` | `b01619f` | the thesis layer |
| this one | `refactor/gf-11a-document-deletion` | — | the document layer, and this record |

---

## 1. WHY A SWITCH RATHER THAN A COEXISTENCE

The corpus track built BESIDE the old path for seven steps and then switched. The evidence track
cannot: step 11b's migration removes the columns the old path reads, so every reader must go before
the schema moves or the schema cannot move. The first sketch of step 11 tried to keep some readers
alive and produced a window that was neither the plan's step nor a working coexistence
(`handoffs/R32-chunk-1-sketch.md`, reviewed the same day).

Three facts made the switch cheap, and all three are properties of this moment rather than
principles:

- **The database was rebuilt at step 9** and holds no evidence row, no thesis, no document. The walk
  writes captures, versions and diffs and never an evidence row (architecture target §9.8), so there
  was nothing for a deletion to strand.
- **There are no users.** The gap between a door closing and its successor opening costs a calendar,
  not a person.
- **Each layer's schema drops stay with its build step** — 11b for `Evidence`'s columns, thesis 18
  for the session and TipTap columns, document 28 for `Whistleblower` and the provenance values — so
  every migration remains one file in the step that owns it, and none of these three PRs carries one.

## 2. WHAT LEFT, BY LAYER AND BY TAG

Tags: **[A4]** the layer's flows appendix A4, its retired block · **[T25]** thesis plan step 25's
removal list · **[T§5]** thesis plan §5, RETIRE or a REWRITE file's old version · **[D36]** document
plan step 36's removal list · **[D§5]** document plan §5, the RETIRE-AT-11 tag · **[RDC]** a module
that existed only to read the legacy columns evidence A2 removes.

### 11a-evidence (#398)

Ten MCP tools [A4]: `promote_scan_findings`, `create_evidence_from_url`, `promote_evidence`,
`search_evidence`, `delete_evidence`, the four debate tools, `get_forensic_timeline` and
`get_scan_findings`; plus `get_diff_input` and `check_on_chain_status`, which A4 KEEPS and step 12
rebuilds — the first is the tool the 2026-09-08 corrective pass was written about, and dropping it
was the whole point of pulling 11 forward. Nineteen services and nine operational scripts with their
npm entries, all [A4] or [RDC]. The `Evidence` writer inside `WaybackScraper` — `recordScanFinding`,
the classifier selecting evidence, retired by architecture target §9.9 and evidence §1. The evidence
chain write `registerEvidenceOnChain` [A4 §5], which is what makes "no research act reaches the
chain" a fact about the tree rather than a rule. `evidenceRoutes`' six public GETs, named one by one
in evidence A5.

**One split, not a deletion:** `auditDiffSurvival.ts` held both the retired instrument
`forensics:audit-survival` and a display view with four callers that outlive it. The view became
`services/diffSurvivalView.ts`; the audit engine went with its script.

### 11a-thesis (#399)

Eighteen MCP tools — A4's retired block in full, plus the REWRITE tools whose successors land at
thesis steps 19–23. Eighteen services, five route modules (`thesisRoutes`, `mentionRoutes`,
`figuresRoutes`, `chatRoutes`, `argumentRoutes`), two utils, two lib shapers. The frontend's 21 calls
into `/api/thesis` answer nothing until step 23's public reads, and NO frontend file was touched —
see §5b.

**One move, not a deletion:** `extractText` walked a TipTap document for `thesisClaimAudit`, which is
KEEP in two tables and rebased at 11b. It moved into its one surviving caller rather than keeping a
retired module alive for a single import.

### 11a-document (this PR)

The RETIRE-AT-11 set of document plan §5 [D§5] — `create_evidence_from_text`,
`recover_evidence_from_screenshot`, `persistScreenshotEvidence`, `intakeVersion` and their eight test
files. Step 36's code half [D36] — `evidenceRoutes` whole (its five remaining POSTs: `/intake`,
`/confirm`, `/recover-intake`, `/recover-confirm`, `/contact`), `IntakeAgent` and its prompt,
`EphemeralAnalysisService`, the contact cipher, `StorageService`. `VectorStoreService` with
`/confirm`, its last writer — #398 had already deleted its only reader. Seven lib shapers of the
retired evidence row whose last caller left here, and `entities:canonicalise` with
`lib/targetEntity.ts`.

## 3. THE NUMBERS, READ ON THE DAY

| | before 11a (`0ca8d72`) | after #398 | after #399 | after this PR |
|---|---|---|---|---|
| files under `src/` | 225 | 197 | 152 | 134 |
| files under `test/` | 189 | 168 | 145 | 130 |
| `no-unnecessary-condition` debt | 47 | 15 | 7 | CI's |
| `noUncheckedIndexedAccess` debt | 104 | 100 | 68 | CI's |
| repo lint-ratchet total | 350 | 262 | 146 | CI's |
| MCP tools registered | 49 | 39 | 15 | 13 |

**The debt fell by deletion, not by repair, and the three ratchets say so in the only way they can:
`IMPROVEMENT NOT LOCKED IN`.** Every falling entry across the three PRs named a file that had just
been deleted. The baselines were set from CI's numbers after each push, never from a laptop — the
local pass UNDER-reports type-aware rules SILENTLY, which cost a CI failure on PR #281 on a change of
exactly this shape (`memory/gf-lint-baseline-is-cis-not-the-laptops.md`).

The thirteen tools the surface still registers: the walk's five writes and three reads
(`survey_wayback_captures`, `scan_captures`, `approve_article_rules`, `resolve_scan_stop`,
`reset_article_calibration`, `get_article_rules`, `list_captures`, `get_rule_history`),
`get_environment`, and the four the designs keep unchanged — `audit_thesis_claims`,
`verify_claim_text`, `get_claim_trajectories`, `get_thesis_trajectory_citations`.

## 4. THE SCAN, AND WHY IT HAS THREE HALVES

`test/walk/retiredNames.test.ts` is the factual layer's step-0 scan, extended by each PR rather than
re-spelled (evidence A7). It now holds three properties, and none of the three implies another:

- **A retired TOOL is a name on the MCP surface.** A tool can be unregistered while its service still
  compiles.
- **A retired MODULE is an import**, matched by RESOLVING the specifier against the importing file's
  directory. This was a regex over the specifier requiring a `../` prefix until the reviewer planted
  a sibling import — `from './diffInput'` inside `src/services/` — which passed every case while
  naming exactly what the scan forbids. A service can be deleted while a description still names its
  tool.
- **A retired SCRIPT or ROUTE is a SENTENCE a live surface says to a person** — "run
  `npm run forensics:backfill-survival` to re-derive it", pointing at a command that no longer
  exists. Neither other half can see this: it is a string, not a name and not an import. Six were
  found this way across the three PRs, and each was fixed to say what answers instead rather than
  deleted.

Every half carries a decoy that is planted, observed to fail BY CASE NAME, and removed. One named
allow-list entry exists: `services/registryLedger.ts` may name a retired script, because its subject
is what PRODUCED the entries on a frozen registry and evidence §8 requires that explanation to be
complete. It is a file, not a pattern, and a second case fails if the file disappears — a rule that
tried to tell an imperative from a past tense would be a rule with a bypass in it.

## 5. TWO THINGS THE DELETION EXPOSED

Neither is a consequence of the design. Both were already true and invisible, and a large deletion is
what made them visible.

- **A mock dependency across describe blocks.** `test/mcpTools.test.ts`'s `createThesisDraftHandler`
  cases passed on a `mockResolvedValue` set by the `searchEvidenceHandler` group's `beforeEach`.
  Jest's `clearMocks` clears CALLS, not IMPLEMENTATIONS, so a value set in any earlier test stood for
  every later one. When that group went with its tool the handler received `undefined` and threw. The
  group was given its own mock, with the reason in a comment; the file went whole in #399 when every
  remaining group became a retired tool's.
- **The sibling-import gap in the scan**, above. It is recorded here because it is the shape the
  repository has paid for before under another name: a rule stated as a PROPERTY and implemented as
  an ENUMERATION, tested against the same enumeration.

## 5b. NO FRONTEND FILE WAS TOUCHED, AND THAT IS A RULING RATHER THAN AN OMISSION

The first drafts of all three notes ordered a frontend DARK change — the pages whose APIs leave,
hidden or unlinked — landed with the first deletion PR. **Ruled 2026-09-08, after #398 and #399 had
both landed without it:** the frontend waits for the backend migration. That change would have been
edited three times and then deleted, because every page it would hide gets its real replacement at a
named step: the corpus timeline at step 12, the public thesis page at thesis step 23, the intake
dialog at document step 32. So no frontend file is touched before step 12, each surface is rebuilt in
the step that gives it a contract, and the legacy pages leave in ONE cut-over at the end.

What it costs is nothing measured: staging has no users, the frontend's build and deploy are
untouched by backend deletions — both frontend deploys reported SKIPPED across these PRs —
production is consistent with itself at the old code, and SHIP was already gated behind thesis step
26. What it forbids is the mid-step "just fix that page". The ruling is recorded in the §3b note and
in both sibling plans' notes, amended the same day.

## 6. WHAT EACH LAYER'S BUILD STEP STILL OWES

- **Evidence 11b** — the migration (the drops are provably unread: the compiler said so in #398);
  the identity module as one importable symbol over A1's byte layout; `evidence-recomputable` and
  `evidence-no-prose`, each observed to FAIL first; the acceptance suite; and the REBASE of the
  modules the designs keep but that still read the legacy columns — `thesisClaimAudit`,
  `evidenceInputSoundness`, `auditOnChainAnchors`, `onChainVerification`, `registryState`, and the
  trajectory detector `claimTrajectory` onto CURRENT(diff)'s chunks. Two of their tests are KEEP in
  two tables at once and become REWRITE there; the contract they held moved by the ruling of
  2026-09-03, a day after the tags were written. The `EvidenceEmbedding` model, the
  `evidence_embeddings` table and `match_evidence()` are named line by line in that migration.
- **Thesis 18 onward** — the schema drops (`ResearchSession`, `KeyFigure`, `ThesisGapResolution`, the
  TipTap and status columns) on a database that holds nothing they describe; then framing (19), the
  version write (20), the critic (22), the gate (23), the reviews list (24).
- **Document 28 onward** — `Whistleblower` and `CaptureProvenance`'s `DIRECT`/`ASSERTED`;
  `directProvenanceUnused` stays until then, holding that `DIRECT` has no writer. The public intake
  door is DOWN from this PR until the dialog lands after step 32: its routes are gone from the
  backend and the page answers nothing, on staging, where nobody knocks.

## 7. WHAT THIS RECORD DOES NOT CLAIM

That the suite passing means the layers work. Nothing in the target evidence, thesis or document path
exists yet; what these three PRs establish is that nothing in the tree still reads what 11b removes,
and the compiler is the witness. Only a staging exercise says a researcher can use what replaces it,
and each build step owes its own.
