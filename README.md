# joi-template

**A dynamic typesafe template engine written in Rust**

## Why yet another template engine?

joi-template aims to fill a nice not sufficiently adressed:

1. **Templates are type checked**. If names or types used in the template don't match the data model, that errors surfaces when validating the template, not later when trying to get the output.
2. **Templates are not fixed at compiled time**. Templates are not compiled into the program, but can be modified at any time without having to recompile.

All the template engines I could find satisfy either 1. or 2. but not both at the same time.

## How does it work?

1. A data model is defined, which describes the data to be used for templating.
2. The template files are parsed, and validated against this data model.
3. Data is loaded from a file and validated against the data model.
4. The loaded data is used to generate output files using the templates.

## What are the project priorities?

1. **Excellent user experience**: This means great documentation and helpful error messages.
2. **Understandable implementation**: To keep the implementation easy to maintain and debug, the implementation should be easy to understand.
3. **Well tested**: To ensure well-behaved operation and prevent regressions, a thorough test suite should ensure correctness.
