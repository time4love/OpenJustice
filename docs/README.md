# docs/ — the index

**How to read this folder.** `CLAUDE.md` at the repo root first. Then the design that owns the
subject; then the plan that builds it. Findings are dated records, never edited, pointed at from the
plan's `STATUS:` lines. Everything before the four designs is a pre-design plan: nothing in one is a
required task by virtue of being listed — its open items are triaged in the dated findings doc named
below. This index carries pointers, never content; a test holds that every markdown file under `docs/`
is reachable from here and that everything in the archive says where its subject lives now.

## The four target designs — signed off, in dependency order

- [gf-interaction-flows.md](gf-interaction-flows.md) — the corpus: survey, walk, the stops for judgement, the marking page
- [gf-evidence-flows.md](gf-evidence-flows.md) — evidence: a promoted corpus record, its versions, the return path
- [gf-thesis-flows.md](gf-thesis-flows.md) — the thesis: framing, versions, arguments, the gate, the public page
- [gf-document-flows.md](gf-document-flows.md) — documents: the two doors, sealed intake, custody, citation

## Reasoning, as-built, and the route between them

- [gf-architecture-target.md](gf-architecture-target.md) — why the designs are shaped as they are; §9–§11 defer to the flows
- [gf-architecture-current.md](gf-architecture-current.md) — the code as it stands, 2026-09-02; the refactor's "from"
- [gf-refactor-plan.md](gf-refactor-plan.md) — corpus steps 0–10, evidence steps 11–16; the test rules in §4
- [gf-thesis-refactor-plan.md](gf-thesis-refactor-plan.md) — thesis steps 17–26; the document plan chains after it
- [gf-document-refactor-plan.md](gf-document-refactor-plan.md) — document steps 27–37, on clean ground; the seams to the three plans before it, and the switch
- [gf-factual-layer-rebuild-dev-plan.md](gf-factual-layer-rebuild-dev-plan.md) — the levels; `grep -n '^\*\*STATUS:'` is the level authority
- [gf-researcher-day.md](gf-researcher-day.md) — the flows read as one working day, tool by tool
- [gf-prosecutor-dev-plan.md](gf-prosecutor-dev-plan.md) — the Prosecutor design, re-read under thesis flows §10; deliberately not next

## Pre-design plans still in force — each carries a head note pointing at the triage

- [gf-mcp-oauth-dev-plan.md](gf-mcp-oauth-dev-plan.md) — OAuth 2.1, the live auth model; the authority on auth and on bootstrapping a researcher
- [gf-cost-exposure-dev-plan.md](gf-cost-exposure-dev-plan.md) — rate limiting, live; its route inventory is retired by the designs
- [gf-adverse-event-report-schema-dev-plan.md](gf-adverse-event-report-schema-dev-plan.md) — the public self-reports feature, live in production
- [gf-reporter-legal-pass.md](gf-reporter-legal-pass.md) — the reports feature's legal pass; two items still want counsel
- [gf-production-readiness-prerequisites.md](gf-production-readiness-prerequisites.md) — what still gates production; items closed by the triage say so
- [gf-trajectory-state-implementation.md](gf-trajectory-state-implementation.md) — why `ClaimTrajectory` is shaped as it is
- [gf-verification-tools-dev-plan.md](gf-verification-tools-dev-plan.md) — `verify_claim_text`, `audit_thesis_claims`, `check_publication_readiness`
- [gf-chat-tutorial-dev-plan.md](gf-chat-tutorial-dev-plan.md) — the in-chat tutorial, the approach that won; its chapter queue is in the triage

## User-facing guides

- [gf-chatgpt-mcp-connector-guide.md](gf-chatgpt-mcp-connector-guide.md) — connecting ChatGPT to the MCP server, in Hebrew

## Findings, by date — newest first, never edited

