import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SRC } from '../walk/scan';

// ---------------------------------------------------------------------------
// THE ONE WAY THIS SUITE READS A MODEL OUT OF `schema.prisma`.
//
// WHY IT EXISTS. Three files in this suite ask the same question — does model X carry
// column Y — and before R74 chunk 3 they asked it three ways: `amendedTools.test.ts`
// inlined `/model DebateSession \{[\s\S]*?\n\}/` twice, and `scans.test.ts` and
// `invariants.test.ts` did not scope to a model at all and scanned the WHOLE FILE. The
// whole-file reading is what made both of them fail at step 29 for a reason STEP 36 owns
// (`Whistleblower.encryptedContact`, `schema.prisma` :434) and made one of them
// unsatisfiable in any step (the word `plaintext`, in a comment at :28 about the MCP
// bearer token). One rule with three implementations is this repository's named dominant
// defect shape, and here two of the three were wrong.
//
// IT IS DELIBERATELY NOT IN `contract.ts`. That file is A2's rows, A4's refusal sets and
// A6's check ids — the CONTRACT, transcribed. How a test reads a file is not the contract.
// ---------------------------------------------------------------------------

/** `prisma/schema.prisma`, read fresh so a case can plant a decoy in a COPY and compare. */
export function schemaText(): string {
  return readFileSync(join(SRC, '..', 'prisma', 'schema.prisma'), 'utf8');
}

/**
 * The body of `model <name> { … }`, or `''` when the schema holds no such model.
 *
 * EMPTY IS A REAL ANSWER AND EVERY CALLER CHECKS IT. A model that does not exist yet — which
 * is every one of step 28's until step 28 lands — returns `''`, and a `not.toContain` over `''`
 * passes for free. A case that does not assert the body was FOUND is a case satisfied by the
 * model's absence, which is the vacuity this repository has paid for before.
 */
export function modelBody(schema: string, model: string): string {
  return new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`).exec(schema)?.[0] ?? '';
}
