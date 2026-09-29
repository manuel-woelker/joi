# Rich-Text Entity Links

## What is the goal?

Let wiki authors link to pages, tickets, users, commits, and later domain types
with `[[type:key]]` or `[[type:key|label]]`. Typing `[[` or choosing Insert link
opens an inline, searchable target picker. Plugins own target search and link
resolution; `RichTextEditor` owns only editing, selection, and picker UI.

Keep ordinary external URLs in the existing link control. Do not make the
editor import the plugin registry, entity models, generated commands, or
domain-specific routes.

## What exists today?

- `RichTextEditor` uses Tiptap with a basic safe-URL link mark and a toolbar URL
  form. Wiki read mode sanitizes HTML and retains safe `#:namespace:key` links.
- `entity_keys` and `entity-key-resolve` map a human alias such as `wiki:Start`
  to an immutable entity ID. Entity pages also support model-defined public
  keys, such as `ticket:TEST-123`.
- UI plugins register typed extensions in two phases. The shell exposes the
  immutable registry; search and lookup services already show the pattern for
  collecting extensions. The existing `Select` supports async entries and an
  unclipped portal, but its input/selection behavior may not suit a caret popup.
- Codevette commit review currently routes through a branch ID plus commit
  SHA. Users currently route by immutable ID, not username.

## What is the link contract?

Use a canonical reference string `type:key`, splitting only at the first `:`.
Lowercase `type` identifies one registered provider; preserve key case. The
optional `|label` is literal display text. Reserve `|`, `[[`, and `]]` in v1
keys/labels rather than introducing an escaping language; the picker can insert
labels containing ordinary punctuation. Reject empty type or key.

Persist selected links as ordinary anchors with a validated canonical reference
and fallback URL, for example:

```html
<a data-joi-ref="wiki:Start" href="#:wiki:Start">Start</a>
```

The editor converts `[[...]]` to a link mark; raw bracket syntax is not stored.
The displayed label is a snapshot, so documents remain readable offline and
when a target is deleted. Explicit labels are never silently rewritten. On
read, missing targets keep their text and get a non-disruptive unavailable
state; they do not break the whole page. Resolve or enrich links lazily and in
batches/cached groups, not with one request per link per render.

## How do plugins participate?

Add one typed `linkTargetProviders` UI extension point. A contribution declares
a unique `type`, a human label/icon, `resolve(keys, signal)` and optional
`search(query, signal, limit)`. Resolution accepts a bounded list of keys and
returns a result for each, including explicit missing results. A resolved
target supplies a safe href, display label, and optional description/icon.
Search returns bounded
candidates containing the same stable reference and display metadata. Providers
must not return raw HTML. Validate duplicate types at registry build time.

Build a `LinkService` once from the immutable registry. It parses references,
groups keys by provider for batched resolution, aggregates searches across searchable
providers, caps results, caches successful resolutions, and ignores/aborts stale
searches. Search with an explicit `type:` prefix only queries that provider;
unqualified search fans out with bounded concurrency. Cache lifetime is scoped
to the signed-in session and invalidated on logout or relevant data changes.
Provider failures appear as retryable picker errors without hiding other
providers' results. No global mutable registry inside the editor.

Inject a narrow `LinkPickerSource` (search, resolve, create safe link) through an
optional editor prop or a thin application wrapper. Playground demos supply a
fake source. The reusable editor knows only candidate IDs, labels, descriptions,
icons, and hrefs. A core links plugin registers the extension point and builds
the service; domain plugins register their own providers.

Start with these extensions:

- Wiki: search titles and resolve `wiki:<alias>` through a batched form of
  `entity-key-resolve` (or a new bulk command), not one request per link.
- Tickets: search key/title and resolve public `ticket:<key>` links without
  copying every ticket into `entity_keys`.
- Users: search username/name; resolve a username to the current immutable ID.
  Do not assume the current user route accepts usernames.
