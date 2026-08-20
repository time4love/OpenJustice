# GF Staging Evidence Integrity — Clean Replay + Fixture Suite — Dev Plan

**Status:** Design/diagnosis complete 2026-08-20. **Not started — deliberately deferred to a new, clean
session**, per explicit user instruction. Nothing destructive has been done; all findings below come from
read-only queries.
**Scope:** Glass Fortress **staging only** — never production. Builds on
[gf-evidence-integrity-dev-plan.md](gf-evidence-integrity-dev-plan.md) (the 2026-08-18 fix that this
plan's findings are downstream of) and [staging-environment-dev-plan.md](staging-environment-dev-plan.md).

---

## 0. Why this exists

A 2026-08-20 DB/chain integrity audit (prompted by a user question, see
[gf-db-chain-integrity-audit-2026-08-20.md](/Users/jonathand/.claude/projects/-Users-jonathand-OpenJustice/memory/gf-db-chain-integrity-audit-2026-08-20.md))
found 6 of staging's 7 `Evidence` rows marked `CONFIRMED` with no `onChainTxHash` recorded. The user
correctly identified the likely cause — evidence created while staging's blockchain config wasn't
correctly pointed at a real testnet — and this session confirmed it precisely, with the real Sepolia RPC
URL the user provided (`https://sepolia.base.org`, chainId 84532) and a full per-record on-chain audit
against the real deployed contract (address recovered from a real transaction receipt, not guessed:
`0x65b9a7acb45Aa05e7Ed207844F93a2b308373853`).

**This also revealed the local checked-out `.env` was stale/wrong for blockchain config specifically** —
it had `RPC_URL` pointed at Base **mainnet** (chainId 8453) and a placeholder
`EVIDENCE_REGISTRY_ADDRESS` (`0x5FbDB2315678afecb367f032d93F642f64180aa3`, the generic Hardhat local-node
default address) with no deployed code at all. **Fixed same session** — both `.env` and `.env.staging`
now carry the real, verified values (§2).

**Root cause chronology, fully resolved — see [[gf-staging-testnet-chain]]:** staging's blockchain vars
were originally unset by design (`.env.staging`'s own comment used to say so). On 2026-08-16 the user
deliberately overrode that — their own call — deploying `EvidenceRegistry` to Base Sepolia
(`0x65b9a7acb45Aa05e7Ed207844F93a2b308373853`) specifically so staging could exercise the real on-chain
path end-to-end. The `rtmag.co.il` evidence in §1 below is literally that decision's own verification
test — it registered successfully that day. The 5 genuinely-fake `FORENSIC_DIFF` records were created
~08:05 on 2026-08-18 — chain infra was live and working by then (had been since 08-16), but the
*pre-`f9102b5`* auto-promote code never called `registerEvidenceHash` for them at all and marked them
`CONFIRMED` anyway. `f9102b5` merged 14:11 that day; the one fully-correct record was created 19 minutes
after. **This confirms the plan below is still the right call** — asked and re-confirmed with the user
after this fuller picture emerged: the 5 fake records are real, present-tense wrong data sitting in a
shared DB regardless of how well-understood the historical cause now is.

---

## 1. Definitive findings (all read-only, verified against the real Sepolia contract)

| Evidence ID | Type | Source | DB status | DB `onChainTxHash` | Real chain state | Created (UTC) |
|---|---|---|---|---|---|---|
| `601e045a` | DOCUMENT | rtmag.co.il article | CONFIRMED | `null` | **registered: true** (evidenceId 0) — DB just never recorded the tx hash | 2026-08-16 17:10 |
| `46c3463e` | FORENSIC_DIFF | corona.health.gov.il diff 05-25 | CONFIRMED | `null` | **NOT registered** | 2026-08-18 05:05 |
| `9083cf4e` | FORENSIC_DIFF | corona.health.gov.il diff 05-29 | CONFIRMED | `null` | **NOT registered** | 2026-08-18 05:06 |
| `62030645` | FORENSIC_DIFF | corona.health.gov.il diff 05-30 | CONFIRMED | `null` | **NOT registered** | 2026-08-18 05:06 |
| `13ecb15e` | FORENSIC_DIFF | corona.health.gov.il diff 08-05 | CONFIRMED | `null` | **NOT registered** | 2026-08-18 05:07 |
| `14f659fd` | FORENSIC_DIFF | corona.health.gov.il diff 09-06 | CONFIRMED | `null` | **NOT registered** | 2026-08-18 05:08 |
| `86d76c48` | FORENSIC_DIFF | corona.health.gov.il diff 01-05-2022 | CONFIRMED | `0xc69dcc47...` | **registered: true**, tx verified (status 1, real contract, 1 log) | 2026-08-18 11:30 |

**Timeline resolves the "is this a live bug" question:** `f9102b5` ("make `Evidence.status=CONFIRMED`
always backed by real on-chain proof") merged **2026-08-18 14:11 +0300**. The 5 genuinely-fake records
were created **~08:05 +0300** that day — before the fix. `86d76c48` was created **14:30 +0300** — 19
minutes after. **This is legacy data from before the fix, not an active gap in current code.** No urgent
code change is implied by this finding alone (though §3 below still says: re-verify, don't just assume).

**Current exact staging inventory** (everything in scope for cleanup, captured before any deletion so the
replay can reproduce it faithfully):
- 1 `TrackedUrl`: `https://corona.health.gov.il/vaccine-for-covid/`, status `COMPLETED`, **81 diffs / 83
  snapshots**.
- 7 `Evidence` rows: 1 `DOCUMENT` (rtmag.co.il, Tier 1) + 6 `FORENSIC_DIFF` (all from the TrackedUrl
  above, Tier 2).
- 1 `Thesis`: "הסתרת דיווחי בטיחות ותופעות לוואי מתמשכות על ידי משרד הבריאות והפרת חובת הגילוי והסכמה
  מדעת" — id `cmsyrk73800023f8cunfp4r4w`, 2 versions, head status `COMPLETE`.
- 4 `KeyFigure` rows (regenerate automatically on replay, no need to preserve specific IDs).
- 3 `Researcher` accounts (`claude-mcp-seed`, `בבי`, `יהונתן`) — **must be preserved, never wiped.**

---

## 2. Immediate, independent fix (can happen anytime, doesn't need a fresh session)

Update the local `.env`'s blockchain block to match Railway's real staging values:
```
RPC_URL=https://sepolia.base.org
EVIDENCE_REGISTRY_ADDRESS=0x65b9a7acb45Aa05e7Ed207844F93a2b308373853
```
(`REGISTRAR_PRIVATE_KEY` — confirm against Railway too; not verified this session, only inferred correct
by the tx receipt using whatever key actually signed it.) This alone would have prevented the confusing
`BAD_DATA` errors from the earlier audit attempt. Low-risk, no data touched, just a local dev config
correction.

---

## 3. Plan for the new session

### Step 1 — Re-verify the invariant holds in current code (before touching any data)
Audit every call site that can set `Evidence.status = 'CONFIRMED'` and confirm each one only does so
after a real `registerEvidenceOnChain`/`registerEvidenceHash` success — `promoteEvidence.ts`,
`evidenceRoutes.ts` `/confirm`, `WaybackScraper.ts` auto-promote, `forensicsRoutes.ts` `/promote`, MCP
`promote_evidence`. §1's timeline strongly suggests this already holds post-`f9102b5`, but confirm by
reading, not by re-trusting the same assumption that was wrong before — this is exactly the kind of
trust-critical call site sweep [feedback-audit-trust-critical-callsites.md](/Users/jonathand/.claude/projects/-Users-jonathand-OpenJustice/memory/feedback-audit-trust-critical-callsites.md)
says to do together, not per-file.

### Step 2 — Decide and confirm remediation scope with the user before deleting anything
Two options, present both:
- **(a) Full wipe + replay everything** (user's stated preference) — delete all 7 `Evidence`, all 81
  `UrlVersionDiff` + 83 `UrlSnapshot` + the `WaybackScrapeJob`, the `TrackedUrl`, the `Thesis` (+ its 2
  `ThesisVersion` + `ThesisMention` + any `ThesisGapResolution`), and the 4 `KeyFigure` rows. Also clean
  the corresponding `evidence_embeddings` rows (Pinecone-adjacent — orphaned entries left behind by
  Evidence deletion won't clean themselves up, `VectorStoreService` has no cascade). **Preserve**
  `Researcher` rows and any `ResearchSession`/`ResearchSessionEvent` rows untouched.
- **(b) Surgical repair** — backfill `601e045a`'s real tx hash (already registered, just missing from
  DB — a `findRegisteringTxHash`-style lookup + `update`, no replay needed), leave `86d76c48` alone
  (already correct), and only redo the 5 genuinely-fake `FORENSIC_DIFF` records (which likely means
  re-running the tracked-URL scan from scratch anyway, since diffs are chained/sequential).

Recommend (a) — the user's own reasoning already covers why: it's the only option that also produces a
fully clean, deterministic base for the fixture/test-suite goal in Step 4, and the "surgical" option
still ends up re-running most of the same scan regardless. Re-confirmed with the user 2026-08-20 after
the fuller root-cause picture (§0) emerged — still the right call.

**One refinement to (a), decided the same day:** `601e045a` (rtmag.co.il) is already genuinely
registered on-chain — it was literally the 2026-08-16 verification test for staging's Sepolia setup
(§0). A full wipe-and-resubmit would create a *second*, redundant real registration for identical
content. Backfill its real tx hash first (`findRegisteringTxHash` + `update`, independent of the rest of
this plan, safe to do anytime) — then decide whether to still delete-and-replay it for fixture-capture
consistency with the other 6, or leave it alone as the one exception. Either is fine; just don't
re-register it a second time.

**Also worth a quick check before deleting `601e045a` specifically:** it was built as "Phase 5 demo prep"
test data (per [[gf-staging-testnet-chain]]) — confirm nothing else (a demo script, a hardcoded evidence
ID in the frontend) references its current ID before wiping it. Low risk, cheap to check.

### Step 3 — Execute the replay, verifying integrity at every step (not just at the end)
1. Confirm staging's Railway blockchain env vars are correct (§2) before submitting anything — replaying
   into the same misconfiguration would just reproduce the bug.
2. Re-submit the rtmag.co.il URL evidence (same URL, so it's the same real content — this must stay a
   real-world scenario, not synthetic data). Verify: `PENDING_REVIEW` → promote → confirm
   `onChainTxHash` is set **and** `isRegistered` on-chain agrees, before moving on.
3. Re-run the tracked-URL scan against `https://corona.health.gov.il/vaccine-for-covid/` to regenerate
   the diff history. Verify snapshot/diff counts land in the same ballpark as before (81/83 — Wayback's
   own archive won't have changed, so this should reproduce closely, though not necessarily bit-for-bit
   if new snapshots were archived since).
4. Let auto-promote run, and for every diff it promotes to `Evidence`, verify `onChainTxHash` is set and
   matches a real on-chain registration before trusting the record — spot-check with the same
   `isRegistered` pattern used in this session's audit, don't just trust the DB write succeeded.
5. Rebuild the thesis citing this evidence; verify its citations resolve to the newly-created evidence
   (not stale IDs).

### Step 4 — Capture fixtures + build a grounded test suite
Once the replay is verified clean end to end, export the real inputs and outputs as fixtures:
- Input fixtures: the rtmag.co.il URL, the corona.health.gov.il tracked URL.
- Output fixtures: the resulting `Evidence` rows (classification, tier, summary), the diff set, the
  thesis content/citations — real, domain-grounded data, not synthetic placeholders.

Use these to build an integration-style test suite distinct from the existing unit tests (which mock
Prisma) — e.g. "given this real evidence fixture, does thesis-citation resolution work end to end,"
"does promoting this fixture diff produce a verifiably-registered `Evidence` row." Scope/shape of this
suite is intentionally left open for the new session to design — the fixture data from Step 3 is the
prerequisite, not the test suite itself.

---

## 4. Explicit safety notes for whoever picks this up

- **This plan deletes real staging data.** Confirm the exact deletion scope (§3 Step 2) with the user
  before running anything, even though staging is not production — per this repo's standing safety
  protocol, run `git status`-equivalent awareness of current DB state (i.e., re-run the §1 inventory
  query fresh) immediately before deleting, in case anything changed since this plan was written.
- Never touch `Researcher`, `ResearchSession`, `OidcModel`, or `evidence_embeddings` rows unrelated to
  the evidence being replayed.
- This plan's own diagnosis (§1) already answered "is this a live bug" — no need to treat Step 1 as
  optional just because §1 looks reassuring; confirm it directly in code, not from this doc's summary of
  a two-day-old git log comparison.
