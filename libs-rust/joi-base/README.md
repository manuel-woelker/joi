# joi-base

`joi-base` contains foundational types shared by JOI libraries.

The crate currently provides `JoiString`, the common compact, cheaply clonable
owned string representation used for stored text, and `JoiRwLock`, the shared
reader-writer lock type used by concurrently accessible JOI data structures.

## Status

Experimental and intended for use by other libraries in this repository.

## Commands

```sh
cargo test --manifest-path libs-rust/joi-base/Cargo.toml
cargo fmt --manifest-path libs-rust/joi-base/Cargo.toml --check
```