- Commits: search repository-qualified commit subjects/SHAs and resolve a full
  SHA. Prefer `commit:<repo-key>@<full-sha>` and add a repository-scoped commit
  route instead of persisting a branch ID in a document; see the open question
  below.

Server queries/commands used by providers must be bounded and authenticated.
Resolution is a navigation aid, not an authorization bypass; failed access and
deleted targets must be handled as unavailable.

## How should editing work?

- Typing `[[` opens a caret-anchored picker; subsequent typing filters results.
  `wiki:` narrows the provider, and Enter or click inserts a link using the
  selected target. Escape closes without changing text. No selection is lost
  while the popup/input is focused.
- Support keyboard Up/Down, Enter, Escape, loading, empty, and retry states.
  Debounce remote searches briefly, abort stale requests, and do not load whole
  large tables for local filtering. Portal the popup so cropped panes do not
  hide it; keep it inside the viewport on narrow screens.
- Allow the toolbar to open the same picker for selected text, and retain the
  ordinary URL form for external links. Selecting an existing internal link
  allows changing its target or label, and unlinking leaves its text intact.
- Normalize pasted `[[type:key]]` text and existing supported internal anchors
  to the same mark. Preserve unknown references as text/links rather than
  deleting content. Keep undo/redo and autosave as one logical edit per insert.
- Extend HTML parsing/sanitizing to preserve only validated `data-joi-ref` and
  safe href pairs. Never trust stored hrefs or permit `javascript:` URLs;
  escape labels. External links keep their current safe-URL behavior.

## What are the implementation steps?

- [ ] Define and test the reference grammar, link mark HTML round-trip, safe
      href generation, and malformed/unknown-reference behavior.
- [ ] Add the typed extension point and session-scoped `LinkService`, with
      duplicate-provider checks, bounded search, cancellation, caching, and
      clear failure semantics. Register it through the core links plugin.
- [ ] Add the generic caret/toolbar picker interface to `RichTextEditor` with
      keyboard navigation, anchored unclipped popup, selection preservation,
      link editing/unlinking, and no registry/backend imports.
- [ ] Implement wiki, ticket, and user provider extensions using existing
      generated commands/query APIs. Add the Codevette provider and stable
      repository-scoped commit navigation after resolving the route question.
- [ ] Update the wiki read renderer/sanitizer to display internal links safely
      and handle missing targets. Avoid N+1 resolution when rendering a page.
- [ ] Add playground scenarios for typing, search, explicit labels, external
      links, slow/error responses, missing targets, and many links. Document
      syntax and extension authoring in the UI/server docs.

## How will this be verified?

- Pure tests for parsing, case/colon rules, labels, safe hrefs, HTML round-trip,
  and rejection of unsafe attributes/URLs.
- Service tests for duplicate providers, typed and untyped searches, result
  limits, stale response cancellation, cache invalidation, missing targets,
  and partial provider failures.
- Editor tests for keyboard/pointer insertion, selection retention, undo/redo,
  paste, editing/unlinking, and focus across portal boundaries; verify autosave
  sees the final HTML once per action.
- Integration tests for wiki/ticket/user/commit links from saved wiki content,
  including direct navigation, deleted targets, and session changes. Check that
  one page with many links does not issue one request per rendered link.
- Run focused checks through `./t`, then `./n check` and `./n --restart`.
  Leave visual browser verification to the user, per their existing preference.

## What assumptions and questions remain?

- **Assumption:** link references are stable names, while visible labels are
  snapshots. Renaming a target does not rewrite published wiki HTML.
- **Assumption:** a single extension point with optional search keeps provider
  registration lean. Split search and resolution only if a real provider needs
  one without the other beyond the optional method.
- **Decision needed for commits:** use `repo-key@full-sha` and add a branch-
  independent review route, or require a branch in every link? The former is
  recommended because a commit can appear on multiple branches.
- Usernames and wiki aliases may eventually be renamed. Decide whether old
  links remain as aliases before adding rename UI; do not silently reassign an
  alias to a different entity.
