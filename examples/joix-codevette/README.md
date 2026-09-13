# joix-codevette

`joix-codevette` is an experimental server plugin for trunk-based code review.
It contributes the discoverable repository model used by the Codevette UI
plugin.

## What does the plugin provide?

The plugin defines a `repositories` table with an immutable KSUID `id`, stable
`key`, human-readable `name`, and local filesystem `path`. Application binaries
compose the plugin by calling `joix_codevette::codevette_plugin()`.

## How do I check it?

Run the repository checks from the root:

```bash
./n check
```
