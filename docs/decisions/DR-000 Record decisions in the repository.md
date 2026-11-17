# DR-000: Record decisions in the repository

- Status: Accepted
- Date: 2026-11-17

## What is the decision?

Record significant technical and product decisions in `docs/decisions/` as
Markdown. Use sequential `DR-NNN Decision title.md` identifiers, starting at
`DR-000`. Keep identifiers stable even when a proposal is rejected or superseded.

Each record states its status and status date, concrete decision, rationale,
context, consequences, and considered alternatives with reasons for not choosing
them. Use the question-driven headings in the [guide](README.md).

Review records alongside implementation. A proposal becomes Accepted only when
the choice is agreed upon; writing it does not establish acceptance. Keep
accepted records as historical accounts. When a choice changes, create a new
record, mark the earlier one Superseded, update its status date, and link the
records in both directions. Resolve identifier collisions before merging.

For retrospective records, cite supporting code, plans, or commits. State when
rationale or alternatives are reconstructed, and do not invent an original
acceptance date. The status date may be the date this account was accepted, with
that meaning made explicit. Current code and tests determine implemented behavior.

## Why was this chosen?

Versioned records keep reasoning and tradeoffs discoverable with the code.
Preserving superseded records explains how the design evolved.

## What is the context?

Joi has implementation plans and repository guidance, but no shared convention
for recording durable architectural choices. This convention is adapted from
Ocelot at the user's request; it does not retroactively accept past decisions.

## What are the consequences?

Significant choices become reviewable and searchable. Authors must maintain
status, references, and successor links. Routine work needs no record, and no
new tooling is required.

## What alternatives were considered?

- **Conversations or commit messages alone:** Reasoning is harder to find and
  often omits consequences and alternatives.
- **An external wiki:** Separates decisions from code review and version history.
- **A record for every change:** Routine entries would obscure significant ones.
