import type { FilterDefinition } from "./filter-definition/filter-model";
import {
  containsFilterOperator,
  equalsFilterOperator,
  inSetFilterOperator,
} from "./filter-definition/filter-operators";

/** Uncompiled highlight needle: literal text with its matching mode. */
export interface TextNeedleSpec {
  readonly text: string;
  /** Whole-word needles mirror token matching; others match substrings. */
  readonly wholeWord: boolean;
}

/** Needle with its matching regex precompiled for repeated cell scans. */
export interface CompiledTextNeedle {
  readonly source: string;
  readonly pattern: RegExp;
}

/** One rendered slice of a highlighted value. */
export interface HighlightSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

/** Values longer than this render without highlights to bound scan cost. */
export const MAX_HIGHLIGHT_TEXT_LENGTH = 5000;

/** Upper bound of needles compiled per column. */
export const MAX_HIGHLIGHT_NEEDLES = 32;

/** Tokens longer than this never occur in the index. Mirrors the indexer. */
const MAX_TOKEN_LENGTH = 40;

const WORD_CHARACTER = String.raw`[\p{L}\p{N}]`;

/**
 * Precompiles needle specs into match-ready regexes. Empty needles are
 * dropped since an empty pattern would match everywhere. Throws nothing:
 * uncompilable needles are skipped.
 */
export function compileNeedles(specs: readonly TextNeedleSpec[]): CompiledTextNeedle[] {
  const compiled: CompiledTextNeedle[] = [];
  for (const spec of specs) {
    if (compiled.length >= MAX_HIGHLIGHT_NEEDLES) break;
    if (!spec.text) continue;
    try {
      const escaped = escapeRegExp(spec.text);
      const source = spec.wholeWord ? `(?<!${WORD_CHARACTER})${escaped}(?!${WORD_CHARACTER})` : escaped;
      compiled.push({ source: spec.text, pattern: new RegExp(source, "giu") });
    } catch {
      continue;
    }
  }
  return compiled;
}

/**
 * Finds non-overlapping highlight ranges over `text`, merged across
 * needles and sorted by start offset. Returns an empty list when there is
 * nothing to highlight.
 */
export function highlightRanges(
  text: string,
  needles: readonly CompiledTextNeedle[],
): readonly (readonly [number, number])[] {
  if (!text || !needles.length || text.length > MAX_HIGHLIGHT_TEXT_LENGTH) return [];
  const ranges: [number, number][] = [];
  for (const needle of needles) {
    const pattern = new RegExp(needle.pattern.source, needle.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0]) ranges.push([match.index, match.index + match[0].length]);
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  }
  ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const current = merged.at(-1);
    if (current && range[0] <= current[1]) current[1] = Math.max(current[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** Splits `text` into plain and highlighted segments for rendering. */
export function highlightSegments(text: string, needles: readonly CompiledTextNeedle[]): readonly HighlightSegment[] {
  const ranges = highlightRanges(text, needles);
  if (!ranges.length) return [{ text, highlighted: false }];
  const segments: HighlightSegment[] = [];
  let offset = 0;
  for (const [start, end] of ranges) {
    if (start > offset) segments.push({ text: text.slice(offset, start), highlighted: false });
    segments.push({ text: text.slice(start, end), highlighted: true });
    offset = end;
  }
  if (offset < text.length) segments.push({ text: text.slice(offset), highlighted: false });
  return segments;
}

/**
 * Splits search input the way the index tokenizer does: lowercased words
 * on non-alphanumeric boundaries. Used for needles that must match whole
 * indexed words.
 */
export function tokenizeHighlightText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0 && token.length <= MAX_TOKEN_LENGTH);
}

/**
 * Derives per-attribute highlight needles from a committed filter plus a
 * committed quicksearch term. Only positive text predicates contribute:
 * `contains` as substring needles, `equals`/`in-set` as value needles,
 * and every search token as a whole-word needle fanned out to the given
 * attributes. Negated subtrees (`none`, `not-equals`) and non-textual
 * operators contribute nothing since their text is absent from matching
 * rows. Callers decide which attributes participate; cell rendering
 * decides what can show marks.
 */
export function deriveColumnHighlights(
  filter: FilterDefinition | undefined,
  search: string,
  stringAttributes: readonly string[],
): ReadonlyMap<string, readonly CompiledTextNeedle[]> {
  const specs = new Map<string, TextNeedleSpec[]>();
  const add = (attribute: string, spec: TextNeedleSpec) => {
    const entries = specs.get(attribute) ?? [];
    entries.push(spec);
    specs.set(attribute, entries);
  };
  walkFilter(filter, (attribute, operator, values) => {
    if (operator === containsFilterOperator || operator === equalsFilterOperator) {
      const [value] = values;
      if (value !== undefined) add(attribute, { text: value, wholeWord: false });
    } else if (operator === inSetFilterOperator) {
      for (const value of values) add(attribute, { text: value, wholeWord: false });
    }
  });
  for (const token of tokenizeHighlightText(search)) {
    for (const attribute of stringAttributes) add(attribute, { text: token, wholeWord: true });
  }
  const compiled = new Map<string, readonly CompiledTextNeedle[]>();
  for (const [attribute, entries] of specs) {
    const needles = compileNeedles(entries);
    if (needles.length) compiled.set(attribute, needles);
  }
  return compiled;
}

function walkFilter(
  filter: FilterDefinition | undefined,
  visit: (attribute: string, operator: string, values: readonly string[]) => void,
): void {
  if (!filter || filter.disabled) return;
  if (filter.type === "composite") {
    // Negated subtrees match rows *without* the needle text.
    if (filter.kind === "none") return;
    for (const child of filter.children) walkFilter(child, visit);
    return;
  }
  if (
    filter.operator !== containsFilterOperator &&
    filter.operator !== equalsFilterOperator &&
    filter.operator !== inSetFilterOperator
  ) {
    return;
  }
  const operand = filter.operand;
  const values =
    operand?.type === "set" ? operand.values.map(String) : operand?.type === "value" ? [String(operand.value)] : [];
  if (values.length) visit(String(filter.attribute), filter.operator, values);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
