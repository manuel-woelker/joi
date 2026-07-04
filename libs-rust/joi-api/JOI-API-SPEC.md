# JOI API Definition Language

This document specifies the initial draft of the JOI API definition language.
The language describes data models and API operations independently of any
transport or generated programming language.

The syntax may evolve while the parser and generators are being implemented.

## How is a file structured?

Each file declares one module followed by any number of models and operations.
Declarations are visible throughout the module regardless of their order.

```joi-api
module ticket;

model Ticket {
    id: id<Ticket>;
    title: string;
}
```

A module name provides the namespace used by generated code. A file must
contain exactly one `module` declaration.

## How are comments and documentation written?

`//` starts an ordinary line comment. The comment continues to the end of the
line and is not included in generated API documentation.

```joi-api
// Implementation note: IDs are supplied by the caller.
command create(ticket: Ticket)
```

`///` starts a documentation line. Consecutive documentation lines form one
block that attaches to the module, model, field, command, query, parameter, or
return field immediately following it.

```joi-api
/// A support ticket submitted by a user.
///
/// Tickets use caller-provided identifiers.
model Ticket {
    /// Stable ticket identifier.
    id: id<Ticket>;
}
```

An empty `///` line creates a paragraph break. One optional space immediately
after `///` is removed; all remaining text is preserved for documentation
renderers.

A physical blank line or ordinary `//` comment between a documentation block
and a declaration breaks attachment. Documentation comments after a declaration
on the same line are not supported. A documentation block that cannot attach to
a supported declaration is invalid.

The first three slashes are the documentation marker. Any additional slash is
part of the text, so `//// note` documents `/ note`.

## How are models declared?

A model is a named record with zero or more fields. Each field has a name and a
type, and ends with a semicolon.

```joi-api
model Ticket {
    id: id<Ticket>;
    title: string;
    description: string;
}
```

Model names should use `PascalCase`. Field names should use `camelCase`.
Generators translate these names to idiomatic target-language names where
necessary.

## Which types are available?

`string` represents text.

```joi-api
title: string;
```

`id<Model>` represents an identifier associated with a particular model. IDs
are nominally typed: an `id<Ticket>` is not interchangeable with an ID for a
different model, even if both use the same runtime representation.

```joi-api
ticketId: id<Ticket>;
```

`list<Type>` represents an ordered sequence of values.

```joi-api
ticketIds: list<id<Ticket>>;
```

`optional<Type>` represents a value that may be absent.

```joi-api
description: optional<string>;
```

Types may be nested, such as `list<optional<string>>`.

## How are derived model types written?

`partialExcept<"field", Model>` derives a model in which every field is
optional except the named field. The field name must exist on the referenced
model.

```joi-api
command update(
    tickets: list<partialExcept<"id", Ticket>>,
)
```

Here, every update must contain `id`, while the other `Ticket` fields may be
omitted. Derived types are structural inputs and do not declare new named
models.

## How are operations declared?

An operation has a kind, name, parameter list, and optional return record.
Parameters are separated by commas; a trailing comma is allowed.

```joi-api
command delete(
    ticketIds: list<id<Ticket>>,
)
```

An operation without `returns` has no application value on success. Operation
errors are implicit in this draft and are not declared in the definition file.

Operation names and parameter names should use `camelCase`.

## What is a command?

A `command` may change state. Commands are atomic: either the complete command
succeeds or it has no effect.

```joi-api
command create(
    tickets: list<Ticket>,
)
```

Atomicity is part of the API contract. Generated code exposes that contract,
but the service implementation is responsible for enforcing it.

## What is a query?

A `query` reads state and must not change it.

```joi-api
query get(
    ticketIds: list<id<Ticket>>,
) returns {
    tickets: list<Ticket>;
}
```

The fields inside `returns` form the operation's success value. Their syntax is
the same as model fields.

Details such as ordering, missing records, and duplicate handling are part of
an individual operation's contract. They should be documented with `///`
comments until the language defines machine-readable constraints for them.

## What is not specified yet?

This draft does not yet define:

- Scalar types beyond `string`.
- Enumerations or unions.
- Imports or references between modules.
- Constraints and validation rules.
- Explicit error types.
- Transport or serialization behavior.
- Target-language type mappings.
- Compatibility and versioning rules.

These features should be added when their semantics and generator requirements
are understood, rather than reserved speculatively.
