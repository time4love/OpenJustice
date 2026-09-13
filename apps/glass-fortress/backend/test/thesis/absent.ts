import { join } from 'node:path';
import { SRC } from '../walk/scan';
import { MODULES, type ExportContract, type ModulePath } from './contract';

// ---------------------------------------------------------------------------
// THE ONE WAY A THESIS TEST REACHES A MODULE THAT STEP 17 DOES NOT BUILD.
//
// WHY NOT A LITERAL `await import('../../src/services/thesisPredicates')`.
// ts-jest runs with diagnostics on over `test/**`, and a literal specifier to a
// module that does not exist is TS2307 — a FILE-level diagnostic. The file does
// not compile, no case in it runs, and nothing counts them: that is how evidence
// 11b's `predicates.test.ts` sat uncounted. Measured before this was written
// (the R40 sketch §0b): a literal specifier exits 2 with TS2307; a COMPUTED one
// compiles. So the specifier is computed, the result is `unknown` at once, and
// each case fails ON ITS OWN, by name, with the step that owes the module.
//
// WHAT IT REFUSES TO HIDE. A MODULE_NOT_FOUND for exactly this specifier becomes
// "not built — thesis step N builds it". ANY OTHER error propagates untouched: a
// module that exists and throws on load, or that imports something missing,
// must show its own error rather than ours. And a module that exists without an
// export the contract names fails on that export's NAME — so a stub planted at
// the right path cannot turn a case green by existing.
// ---------------------------------------------------------------------------

/**
 * A thesis-layer module, loaded by path, failing by name until its step builds it.
 *
 * `only` names the exports a CASE needs, and the case then fails on THEIR step —
 * `fingerprint`'s cases name step 22, not the step that first creates the file.
 * Without it a module built across several steps (`services/thesisPredicates`,
 * 19 through 24) would keep every case red until its LAST export landed. A name
 * the contract does not list is a typo in the suite, and it throws as one.
 */
export async function built<T>(module: ModulePath, only?: readonly string[]): Promise<T> {
  const { step, exports } = MODULES[module];
  const contract: Readonly<Record<string, ExportContract>> = exports;
  if (only === undefined) return load<T>(module, step, contract);
  const wanted = Object.fromEntries(
    only.map((name) => {
      const entry = contract[name];
      if (entry === undefined) throw new Error(`${name} is not an export ${module} is contracted for`);
      return [name, entry];
    }),
  );
  return load<T>(module, Math.min(...Object.values(wanted).map((entry) => entry.step)), wanted);
}

/**
 * The loader itself, over ANY path under `src/` — exported so its four arms
 * can be held against modules that exist today (`test/thesis/loader.test.ts`).
 * Cases use `built`, whose paths are the contract's closed set.
 */
export async function load<T>(
  module: string,
  step: number,
  exports: Readonly<Record<string, ExportContract>>,
): Promise<T> {
  const specifier = join(SRC, module);
  let loaded: unknown;
  try {
    loaded = await import(specifier);
  } catch (err) {
    if (isThisModuleNotFound(err, specifier)) {
      throw new Error(`${module} is not built — thesis step ${String(step)} builds it`);
    }
    throw err;
  }

  if (typeof loaded !== 'object' || loaded === null) {
    throw new Error(`${module} loaded as ${typeof loaded}, not a module`);
  }
  const surface = loaded as Record<string, unknown>;
  const problems = Object.entries(exports).flatMap(([name, want]) => {
    const value = surface[name];
    const owner = `thesis step ${String(want.step)}`;
    if (value === undefined) return [`does not export ${name} (${owner})`];
    // A TABLE is an object and only a table; a FUNCTION is a function and only a
    // function. Either exported as the other is the stub-shaped green this
    // loader exists to refuse (round 2, M1).
    const actual = typeof value === 'function' ? 'function' : typeof value === 'object' && value !== null ? 'table' : 'value';
    return actual === want.kind ? [] : [`exports ${name} as a ${actual}, not as a ${want.kind} (${owner})`];
  });
  if (problems.length > 0) {
    throw new Error(`${module} exists but ${problems.join('; ')}`);
  }
  return loaded as T;
}

/**
 * A MODULE_NOT_FOUND about THIS specifier — never about a module it imports.
 * Jest names the missing path in the message; a nested miss names another.
 */
function isThisModuleNotFound(err: unknown, specifier: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return code === 'MODULE_NOT_FOUND' && typeof message === 'string' && message.includes(`'${specifier}'`);
}
