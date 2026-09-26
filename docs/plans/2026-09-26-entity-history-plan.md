# Transactional Entity History

## What is the goal?

Optionally record entity creation, updates, and deletion in separate key/value
buckets, atomically with entity writes. Add a generic mutation extension point
to `IndexedDataStore`, enable history for projects and tickets, and expose a
read-only history view in the generic master-detail detail pane.

Do not add history to Tantivy, implement event sourcing, or change the existing
per-chunk transaction boundary. History is an audit trail, not the source used
to reconstruct the live entity store.

## What exists today?

- `libs-rust/joi-server/src/storage.rs` validates mutation declarations, splits
  steps into single-table chunks of up to 50,000 rows, computes final entities
  in `build_chunk`, and commits entity writes plus one dirty entry in
  `commit_chunk`. It indexes those in-memory entities, then removes the marker.
- `KeyValueStore::mutate` already supports atomic operations across buckets.
  `query_range` is unbounded; `query_page` is bounded but not prefix-constrained.
- `CommandContext` contains authenticated `CommandUser { id, username }`, but
  `MutateCommand` currently discards it and `DataStoreMutation` has no actor.
- Server plugins contribute traits through `joi-plugin`; the registry is built
  before storage initialization and test-data insertion.
- Master-detail and record-editor stores own UI logic. Generated commands,
  data-change notifications, lookup services, and reusable Tabs are available.

## What is the history contract?

Define documented server-side history types and matching generated wire types:

```text
HistoryEntry {
  id: KSUID,
  userid: user ID, or the reserved string "system" for system work,
  timestamp: UTC ISO8601 timestamp,
  entityId: entity ID,
  type: Create | Update | Delete,
  changes: [{ key, oldValue?, newValue? }]
}
```

- One entry per actually changed entity per mutation step/chunk, not per field.
  Sort changes by attribute key for predictable display and testing.
- Creation records all present attributes with only `newValue`; deletion records
  all old attributes with only `oldValue`; updates record only unequal attributes.
  Equal-value updates and deletion of an absent entity produce no history.
- Missing values mean absent attributes. JSON `null` is a present value and must
  remain distinguishable from an omitted `oldValue` or `newValue`, including
  through serialization and deserialization. Use presence-aware serde handling;
  plain deserialization of `Option<JsonValue>` conflates null and absence.
- Preserve the current insert-as-set behavior: inserting over an existing ID
  records the actual Update, not a misleading Create. Repeated IDs within a
  chunk need an in-memory working state so each observation sees the preceding
  change, rather than repeatedly reading the original persisted value.
- History begins when enabled. Do not fabricate past entries for existing rows.
  Entries survive entity deletion. No retention or history-editing API in scope.

## How do extensions participate in transactions?

Add an object-safe `MutationContributor: Send + Sync` extension point in the server
crate. Its small API should support table-interest selection and inspection of
a prepared chunk, with a collector for additional KV entries:

```text
applies_to(table) -> bool
contribute(context, entityMutations, additionalEntries) -> JoiResult<()>

MutationContext { userid: required user ID, user: optional authenticated user, timestamp }
EntityMutation { table, entityId, type, oldValue?, newValue?, changes }
```

The old/new entity values are complete attribute maps; `changes` contains changed
keys and their optional old/new values. Borrow prepared maps/slices where possible
instead of cloning full entities for every contributor. Compute this information
only for tables with applicable contributors; in particular, do not add old-value
reads to unrelated delete/insert paths.

Contributors are synchronous preparation hooks, not post-commit event handlers.
They receive no mutable store, cannot recursively mutate entities, and must not
perform external side effects. They add entries only to declared, exclusively
owned auxiliary buckets. Validate bucket ownership at initialization and reject
entity/dirty/index-state bucket collisions and duplicate output keys. The
collector exposes additions, not arbitrary deletes or replacement entity writes.

Register the extension point in the server plugin. Supply the immutable registry
to `IndexedDataStore` before seed mutations; use existing registry ownership
patterns without a registry/store reference cycle. Stores constructed in tests
may have no contributors. Provide a reusable history contributor configured with table
names; the tickets plugin enables it for `projects` and `tickets`.

