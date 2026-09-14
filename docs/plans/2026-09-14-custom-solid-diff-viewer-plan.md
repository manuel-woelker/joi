# Custom Solid Diff Viewer Plan

## What are we building?

Create a reusable SolidJS diff viewer under `ui/src/components/diff-viewer/`.
It will own its rendering and interaction model instead of wrapping
`@pierre/diffs`, while retaining the existing Codevette API data types for
patches and `ReviewComment` records.

The first integration is playground-only. Replace the scenarios in
`CommitDiff.demo.tsx` with equivalent scenarios for the custom viewer, but do
not replace `CommitReviewView` or remove `@pierre/diffs` yet. This allows the
custom implementation to prove correctness, interaction quality, and
performance before becoming production infrastructure.

The viewer has three areas:

- A fixed-width file tree on the left with a compact path filter.
- A virtualized diff viewport on the right.
- Inline comment threads and local editors inserted after their source line.

Start with a side-by-side presentation matching the current demo. Keep the
normalized model capable of representing unified output later, but do not add
a display-mode abstraction until there is a second implemented mode.

## Which patch parser should we use?

Use `parse-diff` behind a narrow adapter as the initial parser. It is a focused
unified-diff parser, has no runtime dependencies, includes TypeScript
declarations, and exposes files, hunks, additions/deletions, and per-side line
numbers. Its parser-only shape is a better architectural fit than importing a
second renderer. The package is currently maintained and widely used.

Before committing to it, add parser contract fixtures for:

- Modified, added, deleted, and renamed files.
- Multiple hunks and multiple files.
- Empty lines and `No newline at end of file` markers.
- Git paths containing spaces.
- Mode-only and binary changes, which should become non-renderable file rows.
- Malformed hunk counts, which should produce an explicit parse failure.

Keep the parser result private to `patch-parser.ts` and immediately normalize
it into Joi-owned types. If the fixtures expose unacceptable Git metadata
loss, use jsdiff's `parsePatch` instead. jsdiff explicitly models Git create,
delete, rename, copy, mode, and binary metadata, but its output requires more
line-number derivation and the package contains functionality unrelated to
parsing. Diff2Html is not recommended: although its `parse()` API is capable,
the package is designed around a complete HTML-rendering system and introduces
more surface than this component needs.

Sources consulted:

- `parse-diff`: https://www.npmjs.com/package/parse-diff
- jsdiff `parsePatch`: https://github.com/kpdecker/jsdiff
- Diff2Html parser and renderer: https://github.com/rtfpessoa/diff2html
- Current Pierre parser behavior: https://diffs.com/docs

## What should the internal model look like?

Define a normalized, renderer-independent model. Do not expose parser-library
objects from the adapter.

```ts
type DiffFileId = string & { readonly __diffFileId: unique symbol };
type DiffRowId = string & { readonly __diffRowId: unique symbol };

interface DiffDocument {
  readonly files: readonly DiffFileId[];
  readonly filesById: ReadonlyMap<DiffFileId, DiffFile>;
}

interface DiffFile {
  readonly id: DiffFileId;
  readonly oldPath?: string;
  readonly newPath?: string;
  readonly status: "modified" | "added" | "deleted" | "renamed" | "binary";
  readonly additions: number;
  readonly deletions: number;
  readonly hunks: readonly DiffHunk[];
}

interface DiffLine {
  readonly id: DiffRowId;
  readonly kind: "context" | "addition" | "deletion";
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: string;
}
```

Pair deletion/addition runs into visual side-by-side rows in a pure layout
step. Preserve the original `DiffLine` objects and line numbers so comments
remain addressed by the existing tuple of file path, one-based line, and
`DiffSide`. Give every file, hunk, visual row, comment row, and editor row a
stable branded ID; never use a virtual row index as identity.

Represent mode-only and binary files in the file tree and viewport with a
compact informational row rather than silently dropping them.

## What state should the viewer own?

Create a `DiffViewerStore` using Solid's `createStore`. Its public API should
express user operations rather than expose arbitrary mutation:

