# What belongs in development learnings?

Record reusable findings from development: surprising behavior, disproved
assumptions, complex debugging results, or performance and platform pitfalls.
Create an entry when its evidence could save someone from repeating the work.
Routine edits and untested guesses do not need a record.

Consult related entries before investigating unfamiliar behavior. Update an
existing entry when new evidence changes its conclusion or limits; preserve
useful context rather than silently replacing it. Link related
[decisions](../decisions/README.md) and plans instead of duplicating them.

# How are records named?

Use `YYYY-MM-DD Finding title.md`, with the date the finding was established.
Descriptive titles distinguish findings from the same day.

# What must each record contain?

- **Finding:** The observation, practical implication, and limits. Distinguish
  verified results from inference or hypothesis.
- **Context:** The task, original assumption, environment, relevant versions,
  and constraints.
- **Evidence:** Reproduction steps, tests, measurements, or logs, including
  expected and observed behavior.
- **References:** Relevant internal code, tests, plans, or commits, and external
  primary sources where applicable. State when either kind does not apply.

Keep secrets and sensitive raw logs out of records. Explain enough that a
finding remains useful if a link breaks.

# What template should I use?

```markdown
# What was discovered?

- Learned: YYYY-MM-DD

## What is the finding?

Observed behavior, practical implication, confidence, and limits.

## What is the context?

Task, original assumption, environment, versions, and constraints.

## What evidence supports the finding?

Reproduction steps, tests, commands, or measurements and their results.

## What references apply?

- Internal: Link relevant implementation or tests, or state that none applies.
- External: Link applicable primary sources, or state that none applies.
```