Pass a transport-independent mutation context explicitly to `DataStore::mutate`
(and update all implementations/callers). Derive the user from `CommandContext`
on the server, never from request JSON. HTTP/domain commands, including test-data
generation, must forward the invoking user; startup and anonymous CLI work use
an explicit system context with `userid = "system"`. Context constructors derive
the ID from the authenticated user or select the reserved system ID; callers
cannot supply conflicting identity fields. History `userid` is always present
and non-null. Reserve `system` against ordinary account IDs and display it as
System without a user-table lookup. Do not store a mutable "current user" on the shared
data store. Reuse or extract the existing user identity type without importing
HTTP concerns into storage.

## What is the exact write and recovery workflow?

For each existing single-table chunk:

1. Compute old and final entity states, actual changes, and indexing payloads.
2. Invoke applicable contributors and collect their additional entries. A contributor
   error aborts this chunk before anything is written.
3. Submit entity Set/Remove, the one dirty-entry Set, and grouped contributor Sets
   in **one** `KeyValueStore::mutate` call. Replace the current "exactly two
   operations" comment with this expanded atomic contract.
4. Index the already computed entities and remove the dirty marker on success.

No rereading entities for indexing and no separate history write. A KV failure
commits neither entity, marker, nor history. An indexing/cleanup failure leaves
entity and history durable alongside the marker. Dirty replay and index rebuilds
only repair the index; they never invoke contributors. Earlier successful chunks
remain committed if a later chunk fails, as today.

## Where are entries stored and how are they read?

Use one reserved history bucket per entity table, for example
`history_projects` and `history_tickets`. Within it, use the requested key:

```text
<entity_id>:<history_id>
```

Encode both IDs canonically as KSUID strings for the initial enabled tables;
serialize the entry as JSON bytes. Bucket separation prevents cross-entity-type
ID collisions and avoids adding a table discriminator to every entry. History
buckets are not registered entity tables and cannot be queried or mutated through
the public generic entity commands.

Centralize key encoding, cursor validation, and prefix upper-bound calculation.
For these canonical IDs, use the exact `entity_id + ':'` prefix and an exclusive
lexicographic successor as the range end. Do not scan the whole bucket, and do not
use an unbounded `query_range` then truncate in memory. Add a focused bounded
range-page operation to the KV abstraction/redb implementation, supporting reverse
iteration and an exclusive cursor for newest-key-first history pages.

Expose a narrow history-read operation through the datastore abstraction so the
command handler does not downcast storage or open a second redb database handle.
Add a generated `entity-history` command taking table, entity ID, page limit, and
optional cursor; return entries, next cursor, and whether history is enabled.
Clamp page sizes (default 50, maximum 200), validate the requested registered
table and entity ID, and use the application's session/access checks. Do not
require the entity to still exist to retrieve its retained history.

KSUID order is roughly chronological, not strictly ordered within one second.
Document pagination as descending key order and display the precise timestamp;
do not promise exact mutation ordering or treat KSUID order as a transaction
sequence. A request-wide rollback and retry-idempotency protocol are out of scope.

## How is history shown in master-detail?

- Add Details/History tabs to the existing record detail pane using Tabs. Keep
  creation mode unchanged; hide History for types without history support.
  Expose server-derived support through model metadata rather than hardcoding
  ticket/project names in generic UI components.
- Add a small history store composed with the master-detail/editor stores. It
  owns enabled state, active tab, record identity, lazy first load, pagination,
  loading/error/retry state, and data-change subscriptions. Use the generated
  CommandService through the existing service registration mechanism.
- Load only when History is opened. On successful mutations for that entity,
  invalidate/refetch the first page if visible, otherwise mark it stale. Reset
  paging and ignore stale responses when changing record/table or disposing.
  Failed saves must not add optimistic history entries.
- Keep the edit form/store alive when switching tabs so autosave, pending changes,
  focus, and dirty state are not accidentally reset or flushed by unmounting.
  History reflects committed values, not unsaved drafts. Creation success may
  transition to the normal detail view with history available.
- Render operation, timestamp, actor, and compact per-attribute old/new values.
  Use existing user/reference lookups; retain raw IDs for missing/deleted users
  or references and raw keys for attributes no longer in the schema. Show
  absent, null, and empty-string values distinctly. Render historical HTML as
  escaped text, not executable markup, with expansion for long descriptions.