```ts
interface DiffViewerController {
  readonly state: DiffViewerState;
  setFileFilter(value: string): void;
  selectFile(id: DiffFileId): void;
  openCommentEditor(location: DiffLocation, parentId?: string): void;
  openCommentEdit(commentId: string): void;
  cancelCommentEdit(): void;
  saveComment(text: string): Promise<void>;
}
```

The store owns the parsed document, selected file, file-filter query, comment
collection, active editor descriptor, save state, and errors. It receives the
same backend-agnostic `ReviewCommentSource` contract used by the current
Codevette view. Continue using generated `ReviewComment` and
`ReviewCommentSaveRequest` types so the demo and production view share the
same persistence model.

Textarea content is local component state. Typing must not write into the
viewer store or rebuild virtual rows. Only opening/closing an editor and a
successful save are structural updates. Failed saves retain the local draft
and display an inline error.

Index comments by a canonical location key and parent ID. Build threads with
cycle/orphan protection; malformed parents become roots with a diagnostic in
development rather than disappearing.

## How should virtual scrolling work?

Reuse `@tanstack/solid-virtual`, already installed for `DataTable`. Flatten the
selected set of files into virtual items:

- File header.
- Hunk header.
- Paired source-code row.
- Comment thread following its anchored code row.
- Active comment editor following its anchor/thread.
- Binary or mode-only information row.

Use one scroll element for the diff viewport and `measureElement` for dynamic
comment/editor heights. Estimate fixed code rows accurately so scrolling stays
stable, and apply overscan sufficient for keyboard navigation without
rendering entire large patches. Keep the file tree outside this scroll element.

Maintain a `DiffRowId -> virtual index` map derived alongside the flattened
rows. Selecting a file scrolls to its header; opening a comment scrolls its
editor into view. Preserve the nearest stable row and pixel offset when a
comment save changes measured heights above the viewport.

Add a large-patch scenario with at least 20 files and 10,000 visual rows. Show
the rendered virtual-item count in a development-only demo control so the
scenario proves bounded DOM size rather than merely appearing scrollable.

## How should the file tree and filtering work?

Adapt diff paths into the existing normalized `TreeModel`:

- Path segments become folder nodes.
- Changed files become leaf nodes with status icons and addition/deletion
  counts.
- Renames display the destination path and retain the source path as secondary
  information.

The filter is a controlled compact input above the tree. Match
case-insensitively against the full destination-or-source path, with tokens
separated by whitespace and all tokens required. Keep matching files plus
their ancestors, auto-expand matching branches, and show a clear empty state.
Clearing the filter restores the user's prior expansion state.

Use the Tree component for hierarchy, expansion, roving keyboard focus, and
activation. File activation changes only selection and scroll position; it
must not rebuild the parsed diff or comment indexes.

## How should code and comments render?

Render code as semantic Solid components with CSS modules, not generated HTML.
Each side has a stable line-number gutter and code cell. Deletion and addition
bars use matching geometry with different semantic colors. Long lines scroll
horizontally inside the code area without moving line numbers or the file tree.

Clicking either line-number gutter opens a new comment editor on that exact
side and line. Do not make the complete code row behave like a button, because
users must be able to select code text normally. Add keyboard activation to
focused gutter buttons and accessible labels such as `Comment on new line 42`.

Render each thread in declaration/timestamp order. A comment shows its text on
top and author/timestamp underneath. The author gets a pen icon for editing;
every comment gets a reply icon. Use custom tooltips. Replies are indented but
cap visual indentation after a small depth so deeply nested threads retain
usable width. Editing replaces the selected comment body in place; replying
inserts the editor directly after the selected comment.

Do not add syntax highlighting in the first demo milestone. Preserve a clear
`renderCode(content, language)` boundary so Shiki or another tokenizer can be
added asynchronously later without changing parsing, comments, or
virtualization. Correct line layout and interaction are higher priority than
token colors.

## Implementation Checklist

- [ ] Add `parse-diff` to the UI and implement a private parser adapter that
      returns Joi-owned normalized diff types.
