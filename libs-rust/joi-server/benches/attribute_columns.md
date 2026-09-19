# Attribute column encoding benchmark

## What does this benchmark measure?

How fast JSON, bincode, and FlatBuffers encode individual ticket entities
to bytes and decode them back, and how large the encoded bytes are.
Each ticket travels through `Vec<AttributeColumn>` on both ends: rows are
materialized from columns through `Values::value_at` for encoding and
rebuilt back into columns after decoding, mirroring entity storage where
every entity owns its bytes.

The benchmark lives in `attribute_columns.rs` next to this file.

## How is the dataset built?

A bench-local `Ticket` struct mirrors the `tickets` table: `id`, `key`,
`project_id`, `title`, `description`, `status`, and `assignee`, with the
two reference attributes nullable. Contents are deterministic (fixed-seed
`xorshift64`): base62 identifiers shaped like KSUIDs, `TEST-N` keys,
sentence titles, multi-sentence descriptions, four workflow statuses,
and ~30% null assignees. Datasets hold 1,000 and 10,000 rows.

## How do I run it?

From the repository root:

```sh
./t cargo bench -p joi-server --bench attribute_columns
```

The run first prints total encoded bytes per format, then criterion
reports per-iteration times and byte throughput for `serialize/*` and
`deserialize/*` at each row count. Smaller runs for iteration speed accept
criterion's own flags, for example `-- --measurement-time 1 --sample-size 10`.

## What did the full 10,000-row run show?

Measured 2026-09-19 on an AMD Ryzen 7 3700X (16 threads, x86_64) with
rustc 1.98.0, criterion defaults (100 samples), at commit `344c6e8`.
Times are means across all 10,000 entities; per-entity figures divide by
10,000.

Encoded size (one buffer per entity, bytes summed):

| rows  | json    | bincode | flatbuffers |
| ----- | ------- | ------- | ----------- |
| 1,000 | 388,584 | 309,078 (0.80x) | 395,560 (1.02x) |
| 10,000 | 3,909,478 | 3,115,117 (0.80x) | 3,975,220 (1.02x) |

Serialize, 10,000 rows:

| format     | mean   | per entity | throughput |
| ---------- | ------ | ---------- | ---------- |
| json       | 4.45 ms | 445 ns    | 838 MiB/s  |
| bincode    | 3.60 ms | 360 ns    | 825 MiB/s  |
| flatbuffers | 6.22 ms | 622 ns   | 609 MiB/s  |

Deserialize including the rebuild into columns, 10,000 rows:

| format     | mean    | per entity | throughput |
| ---------- | ------- | ---------- | ---------- |
| json       | 11.36 ms | 1.14 µs   | 328 MiB/s  |
| bincode    | 7.68 ms  | 768 ns    | 387 MiB/s  |
| flatbuffers | 5.80 ms | 580 ns    | 654 MiB/s  |

Reading: bincode is smallest and fastest to write. FlatBuffers is
slowest to write (one builder and vtable per entity) but fastest to read
back, since field access is offset arithmetic with no parsing. JSON pays
per-row key repetition on write and full text parsing on read.

## What should I watch out for when comparing runs?

- Numbers are machine-dependent; rerun on the hardware you care about
  rather than comparing across machines.
- Criterion stores baselines under `target/criterion` and reports changes
  against them. Warnings from a short sampling run compared to a full run
  are noise; delete the directory to reset baselines.
- FlatBuffers skips buffer verification because the benchmark decodes its
  own output, matching serde_json and bincode, which validate only by
  parsing. Untrusted input would add verification cost on the FlatBuffers
  side.
- The FlatBuffers schema is deliberately naive (repeated strings, byte
  null bitmap). An optimized schema — status as an enum, pooled strings —
  would shrink it; see the layout notes on `encode_flatbuffers_ticket`
  before drawing format conclusions.
