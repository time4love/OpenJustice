# The two-session protocol — how a refactor step is handed from one pair of sessions to the next

**The definition, 2026-09-09, written by the R34 REVIEW seat after four handoffs each found an omission when checked against the previous one.** The handoff FILES live outside this repository (`~/.claude/projects/-Users-jonathand-OpenJustice/handoffs/`, beside a `check-handoff.py` that greps a new set against the lists below and prints what is missing); this is their specification, in git because it is the project's process and not one session's memory. The operating model it implements is `docs/gf-refactor-plan.md` §9; `CLAUDE.md`'s `REVDEV` section is its one-session form.

## The shape

One refactor step = one round `R<n>` = three files, written by the outgoing REVIEW seat at ~450k
tokens of its own context, BEFORE its last keyword flow:

| file | read by | carries |
|---|---|---|
| `R<n>-state.md` | both seats | where the refactor stands: what landed (PRs, SHAs, deploy status), what is in the tree, the numbers at close, THE SEAM (what cannot be exercised and why), the next step's contract TRANSCRIBED from the designs onto the schema as the tree holds it, the rulings that bind, the LOWs carried, the traps |
| `R<n>-dev-prompt.md` | DEV | the seat, the reading list in order, the rules that bind the code, the scope by chunk, the suite as the spec with today's counts, the report block |
| `R<n>-review-prompt.md` | REVIEW | the seat and that it HOLDS THE TREE, the reading list, the finding shape with step-specific HIGH/MEDIUM/LOW, the stop rule, the read-only checks, the decoy and sweep discipline, the keyword flow, the reply shape, the persistence rule, the next-handoff threshold |

**Self-contained, every time.** No file says "as R<n-1>'s prompt said"; a chain to an older prompt
is a reading nobody does. The previous round's `R<n-1>-review-state.md` is in the reading list as a
LOG to read once, not as a source of instructions.

## What goes where — the required elements

The lists below are what `check-handoff.py` greps for. A phrase missing is reported; the writer
decides whether the step genuinely has no such element (say so in the file, in the words the
checker looks for, e.g. "no migration") or forgot it.

### `R<n>-state.md`
1. Header: who wrote it, at what context size, after what landed.
2. **READ FIRST** if the tree is not clean: what is uncommitted, whose, why, who lands it.
3. The landed step: PR numbers, SHAs, deploy status (SKIPPED is final for docs-only), CI ratchet
   line, `db:check-drift` result, MCP surface count.
4. What is in the tree now, module by module, one line each.
5. Numbers at close: tsc · `npm test` · walk · evidence with the red BY NAME.
6. **THE SEAM**: what this tree cannot exercise (today: no thesis writer until thesis 20), so what
   the next step proves by fixtures and what it OWES.
7. The next step's contract transcribed: every tool's return shape and refusal set from the
   appendix, mapped onto the schema; which predicates exist; which scan allow-lists already name
   the step's modules.
8. Rulings that bind, with pointers to the memory files.
9. LOWs carried, not applied.
10. Traps, newest first, each one sentence.

### `R<n>-dev-prompt.md`
1. The seat: DEVELOPER; NEVER runs git (no add, commit, push, checkout, branch, stash);
   `git show/diff/status` only; never a design doc, a migration (unless ruled), staging, a frontend
   file; batch questions, never resolve in code; context size in every report, bold past ~450k.
2. READ IN THIS ORDER, the designs WHOLE never by section: CLAUDE.md · docs/README.md ·
   `R<n>-state.md` · `R<n-1>-review-state.md` · `R<n-1>-chunk-1-sketch.md` (the sketch's shape) ·
   architecture target §9–§11 · THE FOUR DESIGNS EACH WHOLE in dependency order (interaction,
   evidence, thesis, document), naming which sections are this step's contract · the refactor plan
   WHOLE · as-built §7–§8 · thesis plan §5 · document plan §5 (the KEEP tables) · the triage doc ·
   the legacy-switch record · the step's own dated docs · the memory rulings · the tree at named
   paths. "A ruling you find that the state file does not carry is REPORTED as FOUND, never asked."
3. RULES THAT BIND THE CODE: no chain write (`registerEvidenceHash` one caller); KEEP files
   byte-identical or DECLARED with authority; `src/walk` byte-identical; `mcpToolClassification`
   KEEP; predicates CALLED never re-spelled; the step's own invariants (no re-pin, WITHDRAWN never
   back, nothing deleted…); `.at()`; `Prisma.DbNull` only for a cleared Json; zod for every model
   output; the destructive-DB guard matches WORDS — decoys in a file; sweeps from a file with a
   count, existence and a positive control.
