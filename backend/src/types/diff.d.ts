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
