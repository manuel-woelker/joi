# Query Backend Benchmark

## What was measured?

SQLite and Tantivy were compared using equivalent on-disk stores containing
1,000,000 deterministic ticket records. The benchmark covered warmed queries
for:

- A page of 100 tickets filtered by status and sorted by ticket number.
- A page filtered by multiple statuses, project, and assignee.
- Total counts for both simple and compound filters.
- Counts grouped by status.
- Counts grouped by assignee after applying project and status filters.

SQLite used indexes tailored to the tested filters and sorting. Tantivy used
indexed exact-value fields, a fast ticket-number field for sorting, and facet
fields for grouped counts. Each workload was warmed five times and sampled 40
times. Both implementations returned the same result before their timings were
accepted.

These are warmed on-disk results. The operating-system page cache was not
cleared between samples, so they do not represent cold-start I/O.

## What were the results?

The following median timings were recorded on the development machine:

| Workload | SQLite | Tantivy | Tantivy / SQLite |
| --- | ---: | ---: | ---: |
| Status-filtered rows | 0.074 ms | 4.873 ms | 65.46x |
| Compound-filtered rows | 0.115 ms | 13.064 ms | 114.06x |
| Status count | 9.050 ms | 0.393 ms | 0.04x |
| Compound count | 9.558 ms | 8.907 ms | 0.93x |
| Count grouped by status | 66.025 ms | 8.367 ms | 0.13x |
| Filtered count grouped by assignee | 539.740 ms | 14.107 ms | 0.03x |

Total indexing time was 4.229 seconds for SQLite and 3.084 seconds for Tantivy.

## What did we learn?

SQLite's purpose-built indexes were substantially faster for retrieving small,
sorted pages. Tantivy was substantially faster for broad counts and grouped
facet calculations. A compound count with selective predicates was effectively
tied.

The results do not justify replacing SQLite for normal entity retrieval.
Tantivy remains worth considering as a secondary index when full-text search or
frequent broad facet aggregation becomes an important workload. Such an index
would add synchronization, storage, and operational complexity, so it should be
introduced only after production measurements demonstrate the need.
