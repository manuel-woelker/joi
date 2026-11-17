# Domain Architecture

## What belongs in a domain?

A domain declares its entities and the actions users or other systems can
perform on those entities. It owns domain names, attributes, relationships,
action inputs, and domain rules. A domain is declarative: it does not implement
generic persistence, transport, UI rendering, or action dispatch.

The grades domain in [`domains/grades`](../domains/grades/README.md) currently
declares entities only. The action-definition API and action declarations are a
future step, not an implemented part of the shared contract yet.

## Where is the shared interface?

[`@joi/domain`](../libs-ts/joi-domain/README.md) is the interface between
domain packages and infrastructure. It owns `defineEntity`, the `Types`
constructors, and the corresponding support types. `defineEntity` returns a
branded reference that another declaration can use through `Types.ref`.
Domain packages import this contract rather than copying its implementation.

## How do domains reach infrastructure?

A composition root loads domain declarations and passes them to generic
infrastructure. Infrastructure interprets the shared contract to provide
storage, validation, APIs, or UI. It depends on `@joi/domain`, not on a
particular domain package. Domain packages likewise do not import
infrastructure. This keeps domain definitions usable by different runtimes.

The arrows in the architecture diagram ([D2 source](domain-architecture.d2),
[draw.io version](domain-architecture.drawio)) distinguish code dependencies
from composition: both sides import the shared contract; the composition root
loads domains and configures infrastructure.

Render the D2 source with `./t d2 docs/domain-architecture.d2 output.svg` from
the repository root.
