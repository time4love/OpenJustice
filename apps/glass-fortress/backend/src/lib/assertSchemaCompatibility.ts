import { toJsonSchema } from '@langchain/core/utils/json_schema';
import type { z } from 'zod';

// Keywords Gemini's structured-output response_schema rejects outright (confirmed live: a
// z.number().positive() field — which zodToJsonSchema compiles to `exclusiveMinimum` — made
// every request 400 with "Unknown name \"exclusiveMinimum\"..."). Every agent here can be
// pointed at Gemini via its <AGENT>_PROVIDER env var, so this is checked for all of them, not
// just agents currently configured for Gemini — a schema that's fine on Anthropic today breaks
// silently the moment someone flips the provider.
const UNSUPPORTED_KEYWORDS = ['exclusiveMinimum', 'exclusiveMaximum'];

function findUnsupportedKeywords(node: unknown, path: string, found: string[]): void {
  if (node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYWORDS.includes(key)) {
      found.push(`${path}.${key}`);
    }
    findUnsupportedKeywords(value, `${path}.${key}`, found);
  }
}

/**
 * Fails fast at module load if LangChain's zodToJsonSchema drops fields from the given schema
 * (which would otherwise silently disappear from the function-calling schema the LLM sees), or
 * produces a JSON Schema keyword Gemini's structured-output mode rejects (e.g. from
 * z.number().positive()/.negative() — use .min(1)/.max(-1) instead, which compile to plain
 * minimum/maximum and work on every provider).
 */
export function assertSchemaCompatibility(schema: z.ZodObject<z.ZodRawShape>, agentName: string): void {
  const jsonSchema = toJsonSchema(schema) as { properties?: Record<string, unknown> };
  const schemaFields = Object.keys(schema.shape);
  const missing = schemaFields.filter((f) => !(f in (jsonSchema.properties ?? {})));

  if (missing.length > 0) {
    throw new Error(
      `[${agentName}] Schema compatibility failure: the following fields were dropped by ` +
      `LangChain's zodToJsonSchema and will be absent from the function-calling schema — ` +
      `[${missing.join(', ')}]. Apply any transformations post-parse instead.`,
    );
  }

  const unsupported: string[] = [];
  findUnsupportedKeywords(jsonSchema, 'schema', unsupported);
  if (unsupported.length > 0) {
    throw new Error(
      `[${agentName}] Schema compatibility failure: found provider-unsupported JSON Schema ` +
      `keyword(s) at [${unsupported.join(', ')}]. Gemini's structured-output mode rejects these ` +
      `outright. Likely cause: z.number().positive()/.negative() in the Zod schema — replace ` +
      `with .min(1)/.max(-1).`,
    );
  }
}
