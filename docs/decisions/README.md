# Where are decisions recorded?

This directory preserves significant technical and product choices. Follow
[DR-000](<DR-000 Record decisions in the repository.md>) for numbering, content,
acceptance, and supersession. Use the next unused `DR-NNN Decision title.md`
identifier; never renumber or reuse an identifier.

# Which decisions are recorded?

| Record | Decision | Status |
| --- | --- | --- |
| [DR-000](<DR-000 Record decisions in the repository.md>) | Record decisions in the repository | Accepted |

# When should I create or consult a record?

Consult relevant records before changing architecture, public APIs, project
conventions, or product behavior. Add a record when a significant choice needs
durable rationale, especially when reversing it would be costly. Routine edits
and individual bug fixes do not automatically need one.

Plans describe implementation steps; [learnings](../learnings/README.md)
preserve observed evidence. Link these documents instead of duplicating them.

# How should past decisions be documented?

Ground retrospective records in implementation, plans, or commits. Identify
which details are supported and which rationale or alternatives are reconstructed.
When the original decision date is unknown, use the date this account was
accepted and explain what that date means. Do not present abandoned plan details
as current behavior.

# What template should I use?

```markdown
# DR-NNN: Decision title

- Status: Proposed
- Date: YYYY-MM-DD

## What is the decision?

The concrete choice and its scope.

## Why was this chosen?

Requirements, rationale, and tradeoffs.

## What is the context?

The problem, assumptions, and links to supporting evidence.

## What are the consequences?

Benefits, costs, risks, and follow-up work.

## What alternatives were considered?

Plausible alternatives and why they were not chosen.
```
