# What problem is this plan solving?

`joi-template` has its own schema representation through `schema::DataType`, but users often already describe data shapes with JSON Schema.

This work should let users define a `joi-template` schema from a JSON Schema document for the subset that maps cleanly to the current type model.
The goal is import support, not full JSON Schema validation.

# What should the first version support?

The first version should convert the common structural subset:

- JSON Schema `type: "string"` to `DataType::Primitive(PrimitiveType::String)`
- JSON Schema `type: "integer"` to `DataType::Primitive(PrimitiveType::Integer)`
- JSON Schema `type: "number"` to `DataType::Primitive(PrimitiveType::Float)`
- JSON Schema `type: "boolean"` to `DataType::Primitive(PrimitiveType::Boolean)`
- JSON Schema `type: "object"` with `properties` to `DataType::Struct`
- JSON Schema `type: "array"` with a single schema in `items` to `DataType::List`

Unsupported JSON Schema features should fail with a clear conversion error instead of being ignored.
That includes `$ref`, `oneOf`, `anyOf`, `allOf`, tuple-style array `items`, union `type` arrays, `null`, `enum`, `const`, validation-only constraints, and object constraints that the current `DataType` cannot represent.

# What API should be added?

Add a focused conversion API under the `schema` module:

- `JsonSchemaError`, a concrete error type for parse and conversion failures
- `DataType::from_json_schema_str(source: &str) -> Result<DataType, JsonSchemaError>`
- `DataType::from_json_schema_value(value: serde_json::Value) -> Result<DataType, JsonSchemaError>`

If borrowing is useful during implementation, an internal helper may accept `&serde_json::Value`, but the public API should stay simple.

# How should the implementation be structured?

Add a small `schema/json_schema.rs` module that owns JSON Schema conversion.
Keep it separate from the core schema structs so the basic type model remains easy to read.

Add `serde_json` as a dependency for parsing and structured traversal.
Avoid pulling in a full JSON Schema validator in the first pass because the feature is schema import, not document validation.

The conversion should:

- parse a JSON document into `serde_json::Value`
- require the root to be an object
- read and validate the `type` field
- recursively convert object properties and array items
- preserve property names in `Field`
- return path-aware errors where practical, such as `$.properties.user.properties.name.type`

# What is the test strategy?

Tests should be colocated with the JSON Schema conversion module and focus on public behavior.

Use data-driven tests for successful primitive conversions.
Add targeted tests for nested objects, arrays of primitives, arrays of structs, malformed JSON, missing `type`, unsupported type arrays, unsupported `$ref`, tuple-style `items`, and validation keywords that cannot be represented.

Tests should assert both the returned `DataType` and useful error information for failures.
The failure assertions do not need to overfit exact prose, but they should verify the kind of failure and the JSON path when available.

# What is the implementation order?

1. Add the `serde_json` dependency to `crates/joi-template`.
2. Add `schema::JsonSchemaError` with variants for invalid JSON, invalid shape, unsupported feature, and unsupported type.
3. Add the `schema/json_schema.rs` conversion module and export the error type.
4. Implement primitive type conversion.
5. Implement object conversion through `properties`.
6. Implement array conversion for single-schema `items`.
7. Add RustDoc examples for the new public conversion methods.
8. Update README and `docs/EXAMPLES.md` with a short JSON Schema import example.
9. Run the planned verification.

# What needs to be verified?

- [x] Add data-driven primitive conversion tests.
- [x] Add nested object conversion tests.
- [x] Add list conversion tests for primitive and struct item schemas.
- [x] Add malformed JSON and non-object root tests.
- [x] Add unsupported feature tests for `$ref`, union `type`, tuple `items`, and validation-only constraints.
- [x] Add RustDoc coverage for the public JSON Schema import API.
- [x] Run `nao check`.

# What was implemented?

The completed implementation adds `serde_json`, `schema::JsonSchemaError`, and `DataType::from_json_schema_str` / `DataType::from_json_schema_value`.

The importer supports primitive types, objects with `properties`, and arrays with a single item schema.
Unsupported JSON Schema features fail explicitly with path-aware errors where practical.

Verification completed with:

- `cargo fmt --all`
- `cargo test --workspace --all-targets --all-features`
- `nao check`

# What assumptions or risks need attention?

- Assumption: JSON Schema import should map to `DataType` only; it should not introduce runtime data validation yet.
- Assumption: unsupported JSON Schema keywords should be rejected when they could make the imported schema misleading.
- Risk: rejecting validation keywords like `minLength` may surprise users, but silently dropping them is worse because it creates false confidence.
- Risk: `$ref` support will likely require resolver design, source identifiers, and cycle detection; it should be a follow-up plan.
- Open question: should object properties be treated as all available fields regardless of JSON Schema `required`, or should required/optional fields be added to `Field` first?
- Open question: should JSON Schema `number` map to `Float`, or should the schema model eventually use a broader numeric representation?
