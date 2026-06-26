# What does the current release process ship?

`joi-template` currently ships:

- workspace crates for the core library and CLI
- a GitHub release artifact containing the statically linked `joi-template-cli` binary for `x86_64-unknown-linux-musl`

# How are release versions managed?

The workspace currently uses a shared version from the root `Cargo.toml` workspace package metadata.
Both crates should move together until there is a clear reason to split versioning.

# How do I prepare a release?

Before cutting a release:

- update the workspace version in the root `Cargo.toml` if needed
- make sure `README.md` and relevant docs reflect the current state
- run `nao check`
- keep the git worktree clean before tagging

# How do I publish a release?

The current release workflow is GitHub-tag driven.
Push a tag that matches `v*` to trigger `.github/workflows/release.yml`.

That workflow:

- builds `joi-template-cli` for `x86_64-unknown-linux-musl`
- packages the binary together with `README.md`
- publishes a GitHub release with a tarball and SHA-256 checksum

# What is not automated yet?

Crates.io publishing is not wired up yet.
If that changes, document the versioning and publish process here before relying on tribal knowledge.

