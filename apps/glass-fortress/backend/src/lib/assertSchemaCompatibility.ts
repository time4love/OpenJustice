import { toJsonSchema } from '@langchain/core/utils/json_schema';
import type { z } from 'zod';

/**
 * Fails fast at module load if LangChain's zodToJsonSchema drops fields from the given schema,
 * which would otherwise silently disappear from the function-calling schema the LLM sees.
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
}
