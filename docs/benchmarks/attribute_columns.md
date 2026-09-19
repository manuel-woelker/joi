# Attribute Column Encoding Benchmark

## What was measured?

JSON, bincode, and FlatBuffers encoding of individual ticket entities,
one buffer per entity, with `Vec<AttributeColumn>` as the interface on
both ends: rows were materialized from columns through
`Values::value_at` for encoding and rebuilt back into columns after
decoding. The benchmark compared serialization and deserialization speed
as well as total encoded bytes.

The benchmark has since been removed from the tree; this document keeps
its setup and results. The last source is available in git history at
commit `344c6e8` under
`libs-rust/joi-server/benches/attribute_columns.rs`, runnable with
`./t cargo bench -p joi-server --bench attribute_columns` after restoring
it with its `criterion`, `bincode`, and `flatbuffers` dev-dependencies.

## How was the dataset built?

A bench-local `Ticket` struct mirrored the `tickets` table: `id`, `key`,
`project_id`, `title`, `description`, `status`, and `assignee`, with the
two reference attributes nullable. Contents were deterministic
(fixed-seed `xorshift64`): base62 identifiers shaped like KSUIDs,
`TEST-N` keys, sentence titles, multi-sentence descriptions, four
workflow statuses, and ~30% null assignees. Datasets held 1,000 and
10,000 rows. Each format round-tripped back to the original columns
before its timings were accepted.

## What were the results?

Measured 2026-09-19 on an AMD Ryzen 7 3700X (16 threads, x86_64) with
rustc 1.98.0 and criterion defaults (100 samples). Times are means across
all 10,000 entities; per-entity figures divide by 10,000.

Encoded size, one buffer per entity, bytes summed:

| rows   | json      | bincode         | flatbuffers       |
| ------ | --------- | --------------- | ----------------- |
| 1,000  | 388,584   | 309,078 (0.80x) | 395,560 (1.02x)   |
| 10,000 | 3,909,478 | 3,115,117 (0.80x) | 3,975,220 (1.02x) |

Serialize, 10,000 rows:

| format      | mean    | per entity | throughput |
| ----------- | ------- | ---------- | ---------- |
| json        | 4.45 ms | 445 ns     | 838 MiB/s  |
| bincode     | 3.60 ms | 360 ns     | 825 MiB/s  |
| flatbuffers | 6.22 ms | 622 ns     | 609 MiB/s  |

Deserialize including the rebuild into columns, 10,000 rows:

| format      | mean     | per entity | throughput |
| ----------- | -------- | ---------- | ---------- |
| json        | 11.36 ms | 1.14 µs    | 328 MiB/s  |
| bincode     | 7.68 ms  | 768 ns     | 387 MiB/s  |
| flatbuffers | 5.80 ms  | 580 ns     | 654 MiB/s  |

## What did we learn?

Bincode was smallest and fastest to write. FlatBuffers was slowest to
write (one builder and vtable per entity) but fastest to read back,
since field access is offset arithmetic with no parsing. JSON paid
per-row key repetition on write and full text parsing on read.

## What should I watch out for when comparing future runs?

- Numbers are machine-dependent; rerun on the hardware you care about
  rather than comparing across machines.
- Criterion stored baselines under `target/criterion` and reported
  changes against them. Warnings from a short sampling run compared to a
  full run were noise; deleting that directory reset baselines.
- FlatBuffers skipped buffer verification because the benchmark decoded
  its own output, matching serde_json and bincode, which validate only by
  parsing. Untrusted input would add verification cost on the FlatBuffers
  side.
- The FlatBuffers schema was deliberately naive (repeated strings, no
  pooling, absent nullable fields). An optimized schema — status as an
  enum, pooled strings — would shrink it; see the layout notes on the
  encoder before drawing format conclusions.
