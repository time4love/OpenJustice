# Step 2, the survey, verified on staging — 2026-09-05

A findings record, never edited. Bears on `docs/gf-refactor-plan.md` §3 step 2 and §5 ("after step 2
every snapshot has a row"); pointed at from step 2's *Verified on staging* line.

**What was run.** After PR #351 (`9909261`) deployed to staging (SUCCESS), the researcher drove the
step's verification through the staging MCP connector, one call at a time under show-then-run:

1. `get_environment` — `staging`, verdict CONFIRMED, chain 84532, the registry deployed; the corpus
   reported 3 pages and 112 snapshots BEFORE any write. The environment was identified by the
   deployment's own configuration, never by the connector's name.
2. `list_captures` on each of the three pages — reads — for the snapshot count the platform holds
   today, recounted rather than carried from a document.
3. `survey_wayback_captures` on each page, smallest first.

**The number the step is verified by: after the survey, `held` equals the page's snapshot count.**
`held` is the work-list rows read as ACQUIRED through the one boundary of `src/walk/rows.ts` — the
rows the legacy join wrote today, plus the rows the old path had written as STORED.

| page | snapshots held today | `captures` (uncollapsed) | `byteDistinct` | `held` | `appended` | `unservable` |
|---|---|---|---|---|---|---|
| `https://news.walla.co.il/item/3403847` | 7 | 9 | 8 | **7** | 0 | 0 |
| `https://rtmag.co.il/health/the-israeli-moh-hid-alarming-findings-from-a-study-on-the-covid-19-vaccine-side-effects-that-the-ministry-itself-ordered` | 22 | 28 | 25 | **22** | 3 | 0 |
| `https://corona.health.gov.il/vaccine-for-covid/` | 83 | 133 | 95 | **83** | 132 | 0 |
| total | 112 | | | **112** | 135 | |

Every page matched. 7 + 22 + 83 = 112 = the snapshot count `get_environment` reported before the
first write. Plan §5's claim — after step 2 every snapshot has a row — is a measurement on staging.
`created` was `false` on all three: the pages existed; the survey attributed nothing it did not create.

**What each other number says.**

- The ministry page had NO work-list rows before today (83 of its snapshots predate the index table,
  `docs/gf-refactor-plan.md` §5): 132 of the archive's 133 rows were appended, and the 83 whose
  timestamp matched a stored snapshot were written ACQUIRED with the snapshot id, the empty
  ruleset's id and the snapshot's extraction version — the legacy join, exercised on its whole
  population. The one row not appended was already there: one of the three UNFETCHED rows the old
  path had left (staging held 29 STORED, 2 UNCHANGED, 3 UNFETCHED on 2026-09-03).
- rtmag: `byteDistinct` 25 of 28 — three consecutive blocked captures (HTTP 403) share one digest,
  which is exactly the case the uncollapsed query exists to expose and the collapsed one hid. Three
  rows appended: captures the old path's collapsed query never listed.
- Walla: `captures` 9 against a `byteDistinct` of 8 and `appended` 0 — see the finding below.

**A finding, from the data, not from the code.** The archive's index returned the Walla capture
`20210612183110` TWICE in one answer (visible in `list_captures` as a repeated row). The survey
filters the archive's rows against the timestamps the page already holds, so on a page that holds
the row a repeat is harmless — it was, today. On a NEW page, two identical timestamps would both pass
that filter and reach the one `createMany`, which A2's unique key on (page, timestamp) rejects; the
survey would THROW rather than refuse, and A5's convention is a refusal, never a throw. Not exercised
today; the three pages all held the row. **Owed to step 3's first change:** the survey de-duplicates
the archive's answer by timestamp before filtering (first occurrence wins), with a suite case under
show-then-run — "the archive reports one timestamp twice; one row is written" — observed red first.

**Also recorded here, decided today: refactor plan §9.6's early cutover is TAKEN.** The rebuild's
sub-steps (evidence §8: measure, ledger, deploy the fresh registry, rotate the configuration, drop the
database in its own cleanup session, survey and walk) run on staging between step 4 and step 5 —
after step 4's measurements on the existing corpus, before the first step that writes to the chain —
so steps 5–8 and every later track build on the target schema and a registry with one meaning from
index zero. The three marking walks' rules go with the database, as step 9 already sent them; the
survey above is what rebuilds the three pages. Production is unchanged: its rebuild is at SHIP, after
staging is verified end to end. The plan's §3 order carries the amendment beside step 5.

**What was NOT touched:** no rule, no decision, no snapshot, no chain entry. The survey writes
`cdxQuery` rows and appends work-list rows; nothing it wrote survives the drop above, and nothing it
verified depends on the rows — `held` equalling the snapshot count is a property of the code.
