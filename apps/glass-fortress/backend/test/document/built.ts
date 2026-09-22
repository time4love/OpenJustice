import { load } from '../thesis/absent';
import { MODULES, type ExportContract, type ModulePath } from './contract';

// ---------------------------------------------------------------------------
// THE ONE WAY A DOCUMENT TEST REACHES A MODULE THAT STEP 27 DOES NOT BUILD.
//
// THE LOADER IS IMPORTED, NOT COPIED. `test/thesis/absent.ts` :58-:63 exports `load`
// precisely so its four arms can be held against modules that exist, and its own
// docstring records that `test/evidence/corpusReads.test.ts` already passes an `owner`
// label so its reds read "UI-2 builds it" rather than naming a thesis step. A second
// copy of that loader would be a second spelling of the one mechanism that makes a
// red-first suite COUNTABLE, which is this repository's named dominant defect shape.
//
// WHAT THE LOADER GIVES THIS SUITE, restated because the whole project rests on it:
//   · a COMPUTED specifier compiles where a literal one is a file-level TS2307 that
//     sinks the file so no case in it runs and nothing counts them — how evidence 11b's
//     `predicates.test.ts` sat uncounted;
//   · a MODULE_NOT_FOUND for exactly that specifier becomes "not built — document step
//     N builds it", and ANY OTHER error propagates untouched;
//   · a module that EXISTS without an export the contract names fails on that export's
//     NAME — so a stub planted at the right path cannot turn a case green by existing,
//     which is what `lib/anchoredCaptureHash` and `services/anchorSnapshots` rely on:
//     both are in the tree today and owe only a new symbol.
// ---------------------------------------------------------------------------

/**
 * A document-layer module, loaded by path, failing by name until its step builds it.
 *
 * `only` names the exports a CASE needs, and the case then fails on THEIR step — so a
 * predicate module built across steps 29 to 35 does not keep every case red until its
 * LAST export lands. A name the contract does not list is a typo in the suite and throws
 * as one.
 */
export async function built<T>(module: ModulePath, only?: readonly string[]): Promise<T> {
  const { step, exports } = MODULES[module];
  const contract: Readonly<Record<string, ExportContract>> = exports;
  if (only === undefined) return loadDocument<T>(module, step, contract);
  const wanted = Object.fromEntries(
    only.map((name) => {
      const entry = contract[name];
      if (entry === undefined) throw new Error(`${name} is not an export ${module} is contracted for`);
      return [name, entry];
    }),
  );
  const owed = Math.min(...Object.values(wanted).map((entry) => entry.step));
  return loadDocument<T>(module, owed, wanted);
}

function loadDocument<T>(
  module: string,
  step: number,
  exports: Readonly<Record<string, ExportContract>>,
): Promise<T> {
  return load<T>(module, step, exports, `document step ${String(step)}`);
}
