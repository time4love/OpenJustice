# The pre-design plans, triaged against the four target designs — 2026-09-04

A findings record, not a plan. Written in the docs-hygiene session that produced `docs/README.md`,
on the researcher's ruling of the same day.

**The principle.** Every document under `docs/` written before the four target designs
(`docs/gf-interaction-flows.md`, `docs/gf-evidence-flows.md`, `docs/gf-thesis-flows.md`,
`docs/gf-document-flows.md`) describes tasks that are **not required by virtue of being listed.**
Each open item in such a plan is a claim to be triaged, and every one below carries exactly one
disposition:

```
COVERED      a target design decided it — the section is named; the plan's item is closed by it
MISSED       no design touches it and it still matters — brought to the researcher as a question,
             never resolved here; the ruling, when it comes, is recorded beside the item
ORTHOGONAL   still live, and no design touches it because none should — OAuth, the reports feature,
             rate limiting; the plan that holds it stays the authority on it
DROPPED      no longer a task, with the reason
```

Every pre-design plan that stays in `docs/` carries a two-line head note pointing here. Nothing in
any of them is a required task because it is listed.

**Two decisions of the researcher's, recorded here and not done here:**

1. **The tutorial as web pages is deprecated.** It was an attempt to write how a researcher uses the
   platform while the steps were walked on production. The conclusion was to train the researcher in
   the chat, through a dedicated MCP tool guided by Claude; a proof of concept showed that superior.
   The thesis flows already ruled the consequence (A4: `start_tutorial` is "the tutorial's own
   change; its COMMON_RULES cite this document").
2. **The static help-centre pages are removed.** The platform has no users. The twelve pages under
   `/guide` (`apps/glass-fortress/frontend/src/lib/guide.ts`) and their images under
   `public/guide/` go; the public thesis page (thesis flows T5) is a design surface and stays. A
   frontend change, its own session.

---

## 1. `docs/gf-production-readiness-prerequisites.md` — items 2, 3, 6, 7, 9, 10

| item | disposition | where, or why |
|---|---|---|
| 2 · bootstrapping production needs production database credentials on a laptop | **MISSED** | No design names how the first researcher of an empty environment is approved. The plan proposes an email allowlist checked at registration and rejects first-registrant auto-approval. `CLAUDE.md` rules "prefer changing the deploy pipeline over acquiring the credential", which points at running `researcher:bootstrap` inside the deployment over `railway ssh` — the runner every other operational script already uses. **RULED 2026-09-04: the in-container run.** `researcher:bootstrap` over `railway ssh`, environment stated twice — the runner every operational script uses. No allowlist: a second auth branch for a one-time act. Recorded in `docs/gf-mcp-oauth-dev-plan.md`, which stays the authority on auth; this item closes by it |
| 3 · OAuth connector sessions expire mid-run | **ORTHOGONAL** | OAuth; the cheap authenticated write before a run is a working habit, not a design item |
| 6 · Supabase project refs committed in a public repo | **ORTHOGONAL** | A repository decision, already in the memory index's known-open list; no design touches it |
| 7 · stale docs that misdirect the next reader | **COVERED** | This session: `docs/README.md`, banners, the archive, the reachability test. The one remaining false instruction — `docs/gf-staging-data-loss-postmortem-2026-08-21.md` §5 says the deploy does not run migrations — is a FINDINGS doc and is never edited; the postmortem's index line says the pre-deploy step has since made §5's mitigation obsolete |
| 9 · a discovery miss returns 401, not 404 | **ORTHOGONAL** | OAuth; not confirmed as the cause of anything |
| 10 · each MCP client authorizes independently | **ORTHOGONAL** | OAuth; the rule it leaves ("an empty `OidcModel` is the definitive check") stands |

## 2. `docs/gf-pending-migration-diff-pair-is-two-captures.md` — is before ≠ after a CHECK anywhere?

Read against every appendix. **No.** Evidence A2 makes `(beforeSnapshotId, afterSnapshotId)` the
pair's whole identity with an `@@unique`, and the interaction flows A2 say the walk writes the pair
at acquisition; neither states that the two sides differ. The `Evidence` row's "exactly one of three
is set" is a CHECK "not a convention" (evidence A2) — so the appendix does use the instrument, and
does not use it here.

| item | disposition | where, or why |
|---|---|---|
| the constraint on the target schema | **MISSED** | **RULED 2026-09-04: yes.** Evidence A2's `UrlVersionDiff` gains `CHECK (beforeSnapshotId <> afterSnapshotId)`, one line, marked amended. Refactor step 11 builds it from the contract; no migration is written anywhere else |
| the one self-paired row on staging, and the cleanup session it would need | **DROPPED** | Step 9 rebuilds the corpus from the archive on an empty database; the legacy row is not migrated. The choice between the plan's two orders no longer exists |
| the code fix at both scan sites | **DROPPED** | Landed 2026-08-28 with the doc; the walk that replaces those sites (refactor steps 2–7) writes the pair from a real acquisition or not at all |

## 3. `docs/gf-cost-exposure-dev-plan.md` — Phase 2's provenance token against document flows §5

The plan audited routes; the designs retire most of them. Phase 1 (rate limiting) is live and stays.

| finding / phase | disposition | where, or why |
|---|---|---|
| #1 `/evidence/confirm` wallet drain · **Phase 2, the provenance token** | **COVERED** | Document flows §5: the public's door writes an arrival and nothing more, the ciphertext is sealed and the confirm/contact routes are retired with the `/submit` page; evidence §5: evidence is no longer registered on chain, so no request reaches the wallet. The token protected a route that no longer exists — **the Phase 2 task is closed by removal, not by building it** |
| #2 `/api/forensics/scan` unbounded loop · **Phase 3** | **COVERED** | Interaction flows: acquisition is `scan_captures` over MCP, gated, stopping at gates; the model is reached once, at Gate 5, and "its spend is why acquisition stops at all"; A6 makes the marking page's routes the only route surface |
| #3 whistleblower preview, 10 files per call, vision on each · #8 pinning caps · **Phase 4 (part)** | **COVERED** | Document flows A5 reshapes it into `POST /api/thesis/:id/intake`; the size cap, supported types and the rate limit on the receipt's one paid read are operational parameters (§12, flows A8), and that paid read is the only model call made on a stranger's act (§5) |
| #4 `/api/evidence/intake` LLM on any upload | **COVERED** | Document flows §5 retires it with the `/submit` page |
| #5 thesis routes each triggering an LLM call | **COVERED** | Thesis flows A5 retires `POST /draft`, `/:id/analyze`, `/:id/suggest-revision`, `/:id/foia-request` and the rest — research acts are MCP-only (prosecutor plan §10) |
| #6 `POST /api/chat`, `POST /api/arguments/generate` — public LLM calls · **Phase 4 (part)** | **MISSED** | Thesis flows A5 says outright: "`argumentRoutes` and `chatRoutes` are outside these flows". No design owns them. **RULED 2026-09-04: RETIRED.** "The chat is the workflow" is the researcher's chat through MCP; a public route that runs a model is a research act the browser performs, the class thesis flows §10.6 retired. The thesis refactor plan's step 25 removal list gains both names |
| #7 REST `suggest`/`draft` bypass the researcher gate · **Phase 5** | **COVERED** | `suggest_thesis` is retired (prosecutor plan §11.1); `POST /draft` is retired (thesis flows A5) |
| #9 MCP tools missing from `WRITE_TOOLS` | **DROPPED** | Fixed 2026-08-21, same day |
| Phase 1 open question · a global circuit breaker on spend | **ORTHOGONAL** | Rate limiting; decide on real traffic, as the plan says |
| Phase 1 open question · the rate-limit thresholds | **ORTHOGONAL** | Operational parameters (flows A8), not judgements |

## 4. `docs/gf-mcp-oauth-dev-plan.md`

| item | disposition | where, or why |
|---|---|---|
| Phase 5 · real-client verification beyond claude.ai (Claude Desktop, Claude Code, ChatGPT) | **ORTHOGONAL** | OAuth is the live auth model; no design touches it |
| Phase 5 · RFC 8707 resource-indicator audience restriction | **ORTHOGONAL** | Same |
| Phase 6 · legacy static token reframed as a service token; the connector guide recommends OAuth | **ORTHOGONAL** | Same; `docs/gf-chatgpt-mcp-connector-guide.md` is the doc it would touch |
| §10 · persisted JWKS/cookie keys, Railway rollout | **DROPPED** | `docs/gf-production-readiness-prerequisites.md` records the rotation done on both environments (PRs #86–#90) |

## 5. `docs/gf-adverse-event-report-schema-dev-plan.md` and `docs/gf-reporter-legal-pass.md`

| item | disposition | where, or why |
|---|---|---|
| external legal review of the public copy — gates ungating `/reports/patterns` | **ORTHOGONAL** | Compliance, "not a code task"; the reports feature is untouched by every design |
| the two counsel items of the legal pass §6: the manufacturer-breakdown framing; the consent + declaration pair for health data that can never be withdrawn | **ORTHOGONAL** | Same; `COMPLIANCE.md` points at the legal pass so they are found from the compliance side |
| excluding `UNDISCLOSED` vaccination-status rows from any directional claim | **ORTHOGONAL** | Feature-internal |
| Phase 7 · thesis citation wiring for aggregate reports | **MISSED** | Thesis flows T2 names three citation kinds — `#ev_`, `#tr_`, `#doc_` — and no kind for an aggregate. **RULED 2026-09-04: no fourth kind; Phase 7 is DROPPED.** A thesis cites records; an aggregate of self-reports has no record beneath it — the category error that retired `create_evidence_from_url`. The text may refer to the aggregate as context; the aggregate page stays its own public read |
| Phase 5 · abuse defence for the intake form | **ORTHOGONAL** | Deferred until volume shows a need, as the plan says |

## 6. `docs/gf-chat-tutorial-dev-plan.md` — the approach that won, and its pre-design queue

The plan stays CURRENT as the design record of the in-chat tutorial. Its curriculum was written
against the tools of August; **every chapter is rewritten against the flows** before it is served.
The queue, in the order the twelve guide pages had it, each mapped to the design that now owns it:

| # | guide page | the design that owns the chapter now |
|---|---|---|
| 1 | access | ORTHOGONAL — OAuth and the researcher account |
| 2 | connect | ORTHOGONAL — the connector |
| 3 | setup | ORTHOGONAL — the connector |
| 4 | evidence | evidence flows §1–§4: a promoted corpus record, not an upload |
| 5 | scan | interaction flows Flows 1–3: survey, walk, the stops for judgement |
| 6 | classification | interaction flows Gate 5; evidence flows §2 (content as a version) |
| 7 | trajectories | thesis flows T2 (`#tr_`); the rebuild plan's Level 6 |
| 8 | framing | thesis flows T1, §10 — framing under a provision; `docs/archive/chapter-02-*` was its first material |
| 9 | thesis | thesis flows §2, T2 — models write with the researcher, the researcher decides |
| 10 | citation | thesis flows T2 — three kinds, by name |
| 11 | critique | thesis flows T3 — the arguments, and the prosecutor plan |
| 12 | gate | thesis flows T5, A6 — the checks, as amended by document flows |

Open items of the plan itself:

| item | disposition | where, or why |
|---|---|---|
| Tier 1 chapters 2–12 as prompts; Tier 2 frozen fixture; Phase 5 progress state; Phase 6 the write chapter | **ORTHOGONAL** | The tutorial's own build order; rewritten against the flows per the queue above |
| Tier 3 · a fourth environment reset per learner | **DROPPED** | Deferred indefinitely by the plan, with the reason recorded there |
| §11 · "the existing guide becomes reference" | **DROPPED** | The static help centre is removed (decision 2 above) |
| §12 open questions 1–5 | **ORTHOGONAL** | The tutorial's own, decided at the phase each names |
| `docs/archive/chapter-01-*` and `chapter-02-*` (moved from `docs/tutorial/`) | **DROPPED** | Production-walk content under retired tools; archived, banner naming this plan and thesis flows A4 |

## 7. `docs/gf-trajectory-state-implementation.md` — §9 known holes

| item | disposition | where, or why |
|---|---|---|
| citation is open — no `CLAIM_TRAJECTORY` mention type | **COVERED** | Thesis flows T2: `#tr_<id>` cites a `ClaimTrajectory.id` by name |
| the trajectory endpoint is anonymous; a miss is an unbounded read | **MISSED** | `GET /tracked/:id/trajectories` (`forensicsRoutes.ts`) is named by no design: thesis flows A5 retires the thesis routes, interaction flows A6 covers the marking page's, and the public thesis page (T5) is the one public surface the designs name. **RULED 2026-09-04: survives**, under the corpus read's rule — PUBLIC iff PUBLIC_PAGE(page), identical for everyone, bounded to one page's trajectories; its shape belongs with the read-tool design evidence §10 names. Refactor plan step 12 (the reads) gains one line naming it |
| `MIN_CLAIM_LENGTH` caps containment matching; presence is page-wide | **COVERED** | The rebuild plan's Level 6 owns both, STATUS PARTIAL, route decided by measurement 2026-08-30 |
| independence is asserted, not computed | **COVERED** | Same, Level 6 |
| nothing detects a summary contradicting the text it describes | **COVERED** | Evidence flows §2, A6: content is a version whose survival is checked against the raw documents; `EVIDENCE_DIFF_INPUT_SOUND` measured 2026-08-30 |
| never run `prisma format` | **ORTHOGONAL** | A working rule; belongs with the migration rules in `CLAUDE.md`, which already forbid hand-applied migrations |

## 8. `docs/gf-verification-tools-dev-plan.md` — §8.8

| item | disposition | where, or why |
|---|---|---|
| not wired into the publication gate | **COVERED** | Thesis flows T5/A6: the gate is the checks' contract; `audit_thesis_claims` "is unchanged and reports only" |
| no REST route and no UI | **COVERED** | Thesis flows A5: research acts are MCP-only |
| `audit_thesis_claims` audits HEAD only; auditing a published pin is unbuilt | **COVERED** | Evidence A6 / thesis T5: after publication nothing re-runs; a published version is pinned to what it cited |

## 9. `docs/gf-prosecutor-dev-plan.md` — §11

| item | disposition | where, or why |
|---|---|---|
| which articles to enable beyond 1 and 10 | **COVERED** | The plan records it: answered 2026-09-03 by thesis flows §10 |
| the Prosecutor's build | **ORTHOGONAL** | Deliberately not next — value scales with corpus size (memory index); the design stands as re-read under thesis flows |

## 10. The SUPERSEDED plans — what each still listed as open

| plan | open item | disposition | where, or why |
|---|---|---|---|
| `gf-trajectory-citation-dev-plan` §8.4 | trajectories absent from the publication assessor's input | **COVERED** | Thesis flows T5: the publication assessor reads the rationale; the citation kinds are T2's |
| same | no live run against staging | **DROPPED** | `cite_trajectories` is retired (thesis flows A4) |
| same §9.3 | a TipTap → Markdown serializer | **DROPPED** | TipTap is no longer the record (thesis flows T2) |
| `gf-thesis-publication-gate-dev-plan` §8 | second-researcher approval, a strength gate, a cooling-off | **COVERED** | Thesis flows T5 names the gate's checks and nothing beyond them |
| same | thesis write routes other than publication still unauthenticated on REST | **COVERED** | Thesis flows A5 retires them |
| `gf-thesis-walk-production-handoff` | 4 staging evidence records out of sync with their diffs | **DROPPED** | Legacy state; the corpus is rebuilt (refactor plan step 9) and the thesis rewritten (thesis refactor plan step 26) |
| same | `MIN_CLAIM_LENGTH = 40` filters trajectory candidates | **COVERED** | Level 6, as in §7 above |
| same | run the walk on production under the old tools | **DROPPED** | Thesis refactor plan step 26: the thesis is rewritten on staging under the new tools, then production at SHIP |
| `gf-production-thesis-replay-plan` | where `publicInterestStatement` is set; whether production's corpus supports the same 8 movements; the seven-not-five correction owed to the session | **DROPPED** | Same — step 26 replaces the replay; the research session is removed (thesis flows §9) |
| `production-help-center-build` goal 1 | replay the staging thesis into production | **DROPPED** | Step 26 |
| same goal 2 | build the web help centre from the run | **DROPPED** | Decision 1 and 2 above |
| same §9 | FINDING 77 (absence rendered as dates, not durations) and FINDING 78 (unquotable trajectory labels), both unbuilt, n=1 | **MISSED** | Thesis flows T2 cites a trajectory by its detection-pass id and says nothing of how the critic's input renders one. **RULED 2026-09-04: carried as the critic prompt's own change** (thesis flows §13: a model actor's prompt is that actor's change, measured by its verdict rates), recorded on thesis refactor plan step 22 where the critic is built. Not a design item; not dropped |
| `gf-researcher-playbook` | a transcript; it lists no open task of its own | — | Superseded by `docs/gf-researcher-day.md`; kept in place while tests read it as a fixture source |
| `gf-blocked-url-recovery-dev-plan` | "only PR review/merge remains" | **DROPPED** | Merged in August; the feature is superseded by document flows §9, banner in place since 2026-09-04 |

---

## THE QUESTIONS — the six MISSED items, ruled 2026-09-04

Each ruling is recorded at its row above. What follows from them lands in the docs-hygiene PR's
pointers step, each line marked "2026-09-04, pre-design triage":

- `docs/gf-evidence-flows.md` A2 — `UrlVersionDiff` gains the pair CHECK (ruling 2)
- `docs/gf-evidence-flows.md` A4 — the trajectory read's rule beside the public reads (ruling 5)
- `docs/gf-refactor-plan.md` step 12 — the anonymous trajectory read, named (ruling 5)
- `docs/gf-thesis-refactor-plan.md` step 22 — FINDINGS 77 and 78 as the critic prompt's change (ruling 6)
- `docs/gf-thesis-refactor-plan.md` step 25 — `chatRoutes` and `argumentRoutes` on the removal list (ruling 3)
- `docs/gf-mcp-oauth-dev-plan.md` — the bootstrap ruling (ruling 1)
- `DEPLOYMENT.md` — found in this session to never mention staging; gains one line pointing at
  `CLAUDE.md`'s Branching & Deployment Protocol for the staging environment and its rules

Ruling 4 changes no document but this one: Phase 7 of the reports plan is DROPPED above.
