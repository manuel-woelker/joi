# joi-architecture

## What does it do?

This experimental Rust crate collects self-described software components into a
JSON-ready graph. It is intended for applications and libraries that want to
publish a snapshot of their running architecture. It uses Serde for graph
serialization and `serde_json` for configuration and numeric metric values.

## How do I describe a component?

Implement `ArchitectureComponent` and register one stable ID, label, and
description. Use the registration callback to select configuration values for
publication, read existing metrics, and describe related components. Each
callback runs once per graph. Reuse the same component reference for shared
targets and give distinct instances distinct IDs.

```rust
use joi_architecture::{
    ArchitectureComponent, ArchitectureContext, ArchitectureError, ArchitectureGraph,
};

struct Worker {
    concurrency: u32,
}

impl ArchitectureComponent for Worker {
    fn describe<'a>(
        &'a self,
        context: &mut ArchitectureContext<'_, 'a>,
    ) -> Result<(), ArchitectureError> {
        context.component("worker", "Job worker", "Runs background jobs.", |details| {
            details.config("concurrency", self.concurrency);
            Ok(())
        })
    }
}

let worker = Worker { concurrency: 4 };
let graph = ArchitectureGraph::collect([&worker as &dyn ArchitectureComponent]).unwrap();
println!("{}", serde_json::to_string(&graph).unwrap());
```

Use `details.relate("uses", &self.dependency)?` inside the callback to describe
a dependency and add an outgoing relationship. The JSON response contains a
`components` array sorted by ID. Optional values and outgoing relationships
appear when populated.

## How do I build and test it?

Run `./t cargo build -p joi-architecture` and
`./t cargo test -p joi-architecture` from the repository root.
