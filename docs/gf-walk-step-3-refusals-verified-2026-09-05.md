# Step 3, the refusal surface, verified on staging — 2026-09-05

A findings record, never edited. Bears on `docs/gf-refactor-plan.md` §3 step 3; pointed at from
step 3's *Verified on staging* line. Only the two registered tools' REFUSAL surface was reachable at
this step: their write paths need state that steps 5 and 6 create (a PENDING_JUDGEMENT row; a
returned draft) and are held by the suite until then. Nothing here claims more than that.

**What was run.** After PR #353 (`7c58fa9`) deployed to staging (SUCCESS), the reviewer session drove
the calls below through the staging MCP connector, one call per approval (guided execution). Every
call wrote nothing: no decision, no row, no draft.

## 1 — identify the environment

`get_environment()` →

```
environment: staging · verdict: CONFIRMED · database projectRef elws…ae (pinned)
chain: reachable, chainId 84532, registry 0x65b9a7acb45Aa05e7Ed207844F93a2b308373853 deployed,
       expectedChainId 84532, matchesEnvironment true
corpus (recognition only): trackedUrls 3 · snapshots 112 · snapshotsUnanchored 0 · diffs 109 ·
       evidence 9 · theses 1
```

The environment was identified by the deployment's own configuration, never by the connector's name.

## 2 — NOT_SURVEYED

`approve_article_rules(url="https://example.invalid/not-surveyed", capture="20200301090000")` →

```json
{"error":"https://example.invalid/not-surveyed is not in the corpus. Survey it first: survey_wayback_captures url=https://example.invalid/not-surveyed","code":"NOT_SURVEYED"}
```

## 3 — NO_DRAFT

`approve_article_rules(url="https://news.walla.co.il/item/3403847", capture="20200301090000")` →

```json
{"error":"The page holds no draft. Open the marking page for this capture and hand a draft back first.","code":"NO_DRAFT"}
```

## 4a — a real capture, read through the OLD `list_captures` (the new one is unregistered)

`list_captures(url="https://news.walla.co.il/item/3403847")` → 9 index rows, 8 stored; the timestamp
`20210612183110` appears TWICE in the archive's answer — the duplicate that step 3's de-duplication
was owed for (`docs/gf-walk-step-2-survey-verified-2026-09-05.md`). First stored capture:
`20201209134003`.

## 4 — NOT_PENDING

`resolve_scan_stop(url="https://news.walla.co.il/item/3403847", capture="20201209134003", resolution="BAD_CAPTURE", reason="step 3 staging exercise of the refusal surface")` →

```json
{"error":"Capture 20201209134003 is ACQUIRED, not PENDING_JUDGEMENT; only a capture held at a stop can be skipped.","code":"NOT_PENDING"}
```

The outcome named is ACQUIRED: step 2's legacy join, read back through `loadWorkListRow` →
`outcomeOf`. A STORED row would also read ACQUIRED through the same boundary.

## 5 — REASON_REQUIRED

`resolve_scan_stop(url="https://news.walla.co.il/item/3403847", capture="20201209134003", resolution="BAD_CAPTURE", reason="   ")` →

```json
{"error":"A skip requires a reason; a blank one is no reason.","code":"REASON_REQUIRED"}
```

Refused on the input, before the transaction — the same capture that answered NOT_PENDING in
step 4 never reached the row read here.

## Not exercised, and why

- `NO_RESEARCHER` — unreachable through an authorised connector: the WRITE_TOOLS gate supplies the
  identity. Held by the four tool files and by `mcpIntegration`'s write-tool auth group.
- `DRAFT_NOT_RETURNED`, `DRAFT_FOR_OTHER_CAPTURE`, `CAPTURE_NOT_MARKABLE`,
  `EMPTY_RULESET_UNCONFIRMED`, `INVALID_RESOLUTION` (schema-rejected at the MCP layer: `resolution`
  is a `const`), `STALE_SEQUENCE`, and every write path — need a draft (step 6) or a
  PENDING_JUDGEMENT row (step 5). Held by the suite: approve 28/28, resolve 16/16.
- The three unregistered tools (`get_article_rules`, `reset_article_calibration`,
  `list_captures`) — by design until step 8.

## What this verifies

Both registered tools answer on staging as JSON refusals, never a throw; the environment was
confirmed by data first; the survey's legacy-join rows read as ACQUIRED through the one boundary;
nothing was written.
