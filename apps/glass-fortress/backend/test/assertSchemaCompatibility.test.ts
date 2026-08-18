import { z } from 'zod';
import { assertSchemaCompatibility } from '../src/lib/assertSchemaCompatibility';

describe('assertSchemaCompatibility', () => {
  it('passes for an ordinary schema', () => {
    const schema = z.object({ title: z.string(), count: z.number().int() });
    expect(() => assertSchemaCompatibility(schema, 'TestAgent')).not.toThrow();
  });

  it('throws when a field uses .positive() — produces exclusiveMinimum, which Gemini rejects', () => {
    const schema = z.object({ id: z.number().int().positive() });
    expect(() => assertSchemaCompatibility(schema, 'TestAgent')).toThrow(/exclusiveMinimum/);
  });

  it('throws when a field uses .negative() — produces exclusiveMaximum', () => {
    const schema = z.object({ offset: z.number().negative() });
    expect(() => assertSchemaCompatibility(schema, 'TestAgent')).toThrow(/exclusiveMaximum/);
  });

  it('catches .positive() nested inside an array of objects (the actual shape of the bug found live)', () => {
    const schema = z.object({
      citations: z.array(z.object({ id: z.number().int().positive(), fileHashes: z.array(z.string()) })),
    });
    expect(() => assertSchemaCompatibility(schema, 'TestAgent')).toThrow(/exclusiveMinimum/);
  });

  it('does not throw for the .min(1) replacement', () => {
    const schema = z.object({ id: z.number().int().min(1) });
    expect(() => assertSchemaCompatibility(schema, 'TestAgent')).not.toThrow();
  });

  it('includes the agent name in the error message', () => {
    const schema = z.object({ id: z.number().positive() });
    expect(() => assertSchemaCompatibility(schema, 'MyAgent')).toThrow(/MyAgent/);
  });
});
