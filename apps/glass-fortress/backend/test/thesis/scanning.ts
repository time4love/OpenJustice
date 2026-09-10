import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BACKEND, SRC, readCode, tsFiles } from '../walk/scan';

// ---------------------------------------------------------------------------
// THE THESIS SUITE'S SOURCE AND SCHEMA READERS — moved out of `scans.test.ts` at
// 7.5b, VERBATIM, when `invariants.test.ts` needed the same schema reader and the
// same "not built" read of a source file: two copies would be two readers of one
// schema, free to disagree about what a field is.
// ---------------------------------------------------------------------------

export const modules = () => tsFiles(SRC).map((file) => ({ file: relative(SRC, file), code: readCode(file) }));

/** A source file a later step builds: its code, or red BY NAME with the step that owes it. */
export function sourceOf(path: string, step: number): string {
  const full = join(SRC, path);
  if (!existsSync(full)) throw new Error(`${path.replace(/\.ts$/, '')} is not built — thesis step ${String(step)} builds it`);
  return readCode(full);
}

// --- the schema, read as blocks --------------------------------------------------

export const SCHEMA = readFileSync(join(BACKEND, 'prisma', 'schema.prisma'), 'utf8');

export interface Block {
  kind: 'model' | 'enum';
  name: string;
  /** The body's lines, comments stripped, block attributes (`@@…`) dropped. */
  lines: string[];
}

/** Every model and enum of a schema text. */
export function blocksOf(schema: string): Block[] {
  return [...schema.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map((m) => ({
    kind: m[1] === 'enum' ? 'enum' : 'model',
    name: m[2] ?? '',
    lines: (m[3] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => line.length > 0 && !line.startsWith('@@')),
  }));
}

/** A model's fields: the name, and the type with its `?` and `[]` removed. */
export const fieldsOf = (block: Block | undefined): { name: string; type: string }[] =>
  (block?.lines ?? []).map((line) => {
    const [name = '', type = ''] = line.split(/\s+/);
    return { name, type: type.replace(/[?[\]]/g, '') };
  });

/** An enum's values. */
export const valuesOf = (block: Block | undefined): string[] => (block?.lines ?? []).map((line) => line.split(/\s+/).at(0) ?? '');

export const blockNamed = (kind: Block['kind'], name: string): Block | undefined =>
  blocksOf(SCHEMA).find((b) => b.kind === kind && b.name === name);