- [gf-walk-step-2-survey-verified-2026-09-05.md](gf-walk-step-2-survey-verified-2026-09-05.md) — refactor step 2 on staging: `held` equalled every page's snapshot count; the early cutover decided; one change owed to step 3
- [gf-pre-design-plans-triage-2026-09-04.md](gf-pre-design-plans-triage-2026-09-04.md) — every pre-design open item, one disposition each; six rulings
- [gf-era-detector-thresholds-2026-09-01.md](gf-era-detector-thresholds-2026-09-01.md) — Level 4: the two detectors measured, no threshold adopted
- [gf-level4-mcp-loop-verification-2026-09-01.md](gf-level4-mcp-loop-verification-2026-09-01.md) — Level 4: the MCP loop end to end, a signal that resets
- [gf-level4-third-marking-walk-2026-09-01.md](gf-level4-third-marking-walk-2026-09-01.md) — Level 4: the news page
- [gf-level4-first-marking-walk-2026-08-31.md](gf-level4-first-marking-walk-2026-08-31.md) — Level 4: the page used by a human for the first time
- [gf-level4-second-marking-walk-2026-08-31.md](gf-level4-second-marking-walk-2026-08-31.md) — Level 4: the filtering question
- [gf-anchor-verdict-incident-2026-08-30.md](gf-anchor-verdict-incident-2026-08-30.md) — 105 false verdicts on staging, from a correct fix; repaired
- [gf-candidate-source-measurement-2026-08-30.md](gf-candidate-source-measurement-2026-08-30.md) — Level 6: the free option survives; do not re-measure
- [gf-evidence-input-soundness-2026-08-30.md](gf-evidence-input-soundness-2026-08-30.md) — Levels 6, 9: the summary gate, built and measured
- [gf-level-diagnostics-2026-08-30.md](gf-level-diagnostics-2026-08-30.md) — Levels 7–10: 26 findings, breadth first
- [gf-positive-control-2026-08-30.md](gf-positive-control-2026-08-30.md) — Level 3 clause 1 executed for the first time
- [gf-published-thesis-fda-claim-2026-08-30.md](gf-published-thesis-fda-claim-2026-08-30.md) — Level 9: the published thesis carried a false claim
- [gf-cross-environment-write-postmortem-2026-08-29.md](gf-cross-environment-write-postmortem-2026-08-29.md) — production's database with staging's chain; why scripts run in-container only
- [gf-framing-assessor-defects.md](gf-framing-assessor-defects.md) — 2026-08-26: one stock phrase, three models; answered at thesis flows T1
- [gf-diff-truncation-dev-plan.md](gf-diff-truncation-dev-plan.md) — 2026-08-26: the chunking defect, root cause to repair on both environments
- [gf-staging-data-loss-postmortem-2026-08-21.md](gf-staging-data-loss-postmortem-2026-08-21.md) — the wipe; §5's mitigation predates the pre-deploy migration step

## Superseded — banner in place, kept because something current still cites it

- [gf-researcher-playbook.md](gf-researcher-playbook.md) — the staging transcript, steps 1–40; succeeded by the researcher's day; tests still read it as a fixture source
- [gf-blocked-url-recovery-dev-plan.md](gf-blocked-url-recovery-dev-plan.md) — succeeded by document flows §9
- [gf-trajectory-citation-dev-plan.md](gf-trajectory-citation-dev-plan.md) — succeeded by thesis flows T2
- [gf-thesis-publication-gate-dev-plan.md](gf-thesis-publication-gate-dev-plan.md) — succeeded by thesis flows T5
- [gf-thesis-walk-production-handoff.md](gf-thesis-walk-production-handoff.md) — succeeded by thesis refactor plan step 26
- [gf-production-thesis-replay-plan.md](gf-production-thesis-replay-plan.md) — succeeded by thesis refactor plan step 26
- [production-help-center-build.md](production-help-center-build.md) — succeeded by the in-chat tutorial
- [gf-pending-migration-diff-pair-is-two-captures.md](gf-pending-migration-diff-pair-is-two-captures.md) — succeeded by evidence A2's pair CHECK, ruled 2026-09-04; built at refactor step 11

## Elsewhere in this folder

- `archive/` — obsolete documents, moved with history; each opens with a banner naming where its subject lives now, or that it has none
- `integrity/` — the public integrity board, generated by `npm run integrity:board`; not markdown
