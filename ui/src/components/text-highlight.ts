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
 * Derives per-attribute highlight needles only from committed quicksearch
 * inputs. Global search tokens apply to the given attributes; column search
 * tokens apply only to their own column. Filter and facet values do not
 * contribute highlight needles.
 */
export function deriveColumnHighlights(
  search: string,
  stringAttributes: readonly string[],
  columnSearch: Readonly<Record<string, string>> = {},
): ReadonlyMap<string, readonly CompiledTextNeedle[]> {
  const specs = new Map<string, TextNeedleSpec[]>();
  const add = (attribute: string, spec: TextNeedleSpec) => {
    const entries = specs.get(attribute) ?? [];
    entries.push(spec);
    specs.set(attribute, entries);
  };
  for (const token of tokenizeHighlightText(search)) {
    for (const attribute of stringAttributes) add(attribute, { text: token, wholeWord: true });
  }
  // Per-column terms highlight only their own column, like the global term.
  for (const [attribute, term] of Object.entries(columnSearch)) {
    for (const token of tokenizeHighlightText(term)) add(attribute, { text: token, wholeWord: true });
  }
  const compiled = new Map<string, readonly CompiledTextNeedle[]>();
  for (const [attribute, entries] of specs) {
    const needles = compileNeedles(entries);
    if (needles.length) compiled.set(attribute, needles);
  }
  return compiled;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