- Use `DataText` for values/actors, `ModelText` for known attribute labels, and
  ordinary text for UI controls. Keep the pane independently scrollable and
  provide empty, loading, retry, and load-more states.
- Preserve current behavior closing a detail pane when its entity disappears.
  Deleted history remains available through the command; a deleted-entity
  browser, revert action, and history-tab URL persistence are not required here.

## What are the implementation steps?

- [ ] Add documented mutation context/observation/collector types and extension
      point. Thread actor context through all mutation call sites and test-data
      helpers without changing existing chunking or transport contracts.
- [ ] Implement table-interest routing and preparation in `IndexedDataStore`;
      capture old states for tracked inserts/deletes and reuse update reads.
      Merge auxiliary entries into each chunk's single atomic KV transaction.
- [ ] Implement history serialization and the opt-in history contributor; register
      tickets/projects support before startup test-data insertion. Keep other
      entity tables and search indexes free of history data.
- [ ] Add bounded prefix/range pagination to the KV contract and redb, a narrow
      datastore history reader, generated command declarations, handler, and
      server-derived model capability metadata. Do not commit generated files.
- [ ] Add the history store/service integration and reusable history rendering;
      wire Details/History tabs into generic record details without moving
      orchestration back into JSX. Add a focused playground demo with create,
      update, delete, nullable, HTML, and unknown-user examples.
- [ ] Add backend transaction/recovery and API tests plus UI store/component
      tests. Document history semantics, extension constraints, system actor
      behavior, and key ordering in the server/UI READMEs.

## How will this be verified?

- [ ] Check create/update/delete changes, no-op updates, absent deletes,
      insert-overwrite behavior, repeated IDs/steps, null vs missing vs empty,
      user attribution, disabled tables, and old/new serialization round-trips.
- [ ] Use failure-injecting KV/search implementations to prove contributor failure
      and KV failure persist nothing for that chunk; indexing failure preserves
      history and dirty work; restart/replay creates no duplicate history.
      Test multi-chunk partial success and multiple contributors' output validation.
- [ ] Test real redb atomic entity/history writes, retained deleted history,
      table/prefix isolation, empty pages, bounded paging, cursor validation,
      unsupported tables, same-second KSUIDs, and restart persistence.
- [ ] Verify authenticated command attribution and system seeds, including
      non-null `userid = "system"` on system changes, rejection of null/missing
      history user IDs, projects/tickets enablement, and other tables remaining untracked.
- [ ] Test lazy UI loading, pagination, rapid selection changes, refresh after
      autosave/actions, failure/retry, deleted actors, escaped HTML, and preserved
      pending form state when switching tabs. Use store tests for orchestration.
- [ ] Check a representative 50,000-row seed/update chunk in an optimized build:
      no per-entity transactions, no full-history scans, no history in Tantivy,
      and bounded additional allocations. Batch old-value reads where useful.
- [ ] Run focused server/plugin/UI/codegen tests through `./t` or `./n`, then
      `./n check` and `./n --restart`. Leave visual verification to the user;
      do not open Chrome DevTools.

## Which assumptions and risks need confirmation?

1. **Extension name:** `MutationContributor` is the recommended working name:
   it describes contributing additional transactional writes, not just observing.
   Alternatives are `MutationEnricher` (emphasizes augmenting the mutation) and
   `TransactionContributor` (emphasizes atomic writes, but is less specific about
   the entity-mutation input). The extension still cannot rewrite the primary
   entity mutation or perform external side effects.
2. **Bucket layout:** assume a separate history bucket per entity table is
   acceptable. It preserves the requested key shape without relying on IDs
   being globally unique across unrelated tables.
3. **ID scope:** the first enabled entities use canonical KSUID strings. The
   underlying KV store allows arbitrary binary IDs; define a safe encoding
   before enabling this prefix scheme for those entities.
4. **Volume and privacy:** seed generation will produce history too, and deleted
   descriptions remain retained. History increases storage and write work;
   retention, sensitive-field exclusions, and a protected bulk-import bypass
   can follow, but clients must not be able to disable auditing in requests.
5. **Durability versus response success:** indexing can fail after history and
   entity commit. A failed HTTP mutation therefore does not prove nothing was
   stored. Preserve/document this existing behavior, and avoid presenting the
   audit trail as an all-or-nothing request log.
