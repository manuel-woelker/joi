import type { DiffSide } from "../../generated/api/api";

declare const diffFileIdBrand: unique symbol;
declare const diffRowIdBrand: unique symbol;

/** Stable identity for a parsed diff file. */
export type DiffFileId = string & { readonly [diffFileIdBrand]: true };
/** Stable identity for a rendered diff row. */
export type DiffRowId = string & { readonly [diffRowIdBrand]: true };

export const diffFileId = (value: string) => value as DiffFileId;
export const diffRowId = (value: string) => value as DiffRowId;

export interface DiffDocument {
  readonly files: readonly DiffFileId[];
  readonly filesById: ReadonlyMap<DiffFileId, DiffFile>;
}

export interface DiffFile {
  readonly id: DiffFileId;
  readonly oldPath?: string;
  readonly newPath?: string;
  readonly displayPath: string;
  readonly status: "modified" | "added" | "deleted" | "renamed" | "binary" | "mode";
  readonly additions: number;
  readonly deletions: number;
  readonly hunks: readonly DiffHunk[];
}

export interface DiffHunk {
  readonly id: DiffRowId;
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

export interface DiffLine {
  readonly id: DiffRowId;
  readonly kind: "context" | "addition" | "deletion";
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: string;
}

export interface DiffLocation {
  readonly file: string;
  readonly line: number;
  readonly side: DiffSide;
}

export const locationKey = ({ file, line, side }: DiffLocation) => `${file}\u0000${side}\u0000${line}`;
