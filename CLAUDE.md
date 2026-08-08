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

## Code Conventions
- TypeScript: strict mode, no `any`, zod validation for all LLM outputs
- No `.js` extensions on backend imports (CommonJS + ts-node-dev)
- Tests: Jest for TS, Forge for Solidity. Always run tests after changes.
- Never skip hooks (`--no-verify`) — fix the underlying issue instead.

## Workflow
- After completing a phase/task, ask if the Task Tracker in MEMORY.md should be updated.
- Do not commit unless explicitly asked.
- Do not push unless explicitly asked.

## npm Installs (Frontend)
The global `~/.npmrc` routes all npm traffic through Wix's internal registry (`npm.dev.wixpress.com`), which requires Wix VPN. Direct access to `registry.npmjs.org` is also blocked by the corporate firewall (EBADF).
- **On VPN:** `npm install <pkg>` works as-is — Wix registry proxies public npm.
- **Off VPN:** Both registries fail. Cannot install packages without VPN.
