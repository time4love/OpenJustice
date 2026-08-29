/**
 * Minimal type declarations for the `diff` package (v4.x).
 * Replaces @types/diff which is unavailable in this environment.
 */
declare module 'diff' {
  export interface Change {
    count?: number;
    value: string;
    added?: boolean;
    removed?: boolean;
  }

  export interface PatchOptions {
    context?: number;
  }

  export interface ApplyPatchOptions {
    fuzzFactor?: number;
  }

  export interface LinesOptions {
    ignoreWhitespace?: boolean;
    newlineIsToken?: boolean;
  }

  export interface WordsOptions {
    ignoreCase?: boolean;
  }

  /**
   * A change over a sequence of items rather than of characters.
   *
   * Declared because `diffChunkPair` aligns SENTENCE LISTS: comparing whole
   * sentences is what lets an unchanged one be recognised as common on both
   * sides and emitted on neither, which is the rider fix. A second character
   * diff could not express that — it would report the surviving sentence as
   * changed text inside a changed region.
   */
  export interface ArrayChange<T> {
    count?: number;
    value: T[];
    added?: boolean;
    removed?: boolean;
  }

  export function diffArrays<T>(oldArr: readonly T[], newArr: readonly T[]): ArrayChange<T>[];

  export function diffChars(oldStr: string, newStr: string): Change[];
  export function diffWords(oldStr: string, newStr: string, options?: WordsOptions): Change[];
  export function diffWordsWithSpace(oldStr: string, newStr: string): Change[];
  export function diffLines(oldStr: string, newStr: string, options?: LinesOptions): Change[];
  export function diffTrimmedLines(oldStr: string, newStr: string): Change[];
  export function diffSentences(oldStr: string, newStr: string): Change[];
  export function diffCss(oldStr: string, newStr: string): Change[];
  export function diffJson(
    oldObj: object | string,
    newObj: object | string,
  ): Change[];

  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions,
  ): string;

  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: PatchOptions,
  ): string;

  export function applyPatch(
    source: string,
    uniDiff: string,
    options?: ApplyPatchOptions,
  ): string | false;

  export function parsePatch(uniDiff: string): object[];

  export function convertChangesToUnicode(changes: Change[]): string;
  export function convertChangesToDMP(
    changes: Change[],
  ): Array<[number, string]>;
}