4. SCOPE BY CHUNK: chunk 1 THE SKETCH on disk at `R<n>-chunk-1-sketch.md`, sections (a)–(f), STOP;
   chunk 2 on the word, red first BY NAME, one test per refusal code and per shape clause, the
   model mocked at its boundary, fixtures named.
5. THE SUITE IS THE SPEC: the four commands from the backend by absolute path with today's counts;
   ratchets REPORTED never set; eslint with the pre-existing errors named by file.
6. The REPORT block (files / observed / questions / next) and "paste this block into the REVIEWER
   session now".

### `R<n>-review-prompt.md`
1. The seat: REVIEWER, HOLDS THE TREE, every git command here on the keywords; never edits DEV's
   code, never `jest -u`, never `prisma migrate`, `railway` only to read at LAND or run a named
   maintenance script on instruction; "a claim in a report is not evidence"; the crossed-seat rule.
2. READ IN THIS ORDER: CLAUDE.md · README · `R<n>-state.md` · `R<n-1>-review-state.md` whole ·
   `R<n>-dev-prompt.md` (its scope binds; its reading list is yours) · the sketch precedent and the
   sketch path that MUST be on disk · the memory files. "Grep EVERY design and the triage by name
   before saying KEEP or RETIRE."
3. WHAT A FINDING IS: the shape (`[LEVEL] file:line — defect / cites / held by`); HIGH, MEDIUM,
   LOW lists rewritten for THIS step's contract; "a design question is not a finding".
4. STOP RULE: no HIGH or MEDIUM; three rounds; the fourth is the researcher's; write "LOOP ENDS".
5. READ-ONLY CHECKS: the commands by absolute path; jest `--json` parsed with `raw_decode` and the
   TOTALS printed; eslint now vs staging via `--stdin`; the KEEP sweep from a file with count,
   existence, positive control; decoys from a SCRIPT FILE, restored and `cmp`'d against the backup,
   a compiler-refused decoy re-planted in a compiling form; red-first by stubbing the src file.
6. THE KEYWORD FLOW: COMMIT (branch check, secret grep, `git add` by path, `git commit -F`, push) ·
   PR (`--body-file`, `gh run watch --exit-status`, the ratchet lines) · LAND (mergeable, merge with
   delete, checkout staging, pull ff-only, the deploy poll with `timeout 40` and `jq`, SUCCESS OR
   SKIPPED as final, then `db:check-drift` must say "No difference detected") · `gh auth status`.
7. THE REPLY SHAPE: questions · findings ranked · "what I checked and found sound" · NEXT PROMPT
   FOR THE DEVELOPER as a pasteable numbered list · remaining steps · one recommended step.
8. PERSIST: `R<n>-review-state.md` and memory at every chunk boundary; context size as the harness
   shows it; write `R<n+1>-*` at ~450k before the last keyword flow.

## The keyword

**`HANDOFF <R>`** — a git-keyword-class command in `CLAUDE.md`'s table: the REVIEW seat writes the
three `R<n>` files per this protocol, runs `check-handoff.py R<n>` and pastes its output, diffs once
by eye against the previous set for the step's own content, then CHECKPOINTs. Refuse, and say why,
when the tree is not clean and undeclared, or when a keyword flow is mid-way (COMMIT done, PR not
landed) — the handoff is written BEFORE the last keyword flow, never inside one.

## The procedure

1. At ~450k, the REVIEW seat writes the three files.
2. It runs `python3 check-handoff.py R<n+1>` and fixes every MISSING line or writes the words that
   say why the element does not apply.
3. It then diffs against the previous set by eye once — the checker holds the protocol; the eye
   holds the step.
4. The researcher opens the next sessions from the files. The first act of the new REVIEW seat is
   to verify the baseline from the tree and read the READ FIRST block.
