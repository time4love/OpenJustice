# Glass Fortress — Claude Instructions

## Communication Style

### Claude's Take
When you have insights, recommendations, or opinions beyond just executing the task, mark them with:

> **💡 Claude's Take:** ...

This allows the user to quickly spot and skip (or engage with) unsolicited opinions.

### General
- Be concise. Lead with the answer or action.
- Do not recap what the user said — just do it.

## Code Quality Standard
Above all else, code must be clean and written to the highest standards:
- Every change must leave the codebase in a better or equal state — never worse.
- Eliminate systematic risks proactively: if a pattern could silently fail in production (e.g. schema fields being dropped, type unsafety, unhandled edge cases), add a guard or test for it, not just a fix for the immediate symptom.
- No dead code, no commented-out blocks, no `any` escape hatches.
- If a test was wrong (not the code), fix the test — never weaken assertions to make tests pass.
- **Always choose the clean solution, never the easy one.** Do not keep a compromised design because
  unwinding it is inconvenient. When the clean solution is expensive because live data would need
  migrating, do not quietly pick the easy option and do not silently do the expensive one — state the
  trade-off and discuss it first.

## Code Conventions
- TypeScript: strict mode, no `any`, zod validation for all LLM outputs
- No `.js` extensions on backend imports (CommonJS + ts-node-dev)
- Tests: Jest for TS, Forge for Solidity. Always run tests after changes.
- Never skip hooks (`--no-verify`) — fix the underlying issue instead.

## Memory & Continuity

### `CHECKPOINT` — the save-everything code word
When the user writes **`CHECKPOINT`**, they are about to close the session and want all session
knowledge persisted. Treat it as a command, not a question — do not ask what to save. Sweep for:
decisions and their reasoning, gaps/bugs found but not fixed, architectural rules established, user
corrections and preferences, blocked items and what unblocks them, and the state of work in progress
(branch, test counts, what is already applied to production).

Write each to the right place:
- **Memory files** — reasoning, preferences, decisions, blockers (one fact per file).
- **`MEMORY.md`** — index pointer per memory + a current Next Session Priorities list.
- **Repo docs in git** (`docs/*-dev-plan.md`, `docs/phases/`, `COMPLIANCE.md`) — anything a future
  contributor would need. If it belongs to the project rather than to Claude's memory of it, it goes
  in git.

Then report exactly what was written and where, and name anything deliberately not saved.

`CHECKPOINT` is a backstop, not the mechanism: persist at natural boundaries — phase complete,
significant decision, bug found and deferred — **without being asked**, so `CHECKPOINT` usually finds
little left to do.

## Branching & Deployment Protocol

**Branches**
| Branch | Role | Deploys to |
|---|---|---|
| `master` | production | Railway `production` — GF + BF, 4 services |
| `staging` | integration + testing | Railway `staging` — GF only, 2 services |
| feature branches | all work starts here | nothing |

**The flow is: feature branch → PR → `staging` → (explicit approval) → `master`.**

1. **Never commit directly to `master` or `staging`.** Create a feature branch.
2. Open a **pull request against `staging`**. Merge it there once green.
3. Test on the staging environment — it runs against the **staging** Supabase project, not
   production. Project refs and connection details live in `.env.staging` (gitignored), never here:
   this repo is public.
4. **Merging `staging` → `master` requires specific, explicit approval from the user, every time.**
   It is a production deployment. Never merge to `master` on your own initiative, and never treat
   general permission to commit or push as permission to deploy. Ask, and wait for a clear yes.

Local `.env` points at the **staging** database. Production credentials are preserved in
`.env.production.local` (gitignored) — restore them only for a deliberate production query.

### Git keywords — Claude executes all git commands

The user does not run git. These uppercase keywords are commands; act on them without asking what
they mean or what to include.

| Keyword | Action |
|---|---|
| `COMMIT` | Stage the relevant changes, write the message, commit, push. **If on `master` or `staging`, create a feature branch first** — the protocol must not be violated by accident. |
| `PR` | Push and open a pull request against `staging`, or update the existing one. |
| `LAND` | Merge the open PR into `staging`, delete the branch, confirm the staging deploy is green. |
| `SHIP` | Merge `staging` → `master`. **This is a production deploy and the keyword is the approval** — do not ask again, but do print what is about to deploy. |
| `SYNC` | Fetch, bring `staging` up to date with `master`, update the current branch. |

**Refuse to execute, and say why, when:**
- `COMMIT` — nothing staged-worthy, or the diff contains anything secret-shaped (keys, tokens,
  connection strings, project refs). This repo is **public**.
- `PR` / `LAND` — tests are failing, or the PR is not mergeable.
- `SHIP` — tests not green, uncommitted changes present, staging's latest deploy is not `SUCCESS`,
  `staging` is not ahead of `master`, or anything secret-shaped is in the diff.

Report what was actually done — branch names, commit SHAs, PR numbers, deploy status — never just
"done". If a git command fails, say so plainly; never let a shell chain report success for a failed
push.

## Workflow
- Do not commit unless explicitly asked.
- Do not push unless explicitly asked.

## npm Installs (Frontend)
The global `~/.npmrc` routes all npm traffic through Wix's internal registry (`npm.dev.wixpress.com`), which requires Wix VPN. Direct access to `registry.npmjs.org` is also blocked by the corporate firewall (EBADF).
- **On VPN:** `npm install <pkg>` works as-is — Wix registry proxies public npm.
- **Off VPN:** Both registries fail. Cannot install packages without VPN.