- [ ] Add parser fixtures for modified/added/deleted/renamed files, multiple
      hunks/files, special markers, spaces, binary/mode-only files, and invalid
      input; switch to jsdiff only if the documented fallback criteria occur.
- [ ] Add branded file/row IDs, canonical comment locations, side-by-side line
      pairing, and flattened virtual-row derivation as pure modules.
- [ ] Add `DiffViewerStore` with explicit selection, filtering, comment editor,
      save, and error operations using the existing review-comment API types.
- [ ] Index and assemble comment threads with deterministic ordering and
      orphan/cycle protection.
- [ ] Implement the file-tree adapter and quick-filter input using the existing
      Tree component, including auto-expansion and empty results.
- [ ] Implement the two-column viewer shell with a non-scrolling file panel and
      independently scrolling diff viewport.
- [ ] Implement virtual file/hunk/code/comment/editor rows with TanStack
      Virtual, dynamic measurement, overscan, and stable scroll anchoring.
- [ ] Implement side-by-side code rows, fixed gutters, symmetric change bars,
      horizontal code scrolling, text selection, and accessible line-comment
      controls.
- [ ] Implement Solid comment threads with text-first presentation, metadata,
      pen/reply icon actions, custom tooltips, local textarea drafts, and
      inline save errors.
- [ ] Add file selection and filtered-file keyboard interaction, including
      scrolling the selected file header into view.
- [ ] Create playground scenarios based on the existing demo: multiple files,
      long lines, removed file, comments with nested replies, add/edit/reply
      interactions, empty patch, malformed patch, quick filtering, and a large
      virtualized patch.
- [ ] Add focused tests for parser normalization, line pairing, stable IDs,
      filtering, thread assembly, store transitions, failed saves, local draft
      isolation, virtual-row flattening, and comment accessibility.
- [ ] Add component integration tests for file-tree navigation, add/edit/reply
      flows, focus retention, and bounded rendered row counts.
- [ ] Measure parse time, initial render time, comment-open latency, and scroll
      behavior in the large demo; document measured baselines in the plan's
      implementation record.
- [ ] Run UI tests, type checking, and production build, then run `nao check`
      and restart active development tasks with `nao --restart`.

## How will we verify it?

- Existing demo patches normalize without warnings and retain exact old/new
  line numbers, paths, file statuses, and change totals.
- Filtering a path leaves only matching files and ancestors, while clearing it
  restores prior expansion and selecting a result scrolls to the correct file.
- The 10,000-row scenario keeps DOM row count bounded and remains responsive
  while scrolling, opening an editor, typing, cancelling, and saving.
- Typing into a comment editor does not mutate the viewer store or recreate
  code rows; only structural comment operations update virtual items.
- Comments remain attached to the correct file, side, and line; authors can
  edit their own comments and any signed-in user can reply.
- Keyboard and pointer users can select files and add, edit, cancel, save, and
  reply without focus loss or accidental line activation.
- The playground contains no production backend dependency and all scenarios
  use deterministic in-memory comment sources.
- The existing Pierre-based production commit view is unchanged during this
  phase, providing a direct comparison and rollback path.

## What assumptions and risks remain?

- The server currently excludes binary patches, but the parser/viewer should
  still model binary and mode-only entries to avoid baking that transport
  choice into reusable UI infrastructure.
- Side-by-side pairing is presentation logic, not parser logic. Naively zipping
  additions and deletions can associate unrelated lines; pair contiguous
  change runs deterministically and preserve source order without claiming
  semantic correspondence.
- Dynamic virtual rows can jump when comments change height. Stable row IDs,
  measurement, and explicit scroll anchoring are required before considering
  virtualization complete.
- A complete custom renderer trades Pierre integration fragility for ownership
  of diff layout, accessibility, and edge cases. The parser fixture suite and
  playground-only rollout are the guardrails against silently losing behavior.
- Syntax highlighting can be expensive and complicates virtualization. It is
  intentionally deferred until the custom viewer demonstrates correct layout
  and interaction under load.
- The first version loads the full patch before parsing. Incremental parsing or
  server-side file loading should be considered only after measurements show
  the 200-commit or large-file workflows need it.
