# joix-wiki

## What does this crate provide?

An experimental wiki domain plugin for JOI applications. Register `wiki_plugin()`
alongside the server's core plugins; `examples/joix` already includes it.
It depends on `joi-server` for storage, commands, model metadata and timestamps,
and `joi-plugin` for registration. It does not depend on tickets or Codevette.

## How are wiki pages stored?

`wikipages` contains an immutable KSUID `id`, required `title`, rich-text HTML
`content`, `creator` (user reference), `authors` (reference list), `creation_date`
and `update_date`. Canonical labels, controls and validation are returned through
`model-info`; the UI plugin only identifies the entity by its branded ID.

Edits to an existing page are autosaved to a hidden `wikipage_drafts` table,
using the published page ID as the draft ID. Opening edit mode reuses an
existing draft or creates one from the published title and content. A separate
`wiki-publish` command copies the draft into the published page and removes it.
The `wiki-draft` command checks for unpublished edits without creating a draft.
Draft changes do not update published timestamps, attribution or history.

The attribution mutation contributor assigns the creator on insertion and adds
distinct editors to authors in first-contribution order. Real title/content
changes count; no-op saves do not. Replacement writes preserve attribution.
Clients cannot set creator/authors/timestamps. Automated writes use the reserved
`system` identity. Core timestamp contributions run after attribution.

## How is it used in the UI?

The auto-discovered `ui/src/plugins/wiki` plugin contributes **Wiki / Wiki pages**.
The standard master-detail view supports creating pages, filtering and author
facets. Selecting an existing page opens its dedicated read view. Editing there
autosaves a draft; **Publish** makes it visible. Pages with a draft show an
"Unpublished edits" note. User references display the server-defined user label.
The navigation entry can also be copied into My workspace.

## How do I run it and check it?

From the repository root:

```sh
./n dev
./t cargo test -p joix-wiki
./n check
./n cargo-test
```

The workspace-wide tasks include this crate automatically. No separate server or
wiki-specific task is required.
